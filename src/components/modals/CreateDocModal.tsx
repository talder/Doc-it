"use client";

import { useState, useEffect, useRef } from "react";
import { X, Folder, ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";

interface CreateDocModalProps {
  isOpen: boolean;
  categories: Category[];
  defaultCategory?: string;
  onClose: () => void;
  onCreate: (name: string, category: string) => void;
}

export default function CreateDocModal({
  isOpen,
  categories,
  defaultCategory,
  onClose,
  onCreate,
}: CreateDocModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory || categories[0]?.path || "General");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
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
    if (!name.trim()) return;
    onCreate(name.trim(), category);
    onClose();
  };

  const selectedLabel = categories.find((c) => c.path === category)?.name || category;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create a new document</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

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
              className="modal-input"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className="modal-btn-primary">
              Create document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
