"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Clock, AlertTriangle, CheckCircle, Monitor, Paperclip, Lock, Tag } from "lucide-react";
import TicketCommentBox from "./TicketCommentBox";
import TicketCertPanel from "./TicketCertPanel";
import type { Ticket, HdGroup, HdCategory, HdFieldDef, TicketStatus, TicketPriority } from "@/lib/helpdesk";

const STATUSES: TicketStatus[] = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];
const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

interface TicketDetailPanelProps {
  ticketId: string | null;
  groups: HdGroup[];
  categories: HdCategory[];
  fieldDefs: HdFieldDef[];
  onClose: () => void;
  onUpdated: () => void;
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

function SlaIndicator({ label, due, met }: { label: string; due?: string; met?: boolean }) {
  if (!due) return null;
  const now = new Date();
  const dueDate = new Date(due);
  const breached = met === false || (met === undefined && now > dueDate);
  const metOk = met === true;

  return (
    <div className={`hd-sla-badge ${breached ? "hd-sla--breached" : metOk ? "hd-sla--met" : "hd-sla--pending"}`}>
      {breached ? <AlertTriangle className="w-3 h-3" /> : metOk ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      <span>{label}: {breached ? "Breached" : metOk ? "Met" : timeAgo(due) + " left"}</span>
    </div>
  );
}

export default function TicketDetailPanel({ ticketId, groups, categories, fieldDefs, onClose, onUpdated }: TicketDetailPanelProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/helpdesk/${encodeURIComponent(ticketId)}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } catch {}
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  if (!ticketId) return null;

  const post = async (body: Record<string, unknown>) => {
    await fetch("/api/helpdesk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await fetchTicket();
    onUpdated();
  };

  const catName = categories.find((c) => c.id === ticket?.category)?.name || ticket?.category || "—";
  const groupName = groups.find((g) => g.id === ticket?.assignedGroup)?.name;
  const groupMembers = ticket?.assignedGroup ? groups.find((g) => g.id === ticket.assignedGroup)?.members || [] : [];

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="hd-detail-panel" onClick={(e) => e.stopPropagation()}>
        {loading || !ticket ? (
          <div className="jp-empty">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="cl-modal-header">
              <div className="flex items-center gap-2">
                <span className="cl-detail-id">{ticket.id}</span>
                <span className={`cl-badge hd-priority--${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
                <span className={`cl-badge hd-status--${ticket.status.toLowerCase().replace(/\s+/g, "-")}`}>{ticket.status}</span>
              </div>
              <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
            </div>

            {/* Body */}
            <div className="hd-detail-body">
              {/* Left: ticket info + comments */}
              <div className="hd-detail-main">
                <h2 className="hd-detail-subject">{ticket.subject}</h2>
                <div className="hd-detail-meta">
                  <span>by <strong>{ticket.requester}</strong></span>
                  <span>{new Date(ticket.createdAt).toLocaleString()}</span>
                  {ticket.assetId && (
                    <a href="/cmdb" className="hd-detail-asset"><Monitor className="w-3 h-3" /> {ticket.assetId}</a>
                  )}
                </div>

                {/* SLA */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <SlaIndicator label="Response" due={ticket.slaResponseDue} met={ticket.slaResponseMet} />
                  <SlaIndicator label="Resolution" due={ticket.slaResolutionDue} met={ticket.slaResolutionMet} />
                </div>

                {/* Description */}
                {ticket.description && (
                  <div className="hd-detail-desc">{ticket.description}</div>
                )}

                {/* Attachments */}
                {ticket.attachments.length > 0 && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title"><Paperclip className="w-3 h-3" /> Attachments</h4>
                    {ticket.attachments.map((a) => (
                      <span key={a.id} className="hd-attach-chip">{a.originalName}</span>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {ticket.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {ticket.tags.map((t) => <span key={t} className="hd-tag"><Tag className="w-3 h-3" />{t}</span>)}
                  </div>
                )}

                {/* Custom fields */}
                {Object.keys(ticket.customFields).length > 0 && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title">Custom Fields</h4>
                    <div className="hd-detail-fields">
                      {Object.entries(ticket.customFields).map(([key, val]) => {
                        const def = fieldDefs.find((d) => d.id === key);
                        return (
                          <div key={key} className="hd-detail-field">
                            <span className="hd-detail-field-label">{def?.name || key}</span>
                            <span>{String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comment thread */}
                <div className="hd-detail-section">
                  <h4 className="hd-detail-section-title">Comments ({ticket.comments.length})</h4>
                  {ticket.comments.length === 0 && <p className="text-sm text-text-muted">No comments yet</p>}
                  {ticket.comments.map((c) => (
                    <div key={c.id} className={`hd-comment${c.isInternal ? " hd-comment--internal" : ""}`}>
                      <div className="hd-comment-header">
                        <strong>{c.author}</strong>
                        {c.isInternal && <span className="hd-comment-internal-badge"><Lock className="w-3 h-3" /> Internal</span>}
                        <span className="text-xs text-text-muted">{timeAgo(c.createdAt)}</span>
                      </div>
                      <div className="hd-comment-content">{c.content}</div>
                      {c.attachments.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.attachments.map((a) => <span key={a.id} className="hd-attach-chip">{a.originalName}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Certificate Request panel */}
                {catName === "Certificate Request" && (
                  <TicketCertPanel ticket={ticket} onUpdated={() => { fetchTicket(); onUpdated(); }} />
                )}

                {/* Reply box */}
                <TicketCommentBox ticketId={ticket.id} onCommentAdded={fetchTicket} />
              </div>

              {/* Right sidebar: controls */}
              <div className="hd-detail-sidebar">
                {/* Status */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Status</label>
                  <select className="cl-input" value={ticket.status} onChange={(e) => post({ action: "updateTicket", id: ticket.id, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Priority */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Priority</label>
                  <select className="cl-input" value={ticket.priority} onChange={(e) => post({ action: "updateTicket", id: ticket.id, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Assigned Group */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Group</label>
                  <select className="cl-input" value={ticket.assignedGroup || ""} onChange={(e) => post({ action: "updateTicket", id: ticket.id, assignedGroup: e.target.value || undefined, assignedTo: undefined })}>
                    <option value="">Unassigned</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>

                {/* Assigned Person */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Assignee</label>
                  <select className="cl-input" value={ticket.assignedTo || ""} onChange={(e) => post({ action: "updateTicket", id: ticket.id, assignedTo: e.target.value || undefined })}>
                    <option value="">Unassigned</option>
                    {groupMembers.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {/* Info */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Category</label>
                  <span className="text-sm">{catName}</span>
                </div>
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Group</label>
                  <span className="text-sm">{groupName || "—"}</span>
                </div>
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Requester</label>
                  <span className="text-sm">{ticket.requester}</span>
                </div>
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Created</label>
                  <span className="text-xs text-text-muted">{new Date(ticket.createdAt).toLocaleString()}</span>
                </div>
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Updated</label>
                  <span className="text-xs text-text-muted">{new Date(ticket.updatedAt).toLocaleString()}</span>
                </div>

                {/* Delete */}
                <button
                  className="cl-btn cl-btn--secondary mt-4 w-full"
                  style={{ color: "#dc2626", borderColor: "#dc2626" }}
                  onClick={async () => {
                    if (confirm("Delete this ticket?")) {
                      await post({ action: "deleteTicket", id: ticket.id });
                      onClose();
                    }
                  }}
                >
                  Delete Ticket
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
