"use client";

import { useState, useEffect, useRef } from "react";
import { X, Folder, ChevronDown, FolderInput } from "lucide-react";
import type { Category } from "@/lib/types";

interface MoveDocModalProps {
  isOpen: boolean;
  docName: string;
  currentCategory: string;
  categories: Category[];
  onClose: () => void;
  onMove: (toCategory: string) => void;
}

export default function MoveDocModal({
  isOpen,
  docName,
  currentCategory,
  categories,
  onClose,
  onMove,
}: MoveDocModalProps) {
  const [targetCategory, setTargetCategory] = useState(currentCategory);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setTargetCategory(currentCategory);
  }, [isOpen, currentCategory]);

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

  const selectedLabel = categories.find((c) => c.path === targetCategory)?.name || targetCategory;
  const isSameCategory = targetCategory === currentCategory;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSameCategory) return;
    onMove(targetCategory);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title flex items-center gap-2">
            <FolderInput className="w-4 h-4" />
            Move document
          </h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Document</label>
            <p className="modal-input bg-[var(--color-muted)] text-text-secondary cursor-default select-none truncate">
              {docName}.md
            </p>
          </div>

          <div className="modal-field">
            <label className="modal-label">Move to category</label>
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
                      className={`modal-dropdown-item${targetCategory === cat.path ? " active" : ""}`}
                      style={{ paddingLeft: `${12 + cat.level * 16}px` }}
                      onClick={() => { setTargetCategory(cat.path); setDropdownOpen(false); }}
                    >
                      {cat.name}
                      {cat.path === currentCategory && (
                        <span className="ml-2 text-xs text-text-muted">(current)</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={isSameCategory} className="modal-btn-primary">
              Move document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
