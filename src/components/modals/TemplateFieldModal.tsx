"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { TplField, TplFieldType, TplFieldDateFormat, TplFieldEmptyBehavior } from "@/lib/types";

interface TemplateFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (field: TplField) => void;
  initial?: Partial<TplField>;
}

export default function TemplateFieldModal({
  isOpen,
  onClose,
  onConfirm,
  initial,
}: TemplateFieldModalProps) {
  const [name, setName]               = useState("");
  const [type, setType]               = useState<TplFieldType>("text");
  const [required, setRequired]       = useState(false);
  const [hint, setHint]               = useState("");
  const [defaultValue, setDefault]    = useState("");
  const [options, setOptions]         = useState<string[]>(["Option 1", "Option 2"]);
  const [newOption, setNewOption]     = useState("");
  const [dateFormat, setDateFormat]   = useState<TplFieldDateFormat>("Long");
  const [emptyBehavior, setEmptyBehavior] = useState<TplFieldEmptyBehavior>("empty");
  const [trueLabel, setTrueLabel]     = useState("Yes");
  const [falseLabel, setFalseLabel]   = useState("No");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name ?? "");
      setType(initial?.type ?? "text");
      setRequired(initial?.required ?? false);
      setHint(initial?.hint ?? "");
      setDefault(initial?.defaultValue ?? "");
      setOptions(initial?.options?.length ? initial.options : ["Option 1", "Option 2"]);
      setDateFormat(initial?.dateFormat ?? "Long");
      setEmptyBehavior(initial?.emptyBehavior ?? "empty");
      setTrueLabel(initial?.trueLabel ?? "Yes");
      setFalseLabel(initial?.falseLabel ?? "No");
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const addOption = () => {
    const v = newOption.trim();
    if (v && !options.includes(v)) { setOptions([...options, v]); setNewOption(""); }
  };
  const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));
  const onOptionKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } };

  const hasOptions = type === "dropdown" || type === "radio" || type === "multiselect";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const field: TplField = {
      name: name.trim(),
      type,
      required,
      hint,
      defaultValue:
        type === "date"    ? defaultValue
        : type === "boolean" ? (defaultValue === "true" ? "true" : "false")
        : hasOptions       ? (defaultValue || options[0] || "")
        : defaultValue,
      emptyBehavior,
      ...(hasOptions       ? { options: options.filter(o => o.trim()) } : {}),
      ...(type === "date"  ? { dateFormat }                              : {}),
      ...(type === "boolean" ? { trueLabel: trueLabel || "Yes", falseLabel: falseLabel || "No" } : {}),
    };
    onConfirm(field);
    onClose();
  };

  if (!isOpen) return null;

  const TYPE_BTNS: { value: TplFieldType; label: string; desc: string }[] = [
    { value: "text",        label: "T  Text",        desc: "Single-line text" },
    { value: "textarea",    label: "¶  Long text",    desc: "Multi-line text" },
    { value: "number",      label: "#  Number",       desc: "Numeric value" },
    { value: "dropdown",    label: "▾  Dropdown",     desc: "Single select from a list" },
    { value: "radio",       label: "◉  Radio",        desc: "Single select as radio buttons" },
    { value: "multiselect", label: "☑  Multi-select",  desc: "Multiple selections from a list" },
    { value: "date",        label: "D  Date",         desc: "Date value" },
    { value: "time",        label: "⏱  Time",         desc: "Time value" },
    { value: "boolean",     label: "✓  Boolean",      desc: "True/false checkbox" },
    { value: "url",         label: "↗  URL",          desc: "Web address" },
    { value: "email",       label: "@  Email",        desc: "Email address" },
  ];

  const DATE_FORMATS: { value: TplFieldDateFormat; example: string }[] = [
    { value: "Long", example: "March 7, 2025" },
    { value: "EU",   example: "07/03/2025"    },
    { value: "US",   example: "3/7/2025"      },
    { value: "ISO",  example: "2025-03-07"    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Template Field</h2>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ maxHeight: "80vh", overflowY: "auto" }}>
          {/* Field name */}
          <div className="modal-field">
            <label className="modal-label">Field name <span className="text-red-400">*</span></label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Author, Status, Meeting Date"
              className="modal-input"
              required
            />
          </div>

          {/* Type grid */}
          <div className="modal-field">
            <label className="modal-label">Type</label>
            <div className="tpl-type-grid">
              {TYPE_BTNS.map(btn => (
                <button
                  key={btn.value}
                  type="button"
                  onClick={() => setType(btn.value)}
                  className={`tpl-type-btn${type === btn.value ? " active" : ""}`}
                  title={btn.desc}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options (dropdown / radio / multiselect) */}
          {hasOptions && (
            <div className="modal-field">
              <label className="modal-label">Options</label>
              <div className="space-y-1 mb-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 text-sm px-2 py-1 bg-muted rounded-md text-text-secondary">{opt}</span>
                    <button type="button" onClick={() => removeOption(i)} className="text-text-muted hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOption}
                  onChange={e => setNewOption(e.target.value)}
                  onKeyDown={onOptionKey}
                  placeholder="New option…"
                  className="modal-input flex-1"
                />
                <button type="button" onClick={addOption} className="modal-btn-cancel px-3">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Boolean labels */}
          {type === "boolean" && (
            <div className="modal-field">
              <label className="modal-label">Labels</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-muted mb-1 block">When checked</label>
                  <input
                    type="text"
                    value={trueLabel}
                    onChange={e => setTrueLabel(e.target.value)}
                    placeholder="Yes"
                    className="modal-input"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-muted mb-1 block">When unchecked</label>
                  <input
                    type="text"
                    value={falseLabel}
                    onChange={e => setFalseLabel(e.target.value)}
                    placeholder="No"
                    className="modal-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Date format */}
          {type === "date" && (
            <div className="modal-field">
              <label className="modal-label">Date format</label>
              <div className="flex flex-wrap gap-2">
                {DATE_FORMATS.map(df => (
                  <button
                    key={df.value}
                    type="button"
                    onClick={() => setDateFormat(df.value)}
                    className={`tpl-type-btn${dateFormat === df.value ? " active" : ""}`}
                    title={df.example}
                  >
                    {df.value} <span className="text-xs opacity-70">({df.example})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Default value */}
          {type === "date" && (
            <div className="modal-field">
              <label className="modal-label">Default value</label>
              <select value={defaultValue} onChange={e => setDefault(e.target.value)} className="modal-input">
                <option value="today">Today (auto-fill)</option>
                <option value="">No default</option>
              </select>
            </div>
          )}
          {(type === "dropdown" || type === "radio") && (
            <div className="modal-field">
              <label className="modal-label">Default option</label>
              <select value={defaultValue} onChange={e => setDefault(e.target.value)} className="modal-input">
                <option value="">No default</option>
                {options.filter(o => o.trim()).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          )}
          {type === "boolean" && (
            <div className="modal-field">
              <label className="modal-label">Default state</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultValue === "true"}
                  onChange={e => setDefault(e.target.checked ? "true" : "false")}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-sm text-text-secondary">
                  Checked by default ({defaultValue === "true" ? (trueLabel || "Yes") : (falseLabel || "No")})
                </span>
              </label>
            </div>
          )}
          {type !== "date" && type !== "dropdown" && type !== "radio" && type !== "multiselect" && type !== "boolean" && (
            <div className="modal-field">
              <label className="modal-label">Default value</label>
              <input
                type={type === "number" ? "number" : type === "time" ? "time" : "text"}
                value={defaultValue}
                onChange={e => setDefault(e.target.value)}
                placeholder="Leave blank for none"
                className="modal-input"
              />
            </div>
          )}

          {/* Hint */}
          <div className="modal-field">
            <label className="modal-label">Hint <span className="text-text-muted text-xs">(shown in fill form)</span></label>
            <input
              type="text"
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder="e.g. Full name of the document author"
              className="modal-input"
            />
          </div>

          {/* Required */}
          <div className="flex items-center gap-2 mb-2">
            <input
              id="tpl-required"
              type="checkbox"
              checked={required}
              onChange={e => setRequired(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <label htmlFor="tpl-required" className="text-sm text-text-secondary cursor-pointer select-none">
              {type === "boolean" ? "Required (must be checked)" :
               type === "multiselect" ? "Required (at least one selection)" :
               "Required field"}
            </label>
          </div>

          {/* Empty behavior — not shown for boolean (always has a value) */}
          {type !== "boolean" && (
            <div className="modal-field">
              <label className="modal-label">If left empty</label>
              <div className="flex gap-2">
                {([
                  { value: "empty",   label: "Leave blank" },
                  { value: "default", label: "Use default" },
                  { value: "keep",    label: "Keep [Name]"  },
                ] as { value: TplFieldEmptyBehavior; label: string }[]).map(eb => (
                  <button
                    key={eb.value}
                    type="button"
                    onClick={() => setEmptyBehavior(eb.value)}
                    className={`tpl-type-btn${emptyBehavior === eb.value ? " active" : ""}`}
                  >
                    {eb.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">Cancel</button>
            <button type="submit" disabled={!name.trim()} className="modal-btn-primary">
              Insert Field
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
