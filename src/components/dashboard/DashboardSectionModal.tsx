"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import DashboardIcon from "./DashboardIcon";
import IconPickerPopover from "./IconPickerPopover";
import type { DashboardSection } from "@/lib/types";

interface DashboardSectionModalProps {
  isOpen: boolean;
  section?: DashboardSection | null;  // null = create mode
  onClose: () => void;
  onSave: (fields: { name: string; icon: string; color: string }) => void;
}

export default function DashboardSectionModal({
  isOpen,
  section,
  onClose,
  onSave,
}: DashboardSectionModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(section?.name || "");
      setIcon(section?.icon || "");
      setColor(section?.color || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, section]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, color });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{section ? "Edit Section" : "New Section"}</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">
              Section name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monitoring, Infrastructure..."
              className="modal-input"
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Icon</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="emoji, si-name, lucide-name, or URL"
                className="modal-input flex-1"
              />
              <IconPickerPopover onSelect={setIcon} />
              <DashboardIcon icon={icon} size={24} />
            </div>
            <p className="text-xs text-text-muted mt-1">
              Examples: 🖥️, si-grafana, hl-portainer, lucide-server, or upload.
            </p>
          </div>

          <div className="modal-field">
            <label className="modal-label">Accent colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color || "#6366f1"}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#6366f1"
                className="modal-input flex-1"
              />
              {color && (
                <button type="button" onClick={() => setColor("")} className="text-xs text-text-muted hover:text-text-secondary">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">Cancel</button>
            <button type="submit" disabled={!name.trim()} className="modal-btn-primary">
              {section ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
