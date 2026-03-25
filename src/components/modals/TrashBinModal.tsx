"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw, Trash2, FileText, Database } from "lucide-react";

interface TrashItem {
  id: string;
  name: string;
  category: string;
  filename: string;
  deletedBy: string;
  deletedAt: string;
  isTemplate?: boolean;
  itemType?: "document" | "database";
  dbId?: string;
}

interface TrashBinModalProps {
  isOpen: boolean;
  spaceSlug: string | null;
  onClose: () => void;
  onRestored: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TrashBinModal({ isOpen, spaceSlug, onClose, onRestored }: TrashBinModalProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !spaceSlug) return;
    setLoading(true);
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/trash`)
      .then((r) => (r.ok ? r.json() : { items: [], retentionDays: 30 }))
      .then((data) => {
        setItems(data.items || []);
        setRetentionDays(data.retentionDays || 30);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, spaceSlug]);

  const handleAction = async (id: string, action: "restore" | "delete") => {
    if (!spaceSlug) return;
    if (action === "delete" && !window.confirm("Permanently delete this document? This cannot be undone.")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        if (action === "restore") onRestored();
      }
    } catch {}
    setActionId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Recycle Bin</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Items are automatically deleted after {retentionDays} days
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-text-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-text-muted text-center py-8">Loading…</p>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-text-muted">
              <Trash2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Recycle bin is empty</p>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors"
                >
                  {item.itemType === "database" ? (
                    <Database className="w-4 h-4 flex-shrink-0" style={{ color: "#14b8a6" }} />
                  ) : (
                    <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.name}
                      {item.isTemplate && <span className="text-[10px] text-text-muted ml-1">(template)</span>}
                      {item.itemType === "database" && <span className="text-[10px] text-text-muted ml-1">(enhanced table)</span>}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {item.itemType === "database" ? "" : `${item.category} · `}deleted by {item.deletedBy} · {timeAgo(item.deletedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleAction(item.id, "restore")}
                      disabled={actionId === item.id}
                      className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleAction(item.id, "delete")}
                      disabled={actionId === item.id}
                      className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
