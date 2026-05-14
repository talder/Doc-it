"use client";

import { useRef, useState } from "react";
import { Send, Paperclip, Lock, FileText } from "lucide-react";
import type { TicketAttachment, ReplyTemplate } from "@/lib/helpdesk";

interface TicketCommentBoxProps {
  ticketId: string;
  replyTemplates?: ReplyTemplate[];
  onCommentAdded: () => void;
}

export default function TicketCommentBox({ ticketId, replyTemplates, onCommentAdded }: TicketCommentBoxProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/helpdesk/attachments", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, data]);
      }
    } catch {}
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/helpdesk/${encodeURIComponent(ticketId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), isInternal, attachments }),
      });
      setContent("");
      setAttachments([]);
      setIsInternal(false);
      onCommentAdded();
    } catch {}
    setSending(false);
  };

  return (
    <div className={`hd-comment-box${isInternal ? " hd-comment-box--internal" : ""}`}>
      <textarea
        className="hd-comment-input"
        rows={3}
        placeholder={isInternal ? "Internal note (not visible to requester)…" : "Reply to requester…"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      {/* Canned response picker */}
      {showTemplates && replyTemplates && replyTemplates.length > 0 && (
        <div className="border border-border rounded p-2 mb-1" style={{ maxHeight: 120, overflowY: "auto" }}>
          {replyTemplates.map((t) => (
            <button key={t.id} className="block w-full text-left px-2 py-1 text-xs hover:bg-[var(--bg-secondary,#f3f4f6)] rounded" onClick={() => { setContent(t.content); setShowTemplates(false); }}>
              <span className="font-medium">{t.name}</span>
              {t.category && <span className="text-text-muted ml-1">({t.category})</span>}
            </button>
          ))}
        </div>
      )}
      <div className="hd-comment-actions">
        <div className="flex items-center gap-2">
          <button
            className={`hd-comment-toggle${isInternal ? " hd-comment-toggle--active" : ""}`}
            onClick={() => setIsInternal((v) => !v)}
            title={isInternal ? "Internal note" : "Public reply"}
          >
            <Lock className="w-3.5 h-3.5" />
            {isInternal ? "Internal" : "Public"}
          </button>
          {replyTemplates && replyTemplates.length > 0 && (
            <button className="hd-attach-btn" onClick={() => setShowTemplates((v) => !v)} title="Canned responses">
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="hd-attach-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
          {attachments.map((a) => (
            <span key={a.id} className="hd-attach-chip">
              {a.originalName}
              <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="ml-1">&times;</button>
            </span>
          ))}
        </div>
        <button className="cl-btn cl-btn--primary" style={{ padding: "5px 12px" }} disabled={!content.trim() || sending} onClick={handleSubmit}>
          <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
