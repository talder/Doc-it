"use client";

import { useState, useEffect, useRef } from "react";
import { X, Folder, ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";

interface CreateCategoryModalProps {
  isOpen: boolean;
  categories: Category[];
  defaultParent?: string;
  onClose: () => void;
  onCreate: (name: string, parent?: string) => void;
}

export default function CreateCategoryModal({
  isOpen,
  categories,
  defaultParent,
  onClose,
  onCreate,
}: CreateCategoryModalProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState(defaultParent || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setParent(defaultParent || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultParent]);

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
    onCreate(name.trim(), parent || undefined);
    onClose();
  };

  const selectedLabel = parent
    ? categories.find((c) => c.path === parent)?.name || parent
    : "No parent (root level)";

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create a new category</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Parent Category (Optional)</label>
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
                  <button
                    type="button"
                    className={`modal-dropdown-item${!parent ? " active" : ""}`}
                    onClick={() => { setParent(""); setDropdownOpen(false); }}
                  >
                    No parent (root level)
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.path}
                      type="button"
                      className={`modal-dropdown-item${parent === cat.path ? " active" : ""}`}
                      style={{ paddingLeft: `${12 + cat.level * 16}px` }}
                      onClick={() => { setParent(cat.path); setDropdownOpen(false); }}
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
              Category name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter category name..."
              className="modal-input"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className="modal-btn-primary">
              Create category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
