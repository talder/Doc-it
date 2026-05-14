"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";

interface Viewer {
  username: string;
  connectedAt: string;
}

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16"];

function initialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function TicketPresenceBar({ ticketId }: { ticketId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!ticketId) return;

    const es = new EventSource(`/api/helpdesk/presence?ticketId=${encodeURIComponent(ticketId)}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data.viewers)) setViewers(data.viewers);
      } catch {}
    };

    es.onerror = () => {
      // SSE will auto-reconnect; nothing to do
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [ticketId]);

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" title={viewers.map((v) => v.username).join(", ")}>
      <Eye className="w-3 h-3 text-text-muted" />
      <div className="flex -space-x-1.5">
        {viewers.slice(0, 5).map((v) => {
          const initials = v.username.slice(0, 2).toUpperCase();
          const bg = initialsColor(v.username);
          return (
            <div
              key={v.username}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white"
              style={{ background: bg }}
              title={v.username}
            >
              {initials}
            </div>
          );
        })}
        {viewers.length > 5 && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-text-muted ring-1 ring-white"
            style={{ background: "var(--bg-secondary, #e5e7eb)" }}
          >
            +{viewers.length - 5}
          </div>
        )}
      </div>
      <span className="text-[10px] text-text-muted">
        {viewers.length === 1 ? "1 viewer" : `${viewers.length} viewers`}
      </span>
    </div>
  );
}
