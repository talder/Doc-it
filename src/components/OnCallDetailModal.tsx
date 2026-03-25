"use client";

import { useState } from "react";
import { X, Pencil, Check, Loader2 } from "lucide-react";
import { MiniEditor } from "./OnCallModal";
import type { OnCallEntry } from "@/lib/oncall-shared";
import { formatWorkingTime } from "@/lib/oncall-shared";

function stripHtml(html: string) { return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

/* ── Solution Editor Modal ─────────────────────────────────────────────────── */

function SolutionEditorModal({ entry, onClose, onSaved }: { entry: OnCallEntry; onClose: () => void; onSaved: (entry: OnCallEntry) => void }) {
  const [html, setHtml] = useState(entry.solution ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/oncall/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solution: html }),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved(data.entry);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  };

  return (
    <div className="cl-modal-overlay" style={{ zIndex: 510 }} onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            <span className="cl-detail-id">{entry.id}</span>
            Edit Solution
          </h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <MiniEditor initialContent={entry.solution ?? ""} onChange={setHtml} placeholder="Describe the solution or paste a link…" />
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary flex items-center gap-1" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save solution"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Modal ──────────────────────────────────────────────────────────── */

interface OnCallDetailModalProps {
  entry: OnCallEntry | null;
  onClose: () => void;
  onSolutionSaved?: (entry: OnCallEntry) => void;
}

export default function OnCallDetailModal({ entry, onClose, onSolutionSaved }: OnCallDetailModalProps) {
  const [showSolutionEditor, setShowSolutionEditor] = useState(false);

  if (!entry) return null;

  const hasSolution = stripHtml(entry.solution ?? "").length > 0;

  const handleSolutionSaved = (updated: OnCallEntry) => {
    setShowSolutionEditor(false);
    onSolutionSaved?.(updated);
  };

  return (
    <>
      <div className="cl-modal-overlay" onClick={onClose}>
        <div className="cl-modal cl-modal--detail" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header">
            <h2 className="cl-modal-title">
              <span className="cl-detail-id">{entry.id}</span>
              On-Call Report
            </h2>
            <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
          </div>

          <div className="cl-modal-body">
            <div className="cl-confirm-grid">
              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Registrar</span>
                <span>{entry.registrar}</span>
              </div>
              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Date</span>
                <span>{entry.date}</span>
              </div>
              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Time</span>
                <span>{entry.time}</span>
              </div>
              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Working time</span>
                <span>{formatWorkingTime(entry.workingMinutes)}</span>
              </div>
              <div className="cl-confirm-row cl-confirm-row--block">
                <span className="cl-confirm-label">Problem</span>
                <div dangerouslySetInnerHTML={{ __html: entry.description }} className="oc-confirm-html" />
              </div>

              {/* Solution — read-only with edit button */}
              <div className="cl-confirm-row cl-confirm-row--block">
                <div className="flex items-center justify-between mb-1">
                  <span className="cl-confirm-label">Solution</span>
                  <button
                    onClick={() => setShowSolutionEditor(true)}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Pencil className="w-3 h-3" />
                    {hasSolution ? "Edit" : "Add solution"}
                  </button>
                </div>
                {hasSolution ? (
                  <div dangerouslySetInnerHTML={{ __html: entry.solution }} className="oc-confirm-html" />
                ) : (
                  <p className="text-sm text-text-muted italic">No solution recorded yet.</p>
                )}
              </div>

              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Logged at</span>
                <span className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              {entry.updatedAt !== entry.createdAt && (
                <div className="cl-confirm-row">
                  <span className="cl-confirm-label">Solution updated</span>
                  <span className="text-xs text-text-muted">{new Date(entry.updatedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSolutionEditor && (
        <SolutionEditorModal
          entry={entry}
          onClose={() => setShowSolutionEditor(false)}
          onSaved={handleSolutionSaved}
        />
      )}
    </>
  );
}
