"use client";

import { useState } from "react";
import { X, Link2, Search } from "lucide-react";
import type { CmdbItem, CmdbItemType, RelationshipTypeDef } from "@/lib/cmdb";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceAsset: CmdbItem;
  assets: CmdbItem[];
  assetTypes: CmdbItemType[];
  relationshipTypes: RelationshipTypeDef[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function CmdbRelationshipModal({ isOpen, onClose, sourceAsset, assets, assetTypes, relationshipTypes, onSave }: Props) {
  const [targetId, setTargetId] = useState("");
  const [typeId, setTypeId] = useState(relationshipTypes[0]?.id || "");
  const [label, setLabel] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const filtered = assets
    .filter((a) => a.id !== sourceAsset.id)
    .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!targetId || !typeId) return;
    setSaving(true);
    await onSave({ action: "addRelationship", sourceId: sourceAsset.id, targetId, typeId, label: label.trim() || undefined });
    setSaving(false);
    onClose();
  };

  const getTypeIcon = (a: CmdbItem) => {
    const t = assetTypes.find((t) => t.id === a.typeId);
    return t?.icon || "📦";
  };

  return (
    <div className="cl-modal-overlay" style={{ zIndex: 510 }} onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title"><Link2 className="w-4 h-4" /> Add Relationship</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <p className="text-xs text-text-muted mb-3">From: <strong>{sourceAsset.name}</strong> ({sourceAsset.id})</p>

          <div className="cl-field mb-3">
            <label className="cl-label">Relationship Type</label>
            <select className="cl-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {relationshipTypes.map((t) => <option key={t.id} value={t.id}>{t.label} / {t.inverseLabel}</option>)}
            </select>
          </div>

          <div className="cl-field mb-3">
            <label className="cl-label">Target CmdbItem</label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input className="cl-input" style={{ paddingLeft: 28 }} placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
              {filtered.slice(0, 50).map((a) => (
                <button
                  key={a.id}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors ${targetId === a.id ? "bg-accent-light font-medium" : ""}`}
                  onClick={() => setTargetId(a.id)}
                >
                  <span>{getTypeIcon(a)}</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-text-muted">{a.id}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-text-muted p-3 text-center">No assets found</p>}
            </div>
          </div>

          <div className="cl-field mb-3">
            <label className="cl-label">Note (optional)</label>
            <input className="cl-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Primary connection" />
          </div>

          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!targetId || !typeId || saving} onClick={handleSave}>
              {saving ? "Adding…" : "Add Relationship"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
