"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, History, RotateCcw, Clock } from "lucide-react";

interface Revision {
  rev: number;
  timestamp: string;
  username: string;
  size: number;
}

interface HistoryModalProps {
  isOpen: boolean;
  spaceSlug: string | null;
  docName: string | null;
  category: string | null;
  currentContent: string;
  onClose: () => void;
  onRestore: (rev: number) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// --- Simple line-based diff (LCS) ---

type DiffLine =
  | { type: "equal"; line: string }
  | { type: "add"; line: string }
  | { type: "remove"; line: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.push({ type: "equal", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.push({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      diff.push({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }
  return diff.reverse();
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const lines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const l of lines) {
      if (l.type === "add") added++;
      if (l.type === "remove") removed++;
    }
    return { added, removed };
  }, [lines]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs">
        {stats.added > 0 && <span className="diff-stat-add">+{stats.added} added</span>}
        {stats.removed > 0 && <span className="diff-stat-remove">&minus;{stats.removed} removed</span>}
        {stats.added === 0 && stats.removed === 0 && (
          <span className="text-text-muted">No changes</span>
        )}
      </div>
      <div className="diff-container">
        {lines.map((l, idx) => (
          <div
            key={idx}
            className={`diff-line${l.type === "add" ? " diff-add" : l.type === "remove" ? " diff-remove" : ""}`}
          >
            <span className="diff-gutter">
              {l.type === "add" ? "+" : l.type === "remove" ? "\u2212" : " "}
            </span>
            <span className="diff-text">{l.line || "\u00A0"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoryModal({
  isOpen, spaceSlug, docName, category, currentContent, onClose, onRestore,
}: HistoryModalProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewRev, setPreviewRev] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [restoring, setRestoring] = useState(false);

  const fetchRevisions = useCallback(async () => {
    if (!spaceSlug || !docName || !category) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/spaces/${spaceSlug}/docs/${encodeURIComponent(docName)}/history?category=${encodeURIComponent(category)}`
      );
      if (res.ok) {
        const data = await res.json();
        setRevisions(data.reverse());
      }
    } finally {
      setLoading(false);
    }
  }, [spaceSlug, docName, category]);

  useEffect(() => {
    if (isOpen) {
      setPreviewRev(null);
      setPreviewContent("");
      fetchRevisions();
    }
  }, [isOpen, fetchRevisions]);

  const handlePreview = async (rev: number) => {
    if (!spaceSlug || !docName || !category) return;
    setPreviewRev(rev);
    const res = await fetch(
      `/api/spaces/${spaceSlug}/docs/${encodeURIComponent(docName)}/history/${rev}?category=${encodeURIComponent(category)}`
    );
    if (res.ok) {
      const data = await res.json();
      setPreviewContent(data.content);
    }
  };

  const handleRestore = async (rev: number) => {
    setRestoring(true);
    try {
      onRestore(rev);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: 900, maxHeight: "85vh" }}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-text-muted" />
            <h2 className="modal-title">Revision history — {docName}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: "auto", maxHeight: "calc(85vh - 60px)", display: "flex", gap: 0 }}>
          {/* Revision list */}
          <div className="history-sidebar">
            {loading ? (
              <p className="text-sm text-text-muted py-4 px-3">Loading...</p>
            ) : revisions.length === 0 ? (
              <p className="text-sm text-text-muted py-4 px-3">No revisions yet</p>
            ) : (
              <div className="space-y-1 p-2">
                {revisions.map((r) => (
                  <button
                    key={r.rev}
                    onClick={() => handlePreview(r.rev)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      previewRev === r.rev
                        ? "bg-accent-light text-accent-text"
                        : "hover:bg-muted text-text-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Rev {r.rev}</span>
                      <span className="text-xs text-text-muted">{formatBytes(r.size)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-text-muted" />
                      <span className="text-xs text-text-muted">{relativeTime(r.timestamp)}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5 truncate">{r.username}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Diff / Compare pane */}
          <div className="history-diff-pane">
            {previewRev === null ? (
              <div className="flex items-center justify-center h-full text-text-muted text-sm py-12">
                Select a revision to compare with current version
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">Rev {previewRev}</span>
                    <span className="text-xs text-text-muted">vs current</span>
                  </div>
                  <button
                    onClick={() => handleRestore(previewRev)}
                    disabled={restoring}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:opacity-90 transition-opacity"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Revert to this revision
                  </button>
                </div>
                <DiffView oldContent={previewContent} newContent={currentContent} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
