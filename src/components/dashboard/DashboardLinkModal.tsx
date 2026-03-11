"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import DashboardIcon from "./DashboardIcon";
import IconPickerPopover from "./IconPickerPopover";
import type { DashboardLink, DashboardSection, UserGroup } from "@/lib/types";

interface DashboardLinkModalProps {
  isOpen: boolean;
  link?: DashboardLink | null;
  sections: DashboardSection[];
  userGroups: UserGroup[];
  defaultSectionId?: string;
  onClose: () => void;
  onSave: (fields: {
    title: string;
    url: string;
    description: string;
    icon: string;
    color: string;
    openInNewTab: boolean;
    sectionId: string;
    visibleToGroups: string[];
  }) => void;
}

export default function DashboardLinkModal({
  isOpen,
  link,
  sections,
  userGroups,
  defaultSectionId,
  onClose,
  onSave,
}: DashboardLinkModalProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("favicon");
  const [color, setColor] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(true);
  const [sectionId, setSectionId] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the section color for a given section id
  const getSectionColor = (sid: string) => sections.find((s) => s.id === sid)?.color || "";

  useEffect(() => {
    if (isOpen) {
      const resolvedSectionId = link?.sectionId || defaultSectionId || sections[0]?.id || "";
      setTitle(link?.title || "");
      setUrl(link?.url || "");
      setDescription(link?.description || "");
      setIcon(link?.icon || "favicon");
      setColor(link?.color || getSectionColor(resolvedSectionId));
      setOpenInNewTab(link?.openInNewTab ?? true);
      setSectionId(resolvedSectionId);
      setSelectedGroups(link?.visibleToGroups || []);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, link, defaultSectionId, sections]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !sectionId) return;
    onSave({
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      icon,
      color,
      openInNewTab,
      sectionId,
      visibleToGroups: selectedGroups,
    });
    onClose();
  };

  const toggleGroup = (gid: string) => {
    setSelectedGroups((prev) =>
      prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]
    );
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">{link ? "Edit Link" : "New Link"}</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Title */}
          <div className="modal-field">
            <label className="modal-label">Title <span className="text-red-400">*</span></label>
            <input ref={inputRef} type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Service" className="modal-input" required />
          </div>

          {/* URL */}
          <div className="modal-field">
            <label className="modal-label">URL <span className="text-red-400">*</span></label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="modal-input" required />
          </div>

          {/* Description */}
          <div className="modal-field">
            <label className="modal-label">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional short description" className="modal-input" />
          </div>

          {/* Icon */}
          <div className="modal-field">
            <label className="modal-label">Icon</label>
            <div className="flex items-center gap-2">
              <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="favicon, emoji, si-*, lucide-*, or URL" className="modal-input flex-1" />
              <IconPickerPopover onSelect={setIcon} />
              <DashboardIcon icon={icon} url={url} size={24} />
            </div>
            <p className="text-xs text-text-muted mt-1">
              &quot;favicon&quot; auto-fetches from the URL. Or use: 🚀, si-grafana, hl-portainer, lucide-server, or upload.
            </p>
          </div>

          {/* Colour + open in new tab row */}
          <div className="flex gap-4">
            <div className="modal-field flex-1">
              <label className="modal-label">Accent colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color || "#6366f1"} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#hex" className="modal-input flex-1" />
              </div>
            </div>
            <div className="modal-field" style={{ minWidth: 120 }}>
              <label className="modal-label">Open in new tab</label>
              <button
                type="button"
                onClick={() => setOpenInNewTab(!openInNewTab)}
                className={`w-full h-10 rounded-lg border text-sm font-medium transition-colors ${
                  openInNewTab
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-text-muted border-border hover:bg-muted"
                }`}
              >
                {openInNewTab ? "Yes" : "No"}
              </button>
            </div>
          </div>

          {/* Section */}
          <div className="modal-field">
            <label className="modal-label">Section <span className="text-red-400">*</span></label>
            <select
              value={sectionId}
              onChange={(e) => {
                const newSid = e.target.value;
                // If color still matches old section color (or is empty), inherit the new section's color
                const oldSectionColor = getSectionColor(sectionId);
                if (!color || color === oldSectionColor) {
                  setColor(getSectionColor(newSid));
                }
                setSectionId(newSid);
              }}
              className="modal-input"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Visible to user groups */}
          {userGroups.length > 0 && (
            <div className="modal-field">
              <label className="modal-label">Visible to groups</label>
              <p className="text-xs text-text-muted mb-1.5">Leave all unchecked = visible to everyone.</p>
              <div className="flex flex-wrap gap-2">
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedGroups.includes(g.id)
                        ? "bg-accent text-white border-accent"
                        : "bg-surface text-text-secondary border-border hover:bg-muted"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn-cancel">Cancel</button>
            <button type="submit" disabled={!title.trim() || !url.trim() || !sectionId} className="modal-btn-primary">
              {link ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
