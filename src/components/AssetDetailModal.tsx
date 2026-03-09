"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import type { Asset, AssetContainer, CustomFieldDef } from "@/lib/assets";

interface ChangeEntry { id: string; date: string; category: string; description: string; risk: string; status: string }

interface Props {
  asset: Asset | null;
  containers: AssetContainer[];
  customFieldDefs: CustomFieldDef[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (id: string) => Promise<void>;
}

const STATUS_CLASS: Record<string, string> = {
  Active: "am-status--active",
  Maintenance: "am-status--maintenance",
  Decommissioned: "am-status--decommissioned",
  Ordered: "am-status--ordered",
};

export default function AssetDetailModal({ asset, containers, customFieldDefs, onClose, onEdit, onDelete }: Props) {
  const [changes, setChanges] = useState<ChangeEntry[]>([]);

  useEffect(() => {
    if (!asset) return;
    fetch(`/api/changelog?system=${encodeURIComponent(asset.name)}`)
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((d) => setChanges(d.entries || []))
      .catch(() => setChanges([]));
  }, [asset]);

  if (!asset) return null;

  const container = containers.find((c) => c.id === asset.containerId);

  const handleDelete = async () => {
    if (!confirm(`Delete asset "${asset.name}" (${asset.id})?`)) return;
    await onDelete(asset.id);
    onClose();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal cl-modal--detail" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            <span className="cl-detail-id">{asset.id}</span>
            {asset.name}
          </h2>
          <div className="flex items-center gap-1">
            <button className="cl-modal-close" onClick={() => onEdit(asset)} title="Edit"><Pencil className="w-4 h-4" /></button>
            <button className="cl-modal-close" onClick={handleDelete} title="Delete"><Trash2 className="w-4 h-4" /></button>
            <button className="cl-modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="cl-modal-body">
          <div className="cl-confirm-grid">
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Status</span>
              <span className={`cl-badge ${STATUS_CLASS[asset.status] || ""}`}>{asset.status}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Group</span>
              <span>{container?.name || "—"}</span>
            </div>
            {asset.type && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Type</span><span>{asset.type}</span></div>
            )}
            {asset.ipAddresses.length > 0 && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">IP</span><span>{asset.ipAddresses.join(", ")}</span></div>
            )}
            {asset.os && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">OS</span><span>{asset.os}</span></div>
            )}
            {asset.location && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Location</span><span>{asset.location}</span></div>
            )}
            {asset.owner && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Owner</span><span>{asset.owner}</span></div>
            )}
            {asset.purchaseDate && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Purchased</span><span>{asset.purchaseDate}</span></div>
            )}
            {asset.warrantyExpiry && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Warranty</span><span>{asset.warrantyExpiry}</span></div>
            )}
            {asset.notes && (
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Notes</span><p>{asset.notes}</p></div>
            )}

            {/* Custom fields */}
            {customFieldDefs.map((def) => {
              const val = asset.customFields[def.id];
              if (val === undefined || val === "") return null;
              const display = def.type === "boolean" ? (val ? "Yes" : "No")
                : def.type === "url" ? <a href={String(val)} target="_blank" rel="noreferrer" className="cl-link">{String(val)}</a>
                : String(val);
              return (
                <div key={def.id} className="cl-confirm-row">
                  <span className="cl-confirm-label">{def.name}</span>
                  <span>{display}</span>
                </div>
              );
            })}

            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Created</span>
              <span className="text-xs text-text-muted">{asset.createdBy} · {new Date(asset.createdAt).toLocaleString()}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Updated</span>
              <span className="text-xs text-text-muted">{asset.updatedBy} · {new Date(asset.updatedAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Related changes */}
          {changes.length > 0 && (
            <div className="am-related-changes">
              <h4 className="cl-label" style={{ marginBottom: 6 }}>Related Changes</h4>
              {changes.slice(0, 10).map((c) => (
                <a key={c.id} href="/changelog" className="am-related-change">
                  <span className="am-rc-id">{c.id}</span>
                  <span className="am-rc-desc">{c.description.slice(0, 60)}</span>
                  <span className="am-rc-date">{c.date}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
