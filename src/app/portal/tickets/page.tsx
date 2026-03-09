"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Headset, Plus, LogOut, ArrowLeft, X } from "lucide-react";
import type { Ticket, HdCategory, TicketPriority } from "@/lib/helpdesk";

const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

export default function PortalTicketsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ displayName: string; email: string } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<HdCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Auth check
  useEffect(() => {
    fetch("/api/portal?action=me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d?.user) { router.push("/portal/login"); return; }
      setUser(d.user);
    });
  }, [router]);

  const fetchTickets = useCallback(async () => {
    const res = await fetch("/api/portal?action=tickets");
    if (res.ok) { const d = await res.json(); setTickets(d.tickets || []); }
  }, []);

  useEffect(() => {
    Promise.all([
      fetchTickets(),
      fetch("/api/portal?action=config").then((r) => r.ok ? r.json() : { categories: [] }).then((d: { categories?: HdCategory[] }) => setCategories(d.categories || [])),
    ]).then(() => setLoading(false));
  }, [fetchTickets]);

  const logout = async () => {
    await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.push("/portal/login");
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || id || "—";

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/portal" className="p-1 hover:bg-muted rounded"><ArrowLeft className="w-4 h-4 text-text-muted" /></a>
          <Headset className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">My Tickets</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">{user.displayName}</span>
          <button className="cl-btn cl-btn--primary text-xs" onClick={() => setShowSubmit(true)}><Plus className="w-3 h-3" /> Submit Ticket</button>
          <button className="p-2 hover:bg-muted rounded text-text-muted" onClick={logout}><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {loading ? <p className="text-text-muted">Loading…</p> : tickets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted mb-4">You haven&apos;t submitted any tickets yet.</p>
            <button className="cl-btn cl-btn--primary" onClick={() => setShowSubmit(true)}>Submit Your First Ticket</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t) => (
              <div key={t.id} className="hd-editor-row cursor-pointer" onClick={() => setSelectedTicket(t)}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="hd-ticket-id">{t.id}</span>
                    <span className={`cl-badge hd-status--${t.status.toLowerCase().replace(/\s+/g, "-")}`}>{t.status}</span>
                    <span className={`cl-badge hd-priority--${t.priority.toLowerCase()}`}>{t.priority}</span>
                  </div>
                  <div className="hd-ticket-subject mt-1">{t.subject}</div>
                  <div className="hd-ticket-requester">{catName(t.category)} · {new Date(t.updatedAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit modal */}
      {showSubmit && <SubmitModal categories={categories} onClose={() => setShowSubmit(false)} onSubmitted={() => { setShowSubmit(false); fetchTickets(); }} />}

      {/* Ticket detail */}
      {selectedTicket && <TicketView ticket={selectedTicket} onClose={() => { setSelectedTicket(null); fetchTickets(); }} />}
    </div>
  );
}

function SubmitModal({ categories, onClose, onSubmitted }: { categories: HdCategory[]; onClose: () => void; onSubmitted: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setSaving(true);
    await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitTicket", subject, description, priority, category }),
    });
    setSaving(false);
    onSubmitted();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Submit a Ticket</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit}>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Subject *</label><input className="cl-input" value={subject} onChange={(e) => setSubject(e.target.value)} required /></div>
            <div className="cl-field mt-3"><label className="cl-label">Description</label><textarea className="cl-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="flex gap-3 mt-3">
              <div className="cl-field flex-1">
                <label className="cl-label">Priority</label>
                <select className="cl-input" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="cl-field flex-1">
                <label className="cl-label">Category</label>
                <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" disabled={saving}>{saving ? "Submitting…" : "Submit"}</button></div>
        </form>
      </div>
    </div>
  );
}

function TicketView({ ticket: initial, onClose }: { ticket: Ticket; onClose: () => void }) {
  const [ticket, setTicket] = useState(initial);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const sendComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    const res = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addComment", ticketId: ticket.id, content: comment }),
    });
    if (res.ok) {
      // Refresh ticket
      const r = await fetch(`/api/portal?action=tickets`);
      if (r.ok) {
        const d = await r.json();
        const t = (d.tickets || []).find((t: Ticket) => t.id === ticket.id);
        if (t) setTicket(t);
      }
    }
    setComment("");
    setSending(false);
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="hd-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="flex items-center gap-2">
            <span className="hd-ticket-id">{ticket.id}</span>
            <span className={`cl-badge hd-status--${ticket.status.toLowerCase().replace(/\s+/g, "-")}`}>{ticket.status}</span>
          </div>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="hd-detail-main" style={{ maxHeight: "70vh", overflow: "auto" }}>
          <h2 className="hd-detail-subject">{ticket.subject}</h2>
          {ticket.description && <div className="hd-detail-desc">{ticket.description}</div>}

          <div className="hd-detail-section">
            <h4 className="hd-detail-section-title">Conversation ({ticket.comments.filter((c) => !c.isInternal).length})</h4>
            {ticket.comments.filter((c) => !c.isInternal).map((c) => (
              <div key={c.id} className="hd-comment">
                <div className="hd-comment-header">
                  <strong>{c.author}</strong>
                  <span className="text-xs text-text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div className="hd-comment-content">{c.content}</div>
              </div>
            ))}
          </div>

          {/* Reply */}
          {ticket.status !== "Closed" && (
            <div className="mt-3">
              <textarea className="cl-textarea" rows={3} placeholder="Write a reply…" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex justify-end mt-2">
                <button className="cl-btn cl-btn--primary text-xs" disabled={sending} onClick={sendComment}>{sending ? "Sending…" : "Reply"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
