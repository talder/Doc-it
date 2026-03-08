"use client";

import { useState, useEffect, useRef } from "react";
import { X, Folder, ChevronDown, LayoutTemplate } from "lucide-react";
import type { Category, TemplateInfo, TplField, TplFieldDateFormat } from "@/lib/types";
import { fromSafeB64 } from "@/lib/base64";

interface TemplateFormModalProps {
  isOpen: boolean;
  template: TemplateInfo | null;
  categories: Category[];
  onClose: () => void;
  onCreate: (name: string, category: string, content: string) => void;
}

// ── Date formatting helpers ──────────────────────────────────────────────────
function formatDate(date: Date, fmt: TplFieldDateFormat): string {
  switch (fmt) {
    case "ISO":  return date.toISOString().slice(0, 10);
    case "EU":   return date.toLocaleDateString("en-GB");
    case "US":   return date.toLocaleDateString("en-US");
    case "Long": return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
}

// ── Apply field values to raw template HTML ──────────────────────────────────
function applyTemplateValues(rawHtml: string, fields: TplField[], values: Record<string, string>): string {
  return rawHtml.replace(
    /(<span[^>]*data-tpl-field="([A-Za-z0-9+/=_-]+)"[^>]*>)[^<]*(<\/span>)/g,
    (_match, _open, b64) => {
      let field: TplField | null = null;
      try { field = fromSafeB64(b64) as TplField; } catch { /* ignore */ }
      if (!field) return _match;

      const rawValue = values[field.name] ?? "";
      let resolved = "";

      if (field.type === "boolean") {
        // Always emits the configured label
        resolved = rawValue === "true"
          ? (field.trueLabel ?? "Yes")
          : (field.falseLabel ?? "No");
      } else if (field.type === "multiselect") {
        let arr: string[] = [];
        try { arr = JSON.parse(rawValue || "[]"); } catch {}
        if (arr.length === 0) {
          switch (field.emptyBehavior) {
            case "empty":   resolved = ""; break;
            case "default": resolved = field.defaultValue ?? ""; break;
            case "keep":    resolved = `[${field.name}]`; break;
          }
        } else {
          resolved = arr.map(o => `- ${o}`).join("\n");
        }
      } else {
        const userValue = rawValue.trim();
        resolved = userValue;
        if (!userValue) {
          switch (field.emptyBehavior) {
            case "empty":   resolved = ""; break;
            case "default":
              if (field.type === "date" && field.defaultValue === "today") {
                resolved = formatDate(new Date(), field.dateFormat ?? "Long");
              } else {
                resolved = field.defaultValue ?? "";
              }
              break;
            case "keep":    resolved = `[${field.name}]`; break;
          }
        } else if (field.type === "date") {
          const d = new Date(userValue);
          if (!isNaN(d.getTime())) resolved = formatDate(d, field.dateFormat ?? "Long");
        }
      }

      return resolved;
    }
  );
}

export default function TemplateFormModal({
  isOpen,
  template,
  categories,
  onClose,
  onCreate,
}: TemplateFormModalProps) {
  const [docName, setDocName]         = useState("");
  const [category, setCategory]       = useState("");
  const [values, setValues]           = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const nameRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Non-template categories only
  const nonTplCategories = categories.filter(
    (c) => c.path !== "Templates" && !c.path.startsWith("Templates/")
  );

  useEffect(() => {
    if (isOpen && template) {
      setDocName("");
      setCategory(nonTplCategories[0]?.path ?? "");
      // Pre-fill defaults
      const init: Record<string, string> = {};
      for (const f of template.fields) {
        if (f.type === "date" && f.defaultValue === "today") {
          init[f.name] = new Date().toISOString().slice(0, 10);
        } else if (f.type === "boolean") {
          init[f.name] = f.defaultValue === "true" ? "true" : "false";
        } else if (f.type === "multiselect") {
          init[f.name] = "[]";
        } else {
          init[f.name] = f.defaultValue ?? "";
        }
      }
      setValues(init);
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [isOpen, template]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  if (!isOpen || !template) return null;

  const canSubmit = () => {
    if (!docName.trim()) return false;
    for (const f of template.fields) {
      if (!f.required) continue;
      if (f.type === "multiselect") {
        try { if (JSON.parse(values[f.name] || "[]").length === 0) return false; } catch { return false; }
      } else if (f.type === "boolean") {
        if (values[f.name] !== "true") return false;
      } else {
        if (!(values[f.name] ?? "").trim()) return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;

    // Fetch template raw content
    let rawContent = "";
    try {
      const qs = new URLSearchParams({ category: template.category, isTemplate: "true" });
      const res = await fetch(
        `/api/spaces/${template.space}/docs/${encodeURIComponent(template.name)}?${qs}`
      );
      if (res.ok) {
        const json = await res.json();
        rawContent = json.content ?? "";
      }
    } catch { /* ignore */ }

    const applied = applyTemplateValues(rawContent, template.fields, values);
    onCreate(docName.trim(), category, applied);
    onClose();
  };

  const setValue = (fieldName: string, val: string) =>
    setValues((prev) => ({ ...prev, [fieldName]: val }));

  const selectedCatLabel = nonTplCategories.find((c) => c.path === category)?.name ?? category;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 tpl-folder-icon" />
            <h2 className="modal-title">Create from template: {template.name}</h2>
          </div>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Category */}
          <div className="modal-field">
            <label className="modal-label">Category</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="modal-select"
              >
                <Folder className="w-4 h-4 text-text-muted" />
                <span className="flex-1 text-left truncate">{selectedCatLabel || "Select category…"}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform${dropdownOpen ? " rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="modal-dropdown">
                  {nonTplCategories.map((cat) => (
                    <button
                      key={cat.path}
                      type="button"
                      className={`modal-dropdown-item${category === cat.path ? " active" : ""}`}
                      style={{ paddingLeft: `${12 + cat.level * 16}px` }}
                      onClick={() => { setCategory(cat.path); setDropdownOpen(false); }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document name */}
          <div className="modal-field">
            <label className="modal-label">Document name <span className="text-red-400">*</span></label>
            <input
              ref={nameRef}
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Enter document name…"
              className="modal-input"
              required
            />
          </div>

          {/* Field values */}
          {template.fields.length > 0 && (
            <div className="tpl-form-fields">
              <div className="tpl-form-fields-title">Fill in template fields</div>
              {template.fields.map((field) => (
                <div key={field.name} className="modal-field">
                  <label className="modal-label">
                    {field.name}
                    {field.required && <span className="text-red-400"> *</span>}
                    {field.hint && (
                      <span className="text-text-muted text-xs font-normal ml-1">— {field.hint}</span>
                    )}
                  </label>

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || `Enter ${field.name}…`}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "textarea" && (
                    <textarea
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || `Enter ${field.name}…`}
                      className="modal-input"
                      rows={3}
                      required={field.required}
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || "0"}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "url" && (
                    <input
                      type="url"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || "https://…"}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "email" && (
                    <input
                      type="email"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || "name@example.com"}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "dropdown" && (
                    <select
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="modal-input"
                      required={field.required}
                    >
                      {!field.required && <option value="">— choose —</option>}
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "radio" && (
                    <div className="tpl-form-radio-group">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt} className="tpl-form-radio-item">
                          <input
                            type="radio"
                            name={`radio-${field.name}`}
                            value={opt}
                            checked={values[field.name] === opt}
                            onChange={() => setValue(field.name, opt)}
                            className="w-4 h-4 accent-accent flex-shrink-0"
                            required={field.required}
                          />
                          <span className="text-sm text-text-secondary">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === "multiselect" && (
                    <div className="tpl-form-radio-group">
                      {(field.options ?? []).map((opt) => {
                        const selected: string[] = (() => { try { return JSON.parse(values[field.name] || "[]"); } catch { return []; } })();
                        return (
                          <label key={opt} className="tpl-form-radio-item">
                            <input
                              type="checkbox"
                              checked={selected.includes(opt)}
                              onChange={(e) => {
                                const curr: string[] = (() => { try { return JSON.parse(values[field.name] || "[]"); } catch { return []; } })();
                                setValue(field.name, JSON.stringify(
                                  e.target.checked ? [...curr, opt] : curr.filter(o => o !== opt)
                                ));
                              }}
                              className="w-4 h-4 accent-accent flex-shrink-0"
                            />
                            <span className="text-sm text-text-secondary">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "time" && (
                    <input
                      type="time"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "boolean" && (
                    <label className="tpl-form-boolean">
                      <input
                        type="checkbox"
                        checked={values[field.name] === "true"}
                        onChange={(e) => setValue(field.name, e.target.checked ? "true" : "false")}
                        className="w-4 h-4 accent-accent flex-shrink-0"
                      />
                      <span className="text-sm text-text-secondary">
                        {values[field.name] === "true"
                          ? (field.trueLabel ?? "Yes")
                          : (field.falseLabel ?? "No")}
                      </span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">Cancel</button>
            <button type="submit" disabled={!canSubmit()} className="modal-btn-primary">
              Create Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
