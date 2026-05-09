"use client";

import { useState } from "react";
import { X, RotateCcw, Check, XCircle, ChevronRight, Zap } from "lucide-react";
import type { ChangeLogEntry, ChangeLifecycleStatus } from "@/lib/changelog";
import { allowedTransitions, isTerminal } from "@/lib/changelog";

const RISK_COLORS: Record<string, string> = { Low:"cl-risk--low", Medium:"cl-risk--medium", High:"cl-risk--high", Critical:"cl-risk--critical" };
const STATUS_COLORS: Record<string, string> = {
  Draft:"bg-gray-100 text-gray-700 border-gray-200", Submitted:"bg-blue-100 text-blue-800 border-blue-200",
  "Under Review":"bg-cyan-100 text-cyan-800 border-cyan-200", "CAB Approval":"bg-purple-100 text-purple-800 border-purple-200",
  Approved:"bg-green-100 text-green-800 border-green-200", Implementing:"bg-amber-100 text-amber-800 border-amber-200",
  Closed:"bg-gray-100 text-gray-600 border-gray-200", Rejected:"bg-red-100 text-red-800 border-red-200",
  Failed:"bg-red-100 text-red-800 border-red-200", "Rolled Back":"bg-orange-100 text-orange-800 border-orange-200",
  Completed:"bg-gray-100 text-gray-600 border-gray-200", Planned:"bg-blue-100 text-blue-800 border-blue-200",
  "In Progress":"bg-amber-100 text-amber-800 border-amber-200",
};
const TYPE_COLORS: Record<string, string> = {
  Standard:"bg-green-100 text-green-800 border-green-200",
  Normal:"bg-blue-100 text-blue-800 border-blue-200",
  Emergency:"bg-red-100 text-red-800 border-red-200",
};

interface Props {
  entry: ChangeLogEntry | null;
  onClose: () => void;
  onLogRollback?: (entry: ChangeLogEntry) => void;
  onUpdated?: (entry: ChangeLogEntry) => void;
  currentUser?: string;
  isCabMember?: boolean;
}

export default function ChangeLogDetailModal({ entry, onClose, onLogRollback, onUpdated, currentUser = "", isCabMember = false }: Props) {
  const [pirNotes, setPirNotes] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [localEntry, setLocalEntry] = useState<ChangeLogEntry | null>(null);

  const e = localEntry || entry;
  if (!e) return null;

  const transitions = allowedTransitions(e);
  const closed = isTerminal(e.status);
  const canRollback = (e.status === "Closed" || e.status === "Completed") && onLogRollback;
  const showPir = e.status === "Implementing" || e.status === "Closed" || e.status === "Completed";
  const myApproval = e.approvals?.find(a => a.username === currentUser);

  const doTransition = async (newStatus: ChangeLifecycleStatus) => {
    setSaving(newStatus);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if ((newStatus === "Closed" || newStatus === "Implementing") && pirNotes.trim()) body.pirNotes = pirNotes.trim();
      const res = await fetch(`/api/changelog/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        const d = await res.json();
        setLocalEntry(d.entry);
        onUpdated?.(d.entry);
      }
    } finally { setSaving(null); }
  };

  const doApproval = async (decision: "Approved" | "Rejected") => {
    setSaving(decision);
    try {
      const res = await fetch(`/api/changelog/${e.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: approvalComment.trim() || undefined }) });
      if (res.ok) {
        const d = await res.json();
        setLocalEntry(d.entry);
        onUpdated?.(d.entry);
        setApprovalComment("");
      }
    } finally { setSaving(null); }
  };

  const savePir = async () => {
    if (!pirNotes.trim()) return;
    setSaving("pir");
    try {
      const res = await fetch(`/api/changelog/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pirNotes: pirNotes.trim() }) });
      if (res.ok) { const d = await res.json(); setLocalEntry(d.entry); onUpdated?.(d.entry); setPirNotes(""); }
    } finally { setSaving(null); }
  };

  const statusBtnStyle = (s: ChangeLifecycleStatus) => {
    if (s === "Closed" || s === "Approved") return "bg-green-600 text-white hover:bg-green-700";
    if (s === "Rejected" || s === "Failed") return "bg-red-600 text-white hover:bg-red-700";
    if (s === "Rolled Back") return "bg-orange-500 text-white hover:bg-orange-600";
    if (s === "Implementing") return "bg-amber-500 text-white hover:bg-amber-600";
    return "bg-accent text-white hover:bg-accent/90";
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal cl-modal--detail" style={{ maxWidth: 680 }} onClick={e2 => e2.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="cl-detail-id flex-shrink-0">{e.id}</span>
            <span className={`cl-badge border text-[10px] flex-shrink-0 ${TYPE_COLORS[e.changeType || "Normal"]}`}>
              {e.changeType === "Emergency" && <Zap className="w-3 h-3 inline mr-1" />}
              {e.changeType || "Normal"}
            </span>
            <span className={`cl-badge border text-[10px] flex-shrink-0 ${STATUS_COLORS[e.status] || ""}`}>{e.status}</span>
            <span className="text-sm font-medium text-text-primary truncate">{e.category} — {e.system}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canRollback && (
              <button onClick={() => { onLogRollback!(e); onClose(); }}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100">
                <RotateCcw className="w-3.5 h-3.5" /> Log Rollback
              </button>
            )}
            <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="cl-modal-body overflow-y-auto" style={{ maxHeight: "75vh" }}>
          {/* Core fields */}
          <div className="cl-confirm-grid">
            <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{e.date}{e.time ? ` at ${e.time}` : ""}</span></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Author</span><span>{e.author}</span></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">System</span><a href="/cmdb" className="cl-link font-medium">{e.system}</a></div>
            <div className="cl-confirm-row"><span className="cl-confirm-label">Risk</span><span className={`cl-badge ${RISK_COLORS[e.risk] || ""}`}>{e.risk}</span></div>
            {e.plannedStart && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Change Window</span>
                <span>{new Date(e.plannedStart).toLocaleString()}{e.plannedEnd ? ` → ${new Date(e.plannedEnd).toLocaleString()}` : ""}</span>
              </div>
            )}
            {e.downtimeMinutes !== undefined && <div className="cl-confirm-row"><span className="cl-confirm-label">Est. Downtime</span><span>{e.downtimeMinutes} min</span></div>}
            {e.rollbackOf && <div className="cl-confirm-row"><span className="cl-confirm-label">Rollback of</span><span className="font-mono text-amber-700">{e.rollbackOf}</span></div>}
            {e.relatedCrId && <div className="cl-confirm-row"><span className="cl-confirm-label">CMDB RFC</span><a href="/cmdb" className="cl-link font-mono">{e.relatedCrId}</a></div>}
            <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Description</span><p className="whitespace-pre-wrap">{e.description}</p></div>
            <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Impact</span><p className="whitespace-pre-wrap">{e.impact}</p></div>
            {e.backoutPlan && <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Backout Plan</span><p className="whitespace-pre-wrap bg-amber-50 border-l-2 border-amber-300 p-2 rounded">{e.backoutPlan}</p></div>}
            {e.closedAt && <div className="cl-confirm-row"><span className="cl-confirm-label">Closed At</span><span>{new Date(e.closedAt).toLocaleString()}</span></div>}
          </div>

          {/* Approvals panel */}
          {!closed && ((e.approvals && e.approvals.length > 0) || !myApproval) && (
            <div className="mt-4 p-3 border border-border rounded-lg">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Approvals</h4>
              {e.approvals && e.approvals.length > 0 && (
                <div className="space-y-2 mb-3">
                  {e.approvals.map((a, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${a.decision === "Approved" ? "bg-green-50 border-green-200" : a.decision === "Rejected" ? "bg-red-50 border-red-200" : "bg-surface-alt border-border"}`}>
                      <div>
                        <span className="font-medium">{a.username}</span>
                        {a.role && <span className="text-text-muted ml-1">({a.role})</span>}
                        {a.comment && <p className="text-text-muted mt-0.5">{a.comment}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {a.decision === "Approved" && <Check className="w-3.5 h-3.5 text-green-600" />}
                        {a.decision === "Rejected" && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                        <span className="font-semibold">{a.decision}</span>
                        {a.decidedAt && <span className="text-text-muted">{new Date(a.decidedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Current user approval buttons */}
              {!myApproval && (isCabMember || true) && (
                <div className="space-y-2">
                  <textarea className="cl-textarea text-xs" rows={2} placeholder="Optional comment…" value={approvalComment} onChange={e2 => setApprovalComment(e2.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => doApproval("Approved")} disabled={!!saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" /> {saving === "Approved" ? "…" : "Approve"}
                    </button>
                    <button onClick={() => doApproval("Rejected")} disabled={!!saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" /> {saving === "Rejected" ? "…" : "Reject"}
                    </button>
                  </div>
                </div>
              )}
              {myApproval && <p className="text-xs text-text-muted text-center">You have already {myApproval.decision.toLowerCase()} this change.</p>}
            </div>
          )}

          {/* PIR section */}
          {showPir && (
            <div className="mt-4 p-3 border border-border rounded-lg">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Post-Implementation Review</h4>
              {e.pirNotes && <p className="text-sm text-text-primary whitespace-pre-wrap mb-3 bg-surface-alt p-2 rounded">{e.pirNotes}</p>}
              {!closed && (
                <>
                  <textarea className="cl-textarea text-xs" rows={3}
                    placeholder="Did the change achieve its goal? Any issues? Lessons learned?"
                    value={pirNotes} onChange={e2 => setPirNotes(e2.target.value)} />
                  <button onClick={savePir} disabled={!pirNotes.trim() || saving === "pir"}
                    className="mt-2 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">
                    {saving === "pir" ? "Saving…" : "Save PIR Notes"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Status transitions */}
          {!closed && transitions.length > 0 && (
            <div className="mt-4 p-3 border border-border rounded-lg">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Move to next status</h4>
              <div className="flex flex-wrap gap-2">
                {transitions.map(t => (
                  <button key={t} onClick={() => doTransition(t)} disabled={!!saving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 ${statusBtnStyle(t)}`}>
                    <ChevronRight className="w-3 h-3" /> {saving === t ? "…" : t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Change history */}
          {e.history && e.history.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">History</h4>
              <div className="space-y-1.5">
                {[...e.history].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                    <span className="text-text-secondary font-medium flex-shrink-0">{h.by}</span>
                    <span>changed <span className="font-mono text-accent">{h.field}</span></span>
                    {h.field !== "approval" && <span>→ <span className="text-text-primary">{String(h.newValue)}</span></span>}
                    <span className="ml-auto flex-shrink-0">{new Date(h.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
