"use client";

import { useState, useEffect, useRef } from "react";
import { X, Pencil, Trash2, Check, Hash } from "lucide-react";
import type { TagsIndex } from "@/lib/types";

const TAG_PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

interface TagManagerModalProps {
  isOpen: boolean;
  tagsIndex: TagsIndex;
  tagColors: Record<string, string>;
  spaceSlug: string;
  onClose: () => void;
  onRefresh: () => void;
}

export default function TagManagerModal({
  isOpen,
  tagsIndex,
  tagColors,
  spaceSlug,
  onClose,
  onRefresh,
}: TagManagerModalProps) {
  const [localColors, setLocalColors] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalColors({ ...tagColors });
      setRenaming(null);
      setDeleting(null);
      setColorPickerTag(null);
    }
  }, [isOpen, tagColors]);

  useEffect(() => {
    if (renaming) {
      setTimeout(() => {
        renameRef.current?.focus();
        renameRef.current?.select();
      }, 50);
    }
  }, [renaming]);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerTag) return;
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorPickerTag(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colorPickerTag]);

  if (!isOpen) return null;

  const tags = Object.values(tagsIndex).sort((a, b) => a.name.localeCompare(b.name));

  const handleColorChange = async (tag: string, color: string | null) => {
    const next = { ...localColors };
    if (color) {
      next[tag] = color;
    } else {
      delete next[tag];
    }
    setLocalColors(next);
    // Persist to server
    await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/customization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagColors: { [tag]: color || null } }),
    });
    onRefresh();
  };

  const handleRename = async (oldName: string) => {
    const newName = renameValue.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "");
    if (!newName || newName === oldName) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });
    setBusy(false);
    if (res.ok) {
      setRenaming(null);
      onRefresh();
    }
  };

  const handleDelete = async (tagName: string) => {
    setBusy(true);
    await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagName }),
    });
    setBusy(false);
    setDeleting(null);
    onRefresh();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Tag Manager</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: 0 }}>
          {tags.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-text-muted">No tags in this space</div>
          ) : (
            <div>
              {tags.map((tag) => {
                const color = localColors[tag.name];
                const isRenaming = renaming === tag.name;
                const isDeleting = deleting === tag.name;
                const isColorOpen = colorPickerTag === tag.name;

                return (
                  <div
                    key={tag.name}
                    className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors group"
                  >
                    {/* Color dot / picker trigger */}
                    <div className="relative" ref={isColorOpen ? colorRef : undefined}>
                      <button
                        className="w-5 h-5 rounded-full border border-border flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110"
                        style={color ? { background: color, borderColor: color } : undefined}
                        onClick={() => setColorPickerTag(isColorOpen ? null : tag.name)}
                        title="Set color"
                      >
                        {!color && <Hash className="w-3 h-3 text-text-muted" />}
                      </button>

                      {isColorOpen && (
                        <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg p-2 w-[200px]">
                          <div className="grid grid-cols-5 gap-1.5 mb-2">
                            {TAG_PRESET_COLORS.map((c) => (
                              <button
                                key={c}
                                className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? "border-text-primary scale-110" : "border-transparent"}`}
                                style={{ background: c }}
                                onClick={() => {
                                  handleColorChange(tag.name, c);
                                  setColorPickerTag(null);
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={color || "#3b82f6"}
                              onChange={(e) => {
                                handleColorChange(tag.name, e.target.value);
                              }}
                              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                              title="Custom color"
                            />
                            <span className="text-[10px] text-text-muted">Custom</span>
                            {color && (
                              <button
                                className="ml-auto text-[10px] text-text-muted hover:text-red-500"
                                onClick={() => {
                                  handleColorChange(tag.name, null);
                                  setColorPickerTag(null);
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tag name / rename */}
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRename(tag.name);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            ref={renameRef}
                            className="flex-1 text-sm border border-border rounded px-2 py-0.5 bg-surface text-text-primary outline-none focus:border-accent"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            disabled={busy}
                          />
                          <button
                            type="submit"
                            disabled={busy || !renameValue.trim()}
                            className="p-1 rounded hover:bg-accent/10 text-accent"
                            title="Confirm rename"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium text-text-primary truncate"
                            style={color ? { color } : undefined}
                          >
                            #{tag.name}
                          </span>
                          <span className="text-[10px] text-text-muted flex-shrink-0">
                            {tag.totalCount} {tag.totalCount === 1 ? "doc" : "docs"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isRenaming && !isDeleting && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1 rounded hover:bg-muted text-text-muted hover:text-text-primary"
                          onClick={() => {
                            setRenaming(tag.name);
                            setRenameValue(tag.name);
                            setDeleting(null);
                            setColorPickerTag(null);
                          }}
                          title="Rename tag"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500"
                          onClick={() => {
                            setDeleting(tag.name);
                            setRenaming(null);
                            setColorPickerTag(null);
                          }}
                          title="Delete tag"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-500 font-medium">
                          Remove from {tag.totalCount} {tag.totalCount === 1 ? "doc" : "docs"}?
                        </span>
                        <button
                          className="px-2 py-0.5 rounded bg-red-500 text-white font-medium hover:bg-red-600"
                          onClick={() => handleDelete(tag.name)}
                          disabled={busy}
                        >
                          {busy ? "…" : "Delete"}
                        </button>
                        <button
                          className="px-2 py-0.5 rounded text-text-muted hover:text-text-primary"
                          onClick={() => setDeleting(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ padding: "12px 20px" }}>
          <button onClick={onClose} className="modal-btn-cancel">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
