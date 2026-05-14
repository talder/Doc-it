"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle } from "lucide-react";
import type { AgentStatusValue } from "@/lib/helpdesk";

const STATUS_OPTIONS: { value: AgentStatusValue; label: string; color: string }[] = [
  { value: "online",  label: "Online",  color: "#22c55e" },
  { value: "away",    label: "Away",    color: "#f59e0b" },
  { value: "busy",    label: "Busy",    color: "#ef4444" },
  { value: "offline", label: "Offline", color: "#9ca3af" },
];

export default function AgentStatusSelector() {
  const [status, setStatus] = useState<AgentStatusValue>("offline");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch current status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/helpdesk/agents/status");
        if (!res.ok) return;
        const data = await res.json();
        // The API returns all statuses; find the current user's.
        // We don't know the username client-side, but the POST response
        // gives us back our entry. On first load, set to "online" and POST it.
        const statuses: { username: string; status: AgentStatusValue }[] = data.statuses || [];
        // Try to detect current user from /api/auth/me
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const mine = statuses.find((s) => s.username === me.user?.username);
          if (mine) {
            setStatus(mine.status);
            return;
          }
        }
        // First visit: set online
        await updateStatus("online");
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const updateStatus = useCallback(async (newStatus: AgentStatusValue) => {
    setStatus(newStatus);
    setOpen(false);
    try {
      await fetch("/api/helpdesk/agents/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {}
  }, []);

  const current = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[3];

  return (
    <div ref={ref} className="relative">
      <button
        className="jp-action-btn flex items-center gap-1.5 text-xs"
        onClick={() => setOpen((v) => !v)}
        title={`Status: ${current.label}`}
      >
        <Circle className="w-2.5 h-2.5" style={{ fill: current.color, color: current.color }} />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border border-border overflow-hidden"
          style={{ background: "var(--bg-primary, #fff)", minWidth: 140 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[var(--bg-secondary,#f3f4f6)] transition-colors"
              onClick={() => updateStatus(opt.value)}
            >
              <Circle className="w-2.5 h-2.5 flex-shrink-0" style={{ fill: opt.color, color: opt.color }} />
              <span className={status === opt.value ? "font-semibold" : ""}>{opt.label}</span>
              {status === opt.value && <span className="ml-auto text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
