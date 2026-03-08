"use client";

import { useEffect, useRef, useState } from "react";
import { X, Sigma } from "lucide-react";
import katex from "katex";

interface MathEditorModalProps {
  isOpen: boolean;
  initialLatex?: string;
  onClose: () => void;
  onConfirm: (latex: string) => void;
}

export default function MathEditorModal({
  isOpen,
  initialLatex = "",
  onClose,
  onConfirm,
}: MathEditorModalProps) {
  const [value, setValue] = useState(initialLatex);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialLatex);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialLatex]);

  // Live KaTeX preview
  useEffect(() => {
    if (!previewRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      previewRef.current.textContent = "Type LaTeX to preview…";
      previewRef.current.className = "math-editor-preview math-editor-preview--empty";
      return;
    }
    try {
      katex.render(trimmed, previewRef.current, { throwOnError: true, displayMode: false });
      previewRef.current.className = "math-editor-preview";
    } catch {
      previewRef.current.textContent = trimmed;
      previewRef.current.className = "math-editor-preview math-editor-preview--error";
    }
  }, [value]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Sigma className="w-4 h-4 text-accent" />
            <h2 className="modal-title">Equation Editor</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="modal-body">
          <div
            ref={previewRef}
            className="math-editor-preview math-editor-preview--empty"
          >
            Type LaTeX to preview…
          </div>
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            placeholder="e.g. E = mc^2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="modal-btn-primary"
              disabled={!value.trim()}
            >
              {initialLatex ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
