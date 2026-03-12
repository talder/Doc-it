"use client";

import { useState, useEffect, useRef } from "react";
import { X, Folder, ChevronDown, LayoutTemplate } from "lucide-react";
import type { Category, DocFile, TemplateInfo } from "@/lib/types";

interface CreateDocModalProps {
  isOpen: boolean;
  categories: Category[];
  defaultCategory?: string;
  onClose: () => void;
  onCreate: (name: string, category: string) => void;
  templates?: TemplateInfo[];
  onSelectTemplate?: (template: TemplateInfo) => void;
  docs?: DocFile[];
}

export default function CreateDocModal({
  isOpen,
  categories,
  defaultCategory,
  onClose,
  onCreate,
  templates,
  onSelectTemplate,
  docs = [],
}: CreateDocModalProps) {
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory || categories[0]?.path || "General");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isDuplicate = !!(name.trim()) && docs.some((d) => d.category === category && d.name.toLowerCase() === name.trim().toLowerCase() && !d.isTemplate);

  const hasTemplates = templates && templates.length > 0;

  useEffect(() => {
    if (isOpen) {
      setMode("blank");
      setName("");
      setCategory(defaultCategory || categories[0]?.path || "General");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultCategory, categories]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isDuplicate) return;
    onCreate(name.trim(), category);
    onClose();
  };

  const selectedLabel = categories.find((c) => c.path === category)?.name || category;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create a new document</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        {hasTemplates && (
          <div className="create-doc-tabs">
            <button
              type="button"
              className={`create-doc-tab${mode === "blank" ? " active" : ""}`}
              onClick={() => setMode("blank")}
            >
              Blank
            </button>
            <button
              type="button"
              className={`create-doc-tab${mode === "template" ? " active" : ""}`}
              onClick={() => setMode("template")}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              From Template
            </button>
          </div>
        )}

        {/* From Template grid */}
        {mode === "template" && hasTemplates && (
          <div className="modal-body">
            <div className="tpl-card-grid">
              {templates!.map((tpl) => (
                <button
                  key={`${tpl.category}/${tpl.name}`}
                  type="button"
                  className="tpl-card"
                  onClick={() => { onSelectTemplate?.(tpl); onClose(); }}
                >
                  <LayoutTemplate className="w-5 h-5 tpl-folder-icon mb-1" />
                  <span className="tpl-card-name">{tpl.name}</span>
                  {tpl.fields.length > 0 && (
                    <span className="tpl-card-badge">{tpl.fields.length} field{tpl.fields.length !== 1 ? "s" : ""}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Blank form */}
        {mode === "blank" && (
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Category</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="modal-select"
              >
                <Folder className="w-4 h-4 text-text-muted" />
                <span className="flex-1 text-left truncate">{selectedLabel}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform${dropdownOpen ? " rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="modal-dropdown">
                  {categories.map((cat) => (
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

          <div className="modal-field">
            <label className="modal-label">
              Document name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter document name..."
              className={`modal-input${isDuplicate ? " border-red-400" : ""}`}
              required
            />
            {isDuplicate && (
              <p className="text-xs text-red-400 mt-1">A document with this name already exists in this category</p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || isDuplicate} className="modal-btn-primary">
              Create document
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
