"use client";

import { useState, useEffect, useRef } from "react";
import { X, LayoutTemplate, ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";

interface NewTemplateModalProps {
  isOpen: boolean;
  defaultCategory?: string;
  templateCategories: Category[];
  onClose: () => void;
  onCreate: (name: string, category: string) => void;
}

export default function NewTemplateModal({
  isOpen,
  defaultCategory,
  templateCategories,
  onClose,
  onCreate,
}: NewTemplateModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory || "Templates");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategory(defaultCategory || templateCategories[0]?.path || "Templates");
      setDropdownOpen(false);
      setTimeout(() => { inputRef.current?.focus(); }, 100);
    }
  }, [isOpen, defaultCategory, templateCategories]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!name.trim()) return;
    onCreate(name.trim(), category);
    onClose();
  };

  const selectedLabel = templateCategories.find((c) => c.path === category)?.name ?? category;
  const showCategoryPicker = templateCategories.length > 1;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 tpl-folder-icon" />
            <h2 className="modal-title">New template</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {showCategoryPicker && (
            <div className="modal-field">
              <label className="modal-label">Category</label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="modal-select"
                >
                  <LayoutTemplate className="w-4 h-4 tpl-folder-icon" />
                  <span className="flex-1 text-left truncate">{selectedLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-text-muted transition-transform${dropdownOpen ? " rotate-180" : ""}`} />
                </button>
                {dropdownOpen && (
                  <div className="modal-dropdown">
                    {templateCategories.map((cat) => (
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
          )}

          <div className="modal-field">
            <label className="modal-label">
              Template name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter template name…"
              className="modal-input"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className="modal-btn-primary">
              Create template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
