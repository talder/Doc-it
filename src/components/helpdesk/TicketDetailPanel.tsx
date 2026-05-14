"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Clock, AlertTriangle, CheckCircle, Monitor, Paperclip, Lock, Tag, Pause, Zap, Circle, Link2, GitMerge, History, BookOpen, Star, ThumbsUp, ThumbsDown, Timer, Plus } from "lucide-react";
import TicketCommentBox from "./TicketCommentBox";
import TicketCertPanel from "./TicketCertPanel";
import SlaPredictionPanel from "./SlaPredictionPanel";
import TicketPresenceBar from "./TicketPresenceBar";
import type { Ticket, HdGroup, HdCategory, HdFieldDef, TicketStatus, TicketPriority, ImpactLevel, UrgencyLevel, ReplyTemplate } from "@/lib/helpdesk";

const STATUSES: TicketStatus[] = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];
const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
const IMPACTS: ImpactLevel[] = ["low", "medium", "high", "critical"];
const URGENCIES: UrgencyLevel[] = ["low", "medium", "high", "critical"];

interface TicketDetailPanelProps {
  ticketId: string | null;
  groups: HdGroup[];
  categories: HdCategory[];
  fieldDefs: HdFieldDef[];
  replyTemplates?: ReplyTemplate[];
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

export default function TicketDetailPanel({ ticketId, groups, categories, fieldDefs, replyTemplates, onClose, onUpdated }: TicketDetailPanelProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);

  // Work log form
  const [showWorkLog, setShowWorkLog] = useState(false);
  const [wlDuration, setWlDuration] = useState("");
  const [wlNotes, setWlNotes] = useState("");
  const [wlBillable, setWlBillable] = useState(false);

  // Link ticket form
  const [showLink, setShowLink] = useState(false);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkRelation, setLinkRelation] = useState<string>("related");

  // Root cause / workaround
  const [editRootCause, setEditRootCause] = useState(false);
  const [rootCauseVal, setRootCauseVal] = useState("");
  const [editWorkaround, setEditWorkaround] = useState(false);
  const [workaroundVal, setWorkaroundVal] = useState("");

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
                <TicketPresenceBar ticketId={ticket.id} />
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
                  {ticket.slaPausedAt && (
                    <div className="hd-sla-badge" style={{ background: "#fef3c7", color: "#92400e" }}>
                      <Pause className="w-3 h-3" /> SLA Paused ({ticket.slaPausedMinutes || 0}m accumulated)
                    </div>
                  )}
                </div>

                {/* Impact / Urgency */}
                {(ticket.impact || ticket.urgency) && (
                  <div className="flex gap-3 mt-2 text-xs">
                    {ticket.impact && <span className="capitalize">Impact: <strong>{ticket.impact}</strong></span>}
                    {ticket.urgency && <span className="capitalize">Urgency: <strong>{ticket.urgency}</strong></span>}
                  </div>
                )}

                {/* Contract info */}
                {ticket.contractId && (
                  <div className="text-xs text-text-muted mt-1">Contract: {ticket.contractId}</div>
                )}

                {/* SLA Prediction */}
                <SlaPredictionPanel ticketId={ticket.id} />

                {/* CSAT display */}
                {ticket.csatRating !== undefined && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title"><Star className="w-3 h-3" /> Customer Satisfaction</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{ticket.csatRating}/5</span>
                      <span className="flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`w-4 h-4 ${i < ticket.csatRating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />)}</span>
                    </div>
                    {ticket.csatComment && <p className="text-xs text-text-muted mt-1">{ticket.csatComment}</p>}
                  </div>
                )}

                {/* Approvals */}
                {ticket.approvals.length > 0 && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title"><ThumbsUp className="w-3 h-3" /> Approvals</h4>
                    {ticket.approvals.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 py-1 text-xs border-b border-border">
                        <span className="font-medium">{a.approver}</span>
                        <span className={`cl-badge ${a.decision === "Approved" ? "hd-status--resolved" : a.decision === "Rejected" ? "hd-priority--critical" : "hd-status--waiting"}`}>{a.decision}</span>
                        {a.comment && <span className="text-text-muted">— {a.comment}</span>}
                        {a.decision === "Pending" && (
                          <span className="flex gap-1 ml-auto">
                            <button className="cl-btn cl-btn--primary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => post({ action: "decideApproval", ticketId: ticket.id, decision: "Approved" })}><ThumbsUp className="w-3 h-3" /> Approve</button>
                            <button className="cl-btn cl-btn--secondary" style={{ padding: "2px 8px", fontSize: 11, color: "#dc2626" }} onClick={() => post({ action: "decideApproval", ticketId: ticket.id, decision: "Rejected" })}><ThumbsDown className="w-3 h-3" /> Reject</button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Description */}
                {ticket.description && (
                  <div className="hd-detail-desc">{ticket.description}</div>
                )}

                {/* Root cause / Workaround (problem tickets) */}
                {(ticket.ticketType === "problem" || ticket.rootCause || ticket.workaround) && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title">Problem Analysis</h4>
                    <div className="mb-2">
                      <label className="cl-label">Root Cause</label>
                      {editRootCause ? (
                        <div className="flex gap-1">
                          <textarea className="cl-textarea flex-1" rows={2} value={rootCauseVal} onChange={(e) => setRootCauseVal(e.target.value)} />
                          <button className="cl-btn cl-btn--primary text-xs" onClick={() => { post({ action: "updateTicket", id: ticket.id, rootCause: rootCauseVal }); setEditRootCause(false); }}>Save</button>
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary cursor-pointer" onClick={() => { setRootCauseVal(ticket.rootCause || ""); setEditRootCause(true); }}>{ticket.rootCause || <span className="text-text-muted italic">Click to add root cause…</span>}</p>
                      )}
                    </div>
                    <div>
                      <label className="cl-label">Workaround</label>
                      {editWorkaround ? (
                        <div className="flex gap-1">
                          <textarea className="cl-textarea flex-1" rows={2} value={workaroundVal} onChange={(e) => setWorkaroundVal(e.target.value)} />
                          <button className="cl-btn cl-btn--primary text-xs" onClick={() => { post({ action: "updateTicket", id: ticket.id, workaround: workaroundVal }); setEditWorkaround(false); }}>Save</button>
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary cursor-pointer" onClick={() => { setWorkaroundVal(ticket.workaround || ""); setEditWorkaround(true); }}>{ticket.workaround || <span className="text-text-muted italic">Click to add workaround…</span>}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Linked tickets */}
                {(ticket.linkedTickets?.length > 0 || showLink) && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title"><Link2 className="w-3 h-3" /> Linked Tickets</h4>
                    {(ticket.linkedTickets || []).map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="capitalize text-text-muted">{l.relation}</span>
                        <span className="font-mono font-medium text-accent">{l.ticketId}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showLink && (
                  <div className="flex gap-2 items-end mt-1">
                    <div className="cl-field flex-1"><label className="cl-label">Ticket ID</label><input className="cl-input text-xs" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} placeholder="INC-0001" /></div>
                    <select className="cl-input text-xs" style={{ width: 100 }} value={linkRelation} onChange={(e) => setLinkRelation(e.target.value)}>
                      <option value="related">Related</option><option value="parent">Parent</option><option value="child">Child</option><option value="duplicate">Duplicate</option>
                    </select>
                    <button className="cl-btn cl-btn--primary text-xs" onClick={async () => { await post({ action: "linkTickets", sourceId: ticket.id, targetId: linkTarget, relation: linkRelation }); setShowLink(false); setLinkTarget(""); }}>Link</button>
                    <button className="cl-btn cl-btn--secondary text-xs" onClick={() => setShowLink(false)}>Cancel</button>
                  </div>
                )}

                {/* Work logs */}
                <div className="hd-detail-section">
                  <div className="flex items-center justify-between">
                    <h4 className="hd-detail-section-title"><Timer className="w-3 h-3" /> Work Log ({(ticket.workLogs || []).length})</h4>
                    <button className="text-xs text-accent" onClick={() => setShowWorkLog((v) => !v)}><Plus className="w-3 h-3 inline" /> Add</button>
                  </div>
                  {showWorkLog && (
                    <div className="flex gap-2 items-end mt-1 mb-2">
                      <div className="cl-field"><label className="cl-label">Minutes</label><input className="cl-input text-xs" type="number" style={{ width: 70 }} value={wlDuration} onChange={(e) => setWlDuration(e.target.value)} /></div>
                      <div className="cl-field flex-1"><label className="cl-label">Notes</label><input className="cl-input text-xs" value={wlNotes} onChange={(e) => setWlNotes(e.target.value)} /></div>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={wlBillable} onChange={(e) => setWlBillable(e.target.checked)} />Billable</label>
                      <button className="cl-btn cl-btn--primary text-xs" onClick={async () => { await post({ action: "addWorkLog", ticketId: ticket.id, durationMinutes: Number(wlDuration) || 0, notes: wlNotes, billable: wlBillable }); setShowWorkLog(false); setWlDuration(""); setWlNotes(""); setWlBillable(false); }}>Save</button>
                    </div>
                  )}
                  {(ticket.workLogs || []).length === 0 && !showWorkLog && <p className="text-xs text-text-muted">No work logged</p>}
                  {(ticket.workLogs || []).map((wl) => (
                    <div key={wl.id} className="flex items-center gap-2 text-xs py-0.5 border-b border-border">
                      <span className="font-medium">{wl.agent}</span>
                      <span>{wl.durationMinutes}m</span>
                      {wl.billable && <span className="cl-badge" style={{ fontSize: 9 }}>$</span>}
                      <span className="text-text-muted flex-1">{wl.notes}</span>
                      <span className="text-text-muted">{timeAgo(wl.startTime)}</span>
                    </div>
                  ))}
                </div>

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

                {/* Ticket history */}
                {(ticket.history || []).length > 0 && (
                  <div className="hd-detail-section">
                    <h4 className="hd-detail-section-title"><History className="w-3 h-3" /> History</h4>
                    {(ticket.history || []).slice().reverse().map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-0.5 border-b border-border">
                        <span className="font-medium">{h.changedBy}</span>
                        <span>changed <strong>{h.field}</strong></span>
                        <span className="text-text-muted">{String(h.oldValue || "—")} → {String(h.newValue || "—")}</span>
                        <span className="ml-auto text-text-muted">{timeAgo(h.changedAt)}</span>
                      </div>
                    ))}
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
                <TicketCommentBox ticketId={ticket.id} replyTemplates={replyTemplates} onCommentAdded={fetchTicket} />
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

                {/* Impact */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Impact</label>
                  <select className="cl-input" value={ticket.impact || ""} onChange={(e) => post({ action: "updateTicket", id: ticket.id, impact: e.target.value || undefined })}>
                    <option value="">— None —</option>
                    {IMPACTS.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
                  </select>
                </div>

                {/* Urgency */}
                <div className="hd-detail-ctrl">
                  <label className="cl-label">Urgency</label>
                  <select className="cl-input" value={ticket.urgency || ""} onChange={(e) => post({ action: "updateTicket", id: ticket.id, urgency: e.target.value || undefined })}>
                    <option value="">— None —</option>
                    {URGENCIES.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
                  </select>
                </div>

                {/* Impact cascade button */}
                {ticket.assetId && (
                  <div className="hd-detail-ctrl">
                    <button
                      className="cl-btn cl-btn--secondary text-xs w-full"
                      onClick={async () => {
                        if (!confirm("Create child incidents for all downstream impacted assets?")) return;
                        const res = await fetch("/api/helpdesk/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cascadeIncidents", ticketId: ticket.id }) });
                        if (res.ok) { const d = await res.json(); alert(`Created ${d.count || 0} child incidents`); fetchTicket(); onUpdated(); }
                      }}
                    >
                      <Zap className="w-3 h-3" /> Impact Cascade
                    </button>
                  </div>
                )}

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

                {/* Link ticket */}
                <button className="cl-btn cl-btn--secondary text-xs w-full" onClick={() => setShowLink((v) => !v)}>
                  <Link2 className="w-3 h-3" /> Link Ticket
                </button>

                {/* Merge */}
                <button className="cl-btn cl-btn--secondary text-xs w-full mt-1" onClick={async () => {
                  const target = prompt("Merge INTO which ticket ID?");
                  if (!target) return;
                  await post({ action: "mergeTickets", sourceId: ticket.id, targetId: target });
                }}>
                  <GitMerge className="w-3 h-3" /> Merge Into…
                </button>

                {/* Convert to KB article */}
                {(ticket.status === "Resolved" || ticket.status === "Closed") && (
                  <button className="cl-btn cl-btn--secondary text-xs w-full mt-1" onClick={async () => {
                    const title = prompt("KB article title:", `KB: ${ticket.subject}`);
                    if (!title) return;
                    const res = await fetch("/api/helpdesk/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId: ticket.id, title }) });
                    if (res.ok) { const d = await res.json(); alert(`Article created: ${d.article?.name}`); }
                  }}>
                    <BookOpen className="w-3 h-3" /> Convert to KB Article
                  </button>
                )}

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
