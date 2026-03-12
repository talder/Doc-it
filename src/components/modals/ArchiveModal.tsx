"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Archive, RotateCcw, FileText, FolderOpen, Database } from "lucide-react";

interface ArchivedDoc {
  name: string;
  category: string;
  archivedAt: string;
}

interface ArchivedDb {
  id: string;
  title: string;
  createdAt: string;
}

interface ArchiveModalProps {
  isOpen: boolean;
  spaceSlug: string | null;
  onClose: () => void;
  onUnarchived: () => void;
}

export default function ArchiveModal({ isOpen, spaceSlug, onClose, onUnarchived }: ArchiveModalProps) {
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [archivedDbs, setArchivedDbs] = useState<ArchivedDb[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchArchive = useCallback(async () => {
    if (!spaceSlug) return;
    setLoading(true);
    try {
      const [docsRes, dbsRes] = await Promise.all([
        fetch(`/api/spaces/${spaceSlug}/archive`),
        fetch(`/api/spaces/${spaceSlug}/archive?type=databases`),
      ]);
      if (docsRes.ok) setDocs(await docsRes.json());
      if (dbsRes.ok) {
        const data = await dbsRes.json();
        setArchivedDbs(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [spaceSlug]);

  useEffect(() => {
    if (isOpen) fetchArchive();
  }, [isOpen, fetchArchive]);

  const handleUnarchive = async (doc: ArchivedDoc) => {
    if (!spaceSlug) return;
    const key = `${doc.category}/${doc.name}`;
    setRestoring(key);
    try {
      await fetch(`/api/spaces/${spaceSlug}/docs/${encodeURIComponent(doc.name)}/unarchive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: doc.category }),
      });
      await fetchArchive();
      onUnarchived();
    } finally {
      setRestoring(null);
    }
  };

  const handleUnarchiveDb = async (db: ArchivedDb) => {
    if (!spaceSlug) return;
    setRestoring(`db-${db.id}`);
    try {
      await fetch(`/api/spaces/${spaceSlug}/databases/${db.id}/archive`, {
        method: "DELETE",
      });
      await fetchArchive();
      onUnarchived();
    } finally {
      setRestoring(null);
    }
  };

  if (!isOpen) return null;

  // Group by category
  const grouped: Record<string, ArchivedDoc[]> = {};
  for (const doc of docs) {
    if (!grouped[doc.category]) grouped[doc.category] = [];
    grouped[doc.category].push(doc);
  }
  const categories = Object.keys(grouped).sort();

  return (
<div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" style={{ maxWidth: 600, maxHeight: "70vh" }}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-text-muted" />
            <h2 className="modal-title">Archive</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: "auto", maxHeight: "calc(70vh - 60px)" }}>
          {loading ? (
            <p className="text-sm text-text-muted text-center py-8">Loading...</p>
          ) : docs.length === 0 && archivedDbs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No archived items</p>
          ) : (
            <div className="space-y-4">
              {/* Archived databases */}
              {archivedDbs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Database className="w-3.5 h-3.5" style={{ color: "#14b8a6" }} />
                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Databases</span>
                  </div>
                  <div className="space-y-1">
                    {archivedDbs.map((db) => (
                      <div
                        key={db.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Database className="w-4 h-4 flex-shrink-0" style={{ color: "#14b8a6" }} />
                          <span className="text-sm text-text-primary truncate">{db.title}</span>
                        </div>
                        <button
                          onClick={() => handleUnarchiveDb(db)}
                          disabled={restoring === `db-${db.id}`}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors flex-shrink-0"
                        >
                          <RotateCcw className={`w-3 h-3${restoring === `db-${db.id}` ? " animate-spin" : ""}`} />
                          Unarchive
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Archived documents */}
              {categories.map((cat) => (
                <div key={cat}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{cat}</span>
                  </div>
                  <div className="space-y-1">
                    {grouped[cat].map((doc) => {
                      const key = `${doc.category}/${doc.name}`;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                            <span className="text-sm text-text-primary truncate">{doc.name}</span>
                            <span className="text-xs text-text-muted flex-shrink-0">
                              {new Date(doc.archivedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            onClick={() => handleUnarchive(doc)}
                            disabled={restoring === key}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors flex-shrink-0"
                          >
                            <RotateCcw className={`w-3 h-3${restoring === key ? " animate-spin" : ""}`} />
                            Unarchive
                          </button>
                        </div>
                      );
                    })}
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
