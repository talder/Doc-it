"use client";

import { X, RotateCcw } from "lucide-react";
import type { ChangeLogEntry } from "@/lib/changelog";

const RISK_COLORS: Record<string, string> = { Low: "cl-risk--low", Medium: "cl-risk--medium", High: "cl-risk--high", Critical: "cl-risk--critical" };
const STATUS_COLORS: Record<string, string> = { Completed: "cl-status--completed", Failed: "cl-status--failed", "Rolled Back": "cl-status--rolledback", Planned: "cl-status--planned", "In Progress": "cl-status--inprogress" };

interface Props {
  entry: ChangeLogEntry | null;
  onClose: () => void;
  onLogRollback?: (entry: ChangeLogEntry) => void;
}

export default function ChangeLogDetailModal({ entry, onClose, onLogRollback }: Props) {
  if (!entry) return null;

  const canRollback = entry.status === "Completed" || entry.status === "Failed";

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal cl-modal--detail" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            <span className="cl-detail-id">{entry.id}</span>
            {entry.category}
          </h2>
          <div className="flex items-center gap-2">
            {canRollback && onLogRollback && (
              <button
                onClick={() => { onLogRollback(entry); onClose(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                title="Log a rollback entry for this change"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Log Rollback
              </button>
            )}
            <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="cl-modal-body">
          <div className="cl-confirm-grid">
            <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{entry.date}{entry.time ? ` at ${entry.time}` : ""}</span></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Author</span><span>{entry.author}</span></div>
            {entry.approvedBy && <div className="cl-confirm-row"><span className="cl-confirm-label">Approved By</span><span>{entry.approvedBy}</span></div>}
            <div className="cl-confirm-row"><span className="cl-confirm-label">System</span><a href="/cmdb" className="cl-link font-medium">{entry.system}</a></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Category</span><span>{entry.category}</span></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Status</span><span className={`cl-badge ${STATUS_COLORS[entry.status] || ""}`}>{entry.status}</span></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Risk</span><span className={`cl-badge ${RISK_COLORS[entry.risk] || ""}`}>{entry.risk}</span></div>
            {entry.plannedStart && <div className="cl-confirm-row"><span className="cl-confirm-label">Planned Start</span><span>{new Date(entry.plannedStart).toLocaleString()}</span></div>}
            {entry.plannedEnd && <div className="cl-confirm-row"><span className="cl-confirm-label">Planned End</span><span>{new Date(entry.plannedEnd).toLocaleString()}</span></div>}
            {entry.rollbackOf && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Rollback of</span>
                <span className="font-mono text-amber-700">{entry.rollbackOf}</span>
              </div>
            )}
            {entry.relatedCrId && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">CMDB RFC</span>
                <a href="/cmdb" className="cl-link font-mono">{entry.relatedCrId}</a>
              </div>
            )}
            <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Description</span><p>{entry.description}</p></div>
            <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Impact</span><p>{entry.impact}</p></div>
            {entry.linkedDoc && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Linked Document</span>
                <a href={`/?space=${encodeURIComponent(entry.linkedDoc.spaceSlug)}&doc=${encodeURIComponent(entry.linkedDoc.name)}&cat=${encodeURIComponent(entry.linkedDoc.category)}`} className="cl-link">
                  {entry.linkedDoc.name}
                </a>
              </div>
            )}
            <div className="cl-confirm-row"><span className="cl-confirm-label">Logged at</span><span className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
