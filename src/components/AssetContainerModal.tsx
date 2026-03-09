"use client";

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { AssetContainer } from "@/lib/assets";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  containers: AssetContainer[];
  editContainer?: AssetContainer | null;
  onSave: (name: string, parentId: string | null) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

/** Build indented options for parent selector */
function buildOptions(containers: AssetContainer[], excludeId?: string): { id: string; label: string }[] {
  const childrenOf = (pid: string | null): AssetContainer[] =>
    containers.filter((c) => c.parentId === pid && c.id !== excludeId).sort((a, b) => a.order - b.order);

  const result: { id: string; label: string }[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const c of childrenOf(pid)) {
      result.push({ id: c.id, label: "\u00A0\u00A0".repeat(depth) + c.name });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

export default function AssetContainerModal({ isOpen, onClose, containers, editContainer, onSave, onDelete }: Props) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(editContainer?.name || "");
      setParentId(editContainer?.parentId ?? null);
      setSaving(false);
    }
  }, [isOpen, editContainer]);

  if (!isOpen) return null;

  const options = buildOptions(containers, editContainer?.id);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), parentId);
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!editContainer || !onDelete) return;
    if (!confirm(`Delete group "${editContainer.name}"?`)) return;
    await onDelete(editContainer.id);
    onClose();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{editContainer ? "Edit Group" : "New Group"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <div className="cl-field" style={{ marginBottom: 14 }}>
            <label className="cl-label">Name *</label>
            <input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Servers" autoFocus />
          </div>
          <div className="cl-field">
            <label className="cl-label">Parent group</label>
            <select className="cl-input" value={parentId || ""} onChange={(e) => setParentId(e.target.value || null)}>
              <option value="">— Root (top level) —</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="cl-modal-footer">
            {editContainer && onDelete && (
              <button className="cl-btn cl-btn--secondary" style={{ marginRight: "auto", color: "#dc2626" }} onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete
              </button>
            )}
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!name.trim() || saving} onClick={handleSubmit}>
              {saving ? "Saving…" : editContainer ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
