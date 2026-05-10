"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowLeft, Bell, Check, CheckCircle,
  ChevronDown, ChevronRight, Clock, Copy, Download, FileText, GitBranch,
  Pause, Play, RefreshCw, Search, Settings, Square, Timer, Trash2, X, Plus, Edit2, Wifi, WifiOff, Info,
} from "lucide-react";

// ── Types (mirroring lib/mirth.ts) ────────────────────────────────────────────

type ChannelHealth = "healthy" | "error" | "stuck" | "paused" | "down" | "disabled" | "unknown";
type ServerHealth  = ChannelHealth | "unreachable";

interface MirthServerPublic {
  id: string; name: string; url: string; username: string;
  passwordSet: boolean; ignoreSslErrors: boolean;
  enabled: boolean; sortOrder: number; createdAt: string;
}

interface MirthChannel {
  id: string; name: string; description: string; enabled: boolean;
  state: string; received: number; sent: number; error: number;
  filtered: number; queued: number; health: ChannelHealth;
  stateChangedAt?: string;
  prevState?: string;
  note?: string;
  inactiveForMinutes?: number;
}

interface MirthChannelConfig {
  inactivityThresholdMinutes: number;
  inactivityEnabled: boolean;
}

interface HistoryPoint {
  received: number; sent: number; error: number; queued: number;
  state: string; snapshot_time: string;
}

interface IssueChannel extends MirthChannel { serverId: string; serverName: string; }

interface DashboardServer {
  serverId: string; serverName: string; url: string;
  version: string | null; reachable: boolean; error: string | null;
  health: ServerHealth; channels: MirthChannel[];
  totalChannels: number; healthyCnt: number; errorCnt: number;
  stuckCnt: number; pausedCnt: number; downCnt: number; disabledCnt: number;
  totalQueued: number; totalErrors: number;
}

interface Dashboard {
  servers: DashboardServer[]; totalServers: number; reachableServers: number;
  totalChannels: number; issueChannels: IssueChannel[];
  summaryCounts: Record<ChannelHealth, number>;
}

interface MirthMessage {
  messageId: string; receivedDate: string; status: string;
  connectorName?: string; rawContent?: string; processedContent?: string;
}

interface MirthEvent {
  id: number; level: string; name: string; outcome: string;
  username?: string; ipAddress?: string; dateTime: string;
}

// ── Health styling ─────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  healthy:     "bg-green-500",
  error:       "bg-red-500",
  stuck:       "bg-amber-500",
  paused:      "bg-yellow-400",
  down:        "bg-gray-400",
  disabled:    "bg-gray-300",
  unknown:     "bg-gray-400",
  unreachable: "bg-red-600",
};

const HEALTH_BADGE: Record<string, string> = {
  healthy:     "bg-green-50 text-green-700 border-green-200",
  error:       "bg-red-50 text-red-700 border-red-200",
  stuck:       "bg-amber-50 text-amber-700 border-amber-200",
  paused:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  down:        "bg-gray-100 text-gray-600 border-gray-300",
  disabled:    "bg-gray-50 text-gray-400 border-gray-200",
  unknown:     "bg-gray-50 text-gray-500 border-gray-200",
  unreachable: "bg-red-50 text-red-800 border-red-300",
};

function HealthDot({ health, size = "sm" }: { health: string; size?: "sm" | "xs" }) {
  const dim = size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2";
  return (
    <span className={`${dim} rounded-full flex-shrink-0 ${HEALTH_COLOR[health] ?? "bg-gray-400"}`} />
  );
}

function HealthBadge({ health }: { health: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${HEALTH_BADGE[health] ?? ""}`}>
      {health}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  if (!iso) return "\u2014";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtNum(n: number) { return n.toLocaleString(); }

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function timeSince(iso: string): string {
  if (!iso) return "";
  return formatDuration(Date.now() - new Date(iso).getTime());
}

function detectFormat(raw: string): "hl7" | "xml" | "json" | "text" {
  const s = raw.trim();
  if (s.startsWith("MSH|")) return "hl7";
  if (s.startsWith("<"))    return "xml";
  if (s.startsWith("{") || s.startsWith("[")) return "json";
  return "text";
}

function formatRaw(raw: string): string {
  const fmt = detectFormat(raw);
  if (fmt === "hl7") return raw.replace(/\r/g, "\n");
  if (fmt === "json") { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; } }
  return raw;
}

function downloadBlob(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── Sparkline ──────────────────────────────────────────────────────────────────

function Sparkline({ history, width = 120, height = 32 }: { history: HistoryPoint[]; width?: number; height?: number }) {
  if (history.length < 2) return <span className="text-[10px] text-text-muted italic">No history</span>;
  // Compute deltas (received per interval)
  const rcvd  = history.map((p, i) => i === 0 ? 0 : Math.max(0, p.received - history[i - 1].received));
  const errs  = history.map((p, i) => i === 0 ? 0 : Math.max(0, p.error    - history[i - 1].error));
  const maxR  = Math.max(...rcvd, 1);
  const toX   = (i: number) => (i / (history.length - 1)) * width;
  const toY   = (v: number) => height - 2 - ((v / maxR) * (height - 4));
  const rcvdPts = rcvd.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const errPts  = errs.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <polyline fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={rcvdPts} />
      {errs.some(e => e > 0) && (
        <polyline fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={errPts} />
      )}
    </svg>
  );
}

// ── REFRESH_OPTIONS ────────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 }, { label: "15s", value: 15 },
  { label: "30s", value: 30 }, { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
] as const;

// ── Channel Settings Modal (note + inactivity config) ─────────────────────────

function ChannelSettingsModal({
  serverId, channel, onClose, onSaved,
}: {
  serverId: string; channel: MirthChannel;
  onClose: () => void; onSaved: (note?: string) => void;
}) {
  const [note, setNote]       = useState(channel.note ?? "");
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(60);
  const [saving, setSaving]   = useState(false);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/mirth/servers/${serverId}/channels/${channel.id}/config`).then(r => r.json()).catch(() => null),
    ]).then(([cfg]: [{ config: MirthChannelConfig } | null]) => {
      if (cfg?.config) {
        setEnabled(cfg.config.inactivityEnabled);
        setThreshold(cfg.config.inactivityThresholdMinutes);
      }
      setLoaded(true);
    });
  }, [serverId, channel.id]);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all([
      fetch(`/api/mirth/servers/${serverId}/channels/${channel.id}/note`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, channelName: channel.name }),
      }),
      fetch(`/api/mirth/servers/${serverId}/channels/${channel.id}/config`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName: channel.name, inactivityEnabled: enabled, inactivityThresholdMinutes: threshold }),
      }),
    ]);
    setSaving(false);
    onSaved(note);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Settings className="w-4 h-4 text-text-muted" /> {channel.name}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        {!loaded ? (
          <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Channel Note
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                placeholder="Add a note visible to all users (e.g. 'Intentionally stopped on weekends')"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent resize-none" />
            </div>
            <div className="border border-border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Bell className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-sm text-text-secondary font-medium">Inactivity monitoring</span>
                </label>
                <button onClick={() => setEnabled(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ enabled ? "bg-accent" : "bg-gray-300"}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${ enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              {enabled && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Alert if no messages for</span>
                  <input type="number" min={1} max={10080} value={threshold}
                    onChange={e => setThreshold(Math.max(1, Number(e.target.value)))}
                    className="w-20 px-2 py-1 text-xs border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
                  <span className="text-xs text-text-muted">minutes</span>
                </div>
              )}
              <p className="text-[10px] text-text-muted">When enabled, the channel will be marked STUCK if it has been running but received no new messages within the threshold.</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving || !loaded}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Server form modal ──────────────────────────────────────────────────────────

function ServerFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: MirthServerPublic;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "https://");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [ignoreSsl, setIgnoreSsl] = useState(initial?.ignoreSslErrors ?? true);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);
  const [err, setErr] = useState("");
  const isEdit = !!initial;

  const handleSave = async () => {
    if (!name.trim() || !url.trim() || !username.trim()) { setErr("Name, URL and username are required"); return; }
    setSaving(true); setErr("");
    try {
      const method = isEdit ? "PUT" : "POST";
      const endpoint = isEdit ? `/api/mirth/servers/${initial.id}` : "/api/mirth/servers";
      const body: Record<string, unknown> = { name, url, username, ignoreSslErrors: ignoreSsl, enabled, sortOrder: Number(sortOrder) };
      if (password) body.password = password;
      const r = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Save failed"); } else { onSaved(); onClose(); }
    } catch { setErr("Network error"); }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!initial) return;
    setTesting(true); setTestResult(null);
    const r = await fetch(`/api/mirth/servers/${initial.id}/test`).catch(() => null);
    if (!r) { setTestResult({ ok: false, error: "Network error" }); }
    else { setTestResult(await r.json()); }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">{isEdit ? "Edit Mirth Server" : "Add Mirth Server"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Display Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Production Mirth" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mirthhost:8443" className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" autoComplete="off" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Password {isEdit && initial.passwordSet ? "(leave blank to keep)" : ""}
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isEdit && initial.passwordSet ? "••••••••" : "required"} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" autoComplete="new-password" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={ignoreSsl} onChange={e => setIgnoreSsl(e.target.checked)} className="rounded" />
              <span className="text-sm text-text-secondary">Ignore SSL errors (self-signed)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded" />
              <span className="text-sm text-text-secondary">Enabled</span>
            </label>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          {testResult && (
            <div className={`text-xs px-3 py-2 rounded border ${testResult.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
              {testResult.ok ? `✓ Connected — Mirth v${testResult.version}` : `✗ ${testResult.error}`}
            </div>
          )}
        </div>
        <div className="flex justify-between gap-2 mt-5">
          <div>
            {isEdit && (
              <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary disabled:opacity-40">
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                Test
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {isEdit ? "Save" : "Add Server"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message row ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  SENT:        "bg-green-50 text-green-700 border-green-200",
  RECEIVED:    "bg-blue-50 text-blue-700 border-blue-200",
  ERROR:       "bg-red-50 text-red-700 border-red-200",
  FILTERED:    "bg-gray-100 text-gray-600 border-gray-200",
  QUEUED:      "bg-amber-50 text-amber-700 border-amber-200",
  TRANSFORMED: "bg-purple-50 text-purple-700 border-purple-200",
};

function MessageRow({
  msg, index, serverId, channelId,
}: {
  msg: MirthMessage; index: number; serverId: string; channelId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [overrideContent, setOverrideContent] = useState<{ raw: string; processed: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const raw  = overrideContent?.raw  ?? msg.rawContent  ?? "";
  const proc = overrideContent?.processed ?? msg.processedContent ?? "";
  const content   = raw || proc;
  const formatted = content ? formatRaw(content) : "";
  const fmt       = content ? detectFormat(content) : "text";

  const handleToggle = async () => {
    const opening = !expanded;
    setExpanded(opening);
    // Lazy-load when expanding and content not yet available
    if (opening && !content && !overrideContent) {
      setFetching(true);
      try {
        const r = await fetch(`/api/mirth/servers/${serverId}/channels/${channelId}/messages/${msg.messageId}`);
        if (r.ok) {
          const d = await r.json();
          setOverrideContent({ raw: d.message?.rawContent ?? "", processed: d.message?.processedContent ?? "" });
        }
      } catch { /* ignore */ }
      setFetching(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formatted).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <tr
        className={`border-b border-border hover:bg-muted/40 cursor-pointer group ${index % 2 === 1 ? "bg-surface-alt/20" : ""}`}
        onClick={handleToggle}
      >
        <td className="px-3 py-1.5 text-[10px] text-text-muted font-mono whitespace-nowrap">{fmtTime(msg.receivedDate)}</td>
        <td className="px-3 py-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase ${STATUS_BADGE[msg.status] ?? "border-border text-text-muted"}`}>
            {msg.status}
          </span>
        </td>
        <td className="px-3 py-1.5 text-xs text-text-secondary">{msg.connectorName || "\u2014"}</td>
        <td className="px-3 py-1.5 text-[10px] text-text-muted font-mono">{msg.messageId}</td>
        <td className="px-2 py-1.5 w-7">
          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
            {fetching
              ? <RefreshCw className="w-3 h-3 text-text-muted animate-spin" />
              : expanded
                ? <ChevronDown className="w-3 h-3 text-text-muted" />
                : <ChevronRight className="w-3 h-3 text-text-muted" />}
            {content && (
              <button onClick={handleCopy} className="p-0.5 rounded hover:bg-muted text-text-muted">
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={5} className="px-6 py-3 bg-surface-alt/60">
            {fetching ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <RefreshCw className="w-3 h-3 animate-spin" /> Loading content…
              </div>
            ) : content ? (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-medium text-text-muted uppercase">{fmt}</span>
                  {content && (
                    <button onClick={handleCopy} className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary">
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />} Copy
                    </button>
                  )}
                </div>
                <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all max-h-64 overflow-auto bg-surface border border-border rounded-lg p-3">
                  {formatted}
                </pre>
              </>
            ) : (
              <p className="text-xs text-text-muted italic">No content available for this message.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Channel Explorer ───────────────────────────────────────────────────────────

function ChannelExplorer({ serverId, channel }: { serverId: string; channel: MirthChannel }) {
  const [messages, setMessages] = useState<MirthMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [clientSearch, setClientSearch] = useState("");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const limit = 20;

  useEffect(() => {
    fetch(`/api/mirth/servers/${serverId}/channels/${channel.id}/history?limit=24`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.history) setHistory(d.history); }).catch(() => {});
  }, [serverId, channel.id]);

  const fetchMessages = useCallback(async (off = 0) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ limit: String(limit), offset: String(off), ...(statusFilter !== "ALL" ? { status: statusFilter } : {}) });
    try {
      const r = await fetch(`/api/mirth/servers/${serverId}/channels/${channel.id}/messages?${params}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); }
      else { setMessages(d.messages ?? []); setTotal(d.total ?? 0); setOffset(off); }
    } catch { setError("Network error"); }
    setLoading(false);
  }, [serverId, channel.id, statusFilter]);

  useEffect(() => { fetchMessages(0); }, [fetchMessages]);

  const display = useMemo(() => {
    if (!clientSearch.trim()) return messages;
    const t = clientSearch.toLowerCase();
    return messages.filter(m =>
      m.status.toLowerCase().includes(t) ||
      (m.connectorName ?? "").toLowerCase().includes(t) ||
      (m.rawContent ?? "").toLowerCase().includes(t) ||
      m.messageId.includes(t)
    );
  }, [messages, clientSearch]);

  return (
    <div className="flex flex-col h-full">
      {/* Sparkline header */}
      {history.length >= 2 && (
        <div className="flex-shrink-0 border-b border-border bg-surface-alt/40 px-4 py-2 flex items-center gap-3">
          <span className="text-[10px] text-text-muted uppercase font-semibold tracking-wide">Activity (last {history.length} snapshots)</span>
          <Sparkline history={history} width={160} height={28} />
          <span className="text-[10px] text-green-600 font-medium">● rcvd</span>
          <span className="text-[10px] text-red-500 font-medium">● err</span>
        </div>
      )}
      {/* Filter bar */}
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-2 flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); fetchMessages(0); }}
          className="text-xs px-2 py-1 border border-border rounded-lg bg-surface text-text-secondary">
          {["ALL","RECEIVED","SENT","ERROR","FILTERED","QUEUED","TRANSFORMED"].map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-text-muted absolute left-1.5 pointer-events-none" />
          <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search…"
            className="pl-6 pr-6 py-1 text-xs border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent w-36" />
          {clientSearch && <button onClick={() => setClientSearch("")} className="absolute right-1.5 text-text-muted hover:text-text-primary"><X className="w-3 h-3" /></button>}
        </div>
        <button onClick={() => fetchMessages(offset)} disabled={loading} className="jp-action-btn disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => downloadBlob("messages.json", JSON.stringify(display, null, 2), "application/json")}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted text-text-secondary">
            <Download className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>
      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24"><RefreshCw className="w-5 h-5 animate-spin text-text-muted" /></div>
        ) : error ? (
          <div className="jp-empty"><AlertTriangle className="w-8 h-8 text-red-400 mb-2" /><p className="text-sm text-red-600">{error}</p></div>
        ) : display.length === 0 ? (
          <div className="jp-empty"><Activity className="w-10 h-10 text-text-muted opacity-30 mb-3" /><p className="text-text-muted">No messages</p></div>
        ) : (
          <>
            <div className="sticky top-0 z-10 px-4 py-1.5 flex items-center gap-3 border-b border-border bg-surface-alt text-xs text-text-muted">
              <span className="font-semibold text-text-primary">{display.length}{display.length !== total ? ` of ${total}` : ""} messages</span>
              {total > limit && (
                <div className="ml-auto flex items-center gap-1">
                  <button disabled={offset === 0} onClick={() => fetchMessages(Math.max(0, offset - limit))}
                    className="px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted disabled:opacity-40">← Prev</button>
                  <span>{Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}</span>
                  <button disabled={offset + limit >= total} onClick={() => fetchMessages(offset + limit)}
                    className="px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted disabled:opacity-40">Next →</button>
                </div>
              )}
            </div>
            <table className="w-full" style={{ tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 160 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 48 }} /></colgroup>
              <thead><tr className="border-b border-border bg-surface-alt">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Time</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Status</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Connector</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">ID</th>
                <th />
              </tr></thead>
              <tbody>{display.map((m, i) => <MessageRow key={m.messageId} msg={m} index={i} serverId={serverId} channelId={channel.id} />)}</tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Server Detail ──────────────────────────────────────────────────────────────

function ServerDetail({
  server,
  isAdmin,
  onSelectChannel,
}: {
  server: DashboardServer;
  isAdmin: boolean;
  onSelectChannel: (ch: MirthChannel) => void;
}) {
  const [actioning, setActioning] = useState<string | null>(null);
  const [channels, setChannels] = useState<MirthChannel[]>(server.channels);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [events, setEvents] = useState<MirthEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);
  // Channel settings modal
  const [settingsChannel, setSettingsChannel] = useState<MirthChannel | null>(null);

  const doAction = async (channelId: string, action: string) => {
    setActioning(`${channelId}-${action}`);
    await fetch(`/api/mirth/servers/${server.serverId}/channels/${channelId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActioning(null);
    const r = await fetch(`/api/mirth/servers/${server.serverId}/channels`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setChannels(d.channels ?? channels); }
  };

  const handleAcknowledge = async (channelId: string, errorCount: number) => {
    setActioning(`${channelId}-ack`);
    await fetch(`/api/mirth/servers/${server.serverId}/channels/${channelId}/ack`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upToErrors: errorCount }),
    }).catch(() => {});
    setActioning(null);
    setChannels(prev => prev.map(c =>
      c.id === channelId ? { ...c, health: c.queued > 0 ? "stuck" : "healthy" } : c
    ));
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.size === 0) return;
    setBatching(true);
    await fetch(`/api/mirth/servers/${server.serverId}/batch-action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: [...selectedIds], action }),
    }).catch(() => {});
    setBatching(false);
    setSelectedIds(new Set());
    const r = await fetch(`/api/mirth/servers/${server.serverId}/channels`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setChannels(d.channels ?? channels); }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    const r = await fetch(`/api/mirth/servers/${server.serverId}/events?limit=50`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setEvents(d.events ?? []); }
    setEventsLoading(false);
  };

  useEffect(() => { setChannels(server.channels); }, [server.channels]);

  // display must be defined BEFORE toggleSelect/allSelected/toggleAll
  const display = useMemo(() => {
    if (!clientSearch.trim()) return channels;
    const t = clientSearch.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(t) || c.state.toLowerCase().includes(t));
  }, [channels, clientSearch]);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const allSelected = display.length > 0 && display.every(c => selectedIds.has(c.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(display.map(c => c.id)));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Channel table */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-text-primary">{server.serverName}</h2>
          <HealthBadge health={server.health} />
          {server.version && <span className="text-xs text-text-muted">v{server.version}</span>}
          {!server.reachable && <span className="text-xs text-red-500 flex items-center gap-1"><WifiOff className="w-3 h-3" />{server.error}</span>}
          <div className="relative ml-auto flex items-center">
            <Search className="w-3 h-3 text-text-muted absolute left-1.5 pointer-events-none" />
            <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Filter channels…"
              className="pl-6 pr-2 py-1 text-xs border border-border rounded-lg bg-surface focus:outline-none focus:border-accent w-36" />
          </div>
        </div>

        {/* Batch toolbar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-muted/60 rounded-lg border border-border">
            <span className="text-xs text-text-secondary font-medium">{selectedIds.size} selected</span>
            {[{ label: "Start",  icon: <Play className="w-3 h-3" />,   action: "start",  cls: "text-green-600 hover:bg-green-50" },
              { label: "Stop",   icon: <Square className="w-3 h-3" />, action: "stop",   cls: "text-red-500   hover:bg-red-50"   },
              { label: "Pause",  icon: <Pause className="w-3 h-3" />,  action: "pause",  cls: "text-yellow-600 hover:bg-yellow-50" },
              { label: "Resume", icon: <Play className="w-3 h-3" />,   action: "resume", cls: "text-blue-500  hover:bg-blue-50"   },
            ].map(b => (
              <button key={b.action} onClick={() => handleBatchAction(b.action)} disabled={batching}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded border border-border ${b.cls} disabled:opacity-40`}>
                {batching ? <RefreshCw className="w-3 h-3 animate-spin" /> : b.icon} {b.label}
              </button>
            ))}
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto p-1 rounded hover:bg-muted text-text-muted"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {display.length === 0 ? (
          <div className="jp-empty py-12"><GitBranch className="w-10 h-10 opacity-20 mb-3" /><p className="text-text-muted">No channels</p></div>
        ) : (
          <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>{isAdmin && <col style={{ width: 28 }} />}<col style={{ width: 28 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} />{isAdmin && <col style={{ width: 180 }} />}</colgroup>
            <thead><tr className="border-b border-border bg-surface-alt">
              {isAdmin && <th className="px-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" /></th>}
              <th /><th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Channel</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">State</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Rcvd</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Sent</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted uppercase text-red-500">Error</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Filtrd</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-amber-600 uppercase">Queued</th>
              {isAdmin && <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase text-center">Actions</th>}
            </tr></thead>
            <tbody>
              {display.map((ch, i) => (
                <tr key={ch.id}
                  className={`border-b border-border hover:bg-muted/40 cursor-pointer group ${
                    selectedIds.has(ch.id) ? "bg-accent/5" : i % 2 === 1 ? "bg-surface-alt/20" : ""
                  }`}
                  onClick={() => onSelectChannel(ch)}>
                  {isAdmin && (
                    <td className="px-2" onClick={e => { e.stopPropagation(); toggleSelect(ch.id); }}>
                      <input type="checkbox" checked={selectedIds.has(ch.id)} onChange={() => toggleSelect(ch.id)} className="rounded" />
                    </td>
                  )}
                  <td className="px-3 py-2"><HealthDot health={ch.health} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-medium text-text-primary truncate flex-1" title={ch.name}>{ch.name}</span>
                      {ch.note && (
                        <span title={ch.note} className="flex-shrink-0">
                          <FileText className="w-3 h-3 text-blue-400" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>
                      <HealthBadge health={ch.health} />
                      {ch.stateChangedAt && (
                        <div className="text-[9px] text-text-muted mt-0.5 flex items-center gap-0.5">
                          <Clock className="w-2 h-2" />{timeSince(ch.stateChangedAt)} ago
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary font-mono">{fmtNum(ch.received)}</td>
                  <td className="px-3 py-2 text-right text-text-secondary font-mono">{fmtNum(ch.sent)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${ch.error > 0 ? "text-red-600" : "text-text-muted"}`}>{fmtNum(ch.error)}</td>
                  <td className="px-3 py-2 text-right text-text-muted font-mono">{fmtNum(ch.filtered)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${ch.queued > 0 ? "text-amber-600" : "text-text-muted"}`}>{fmtNum(ch.queued)}</td>
                  {isAdmin && (
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-center">
                        {ch.state !== "STARTED" && (
                          <button onClick={() => doAction(ch.id, "start")} disabled={!!actioning}
                            className="p-1 rounded hover:bg-green-50 text-green-600 disabled:opacity-40" title="Start">
                            {actioning === `${ch.id}-start` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          </button>
                        )}
                        {ch.state === "STARTED" && (
                          <button onClick={() => doAction(ch.id, "pause")} disabled={!!actioning}
                            className="p-1 rounded hover:bg-yellow-50 text-yellow-600 disabled:opacity-40" title="Pause">
                            {actioning === `${ch.id}-pause` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                          </button>
                        )}
                        {ch.state === "PAUSED" && (
                          <button onClick={() => doAction(ch.id, "resume")} disabled={!!actioning}
                            className="p-1 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-40" title="Resume">
                            {actioning === `${ch.id}-resume` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          </button>
                        )}
                        {ch.state !== "STOPPED" && (
                          <button onClick={() => doAction(ch.id, "stop")} disabled={!!actioning}
                            className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-40" title="Stop">
                            {actioning === `${ch.id}-stop` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                          </button>
                        )}
                        {ch.error > 0 && (
                          <button onClick={() => handleAcknowledge(ch.id, ch.error)} disabled={!!actioning}
                            className="p-1 rounded hover:bg-blue-50 text-blue-500 disabled:opacity-40"
                            title={`Acknowledge ${ch.error} error${ch.error !== 1 ? "s" : ""} \u2014 won't alert again until new errors appear`}>
                            {actioning === `${ch.id}-ack` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          </button>
                        )}
                        <button onClick={() => setSettingsChannel(ch)}
                          className="p-1 rounded hover:bg-muted text-text-muted opacity-0 group-hover:opacity-100"
                          title="Channel settings (note + inactivity)">
                          <Settings className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Events section */}
      <div className="px-6 pb-6">
        <button className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary mb-2"
          onClick={() => { setEventsOpen(v => !v); if (!eventsOpen) loadEvents(); }}>
          {eventsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Server Events
        </button>
        {eventsOpen && (
          <div className="border border-border rounded-lg overflow-hidden">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : events.length === 0 ? (
              <p className="text-sm text-text-muted p-4 text-center">No events</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border bg-surface-alt">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Time</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Level</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Event</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">User</th>
                </tr></thead>
                <tbody>{events.map((ev, i) => (
                  <tr key={ev.id} className={`border-b border-border ${i % 2 === 1 ? "bg-surface-alt/20" : ""}`}>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-text-muted whitespace-nowrap">{fmtTime(ev.dateTime)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase ${
                        ev.level === "ERROR" ? "bg-red-50 text-red-700 border-red-200"
                        : ev.level === "WARNING" ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"}`}>{ev.level}</span>
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">{ev.name}</td>
                    <td className="px-3 py-1.5 text-text-muted">{ev.username || "\u2014"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Channel settings modal — rendered outside any nested div */}
      {settingsChannel && (
        <ChannelSettingsModal
          serverId={server.serverId}
          channel={settingsChannel}
          onClose={() => setSettingsChannel(null)}
          onSaved={(note) => {
            setChannels(prev => prev.map(c => c.id === settingsChannel!.id ? { ...c, note: note || undefined } : c));
          }}
        />
      )}
    </div>
  );
}

// ── Dashboard view ─────────────────────────────────────────────────────────────

function DashboardView({ dashboard, onSelectServer, onSelectChannel }: {
  dashboard: Dashboard;
  onSelectServer: (s: DashboardServer) => void;
  onSelectChannel: (s: DashboardServer, ch: MirthChannel) => void;
}) {
  const { servers, summaryCounts, issueChannels } = dashboard;

  return (
    <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Servers",   value: `${dashboard.reachableServers}/${dashboard.totalServers}`, color: "text-text-primary" },
          { label: "Channels",  value: dashboard.totalChannels, color: "text-text-primary" },
          { label: "Healthy",   value: summaryCounts.healthy  ?? 0, color: "text-green-600" },
          { label: "Error",     value: summaryCounts.error    ?? 0, color: "text-red-600" },
          { label: "Stuck",     value: summaryCounts.stuck    ?? 0, color: "text-amber-600" },
          { label: "Paused",    value: summaryCounts.paused   ?? 0, color: "text-yellow-600" },
          { label: "Down",      value: summaryCounts.down     ?? 0, color: "text-gray-500" },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">{item.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${item.color}`}>{String(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Issues panel */}
      {issueChannels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Issues ({issueChannels.length})
          </h2>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 24 }} /><col style={{ width: 180 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /></colgroup>
              <thead><tr className="border-b border-border bg-surface-alt">
                <th /><th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Server</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Channel</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">State</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-red-500 uppercase">Error</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-amber-600 uppercase">Queued</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted uppercase">Rcvd</th>
              </tr></thead>
              <tbody>
                {issueChannels.map((ch, i) => {
                  const srv = servers.find(s => s.serverId === ch.serverId);
                  return (
                    <tr key={`${ch.serverId}-${ch.id}`}
                      className={`border-b border-border hover:bg-muted/40 cursor-pointer ${i % 2 === 1 ? "bg-surface-alt/20" : ""}`}
                      onClick={() => srv && onSelectChannel(srv, ch)}>
                      <td className="px-3 py-2"><HealthDot health={ch.health} /></td>
                      <td className="px-3 py-2 text-text-muted truncate">{ch.serverName}</td>
                      <td className="px-3 py-2 font-medium text-text-primary truncate">{ch.name}</td>
                      <td className="px-3 py-2"><HealthBadge health={ch.health} /></td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${ch.error > 0 ? "text-red-600" : "text-text-muted"}`}>{fmtNum(ch.error)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${ch.queued > 0 ? "text-amber-600" : "text-text-muted"}`}>{fmtNum(ch.queued)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-muted">{fmtNum(ch.received)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Server cards */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-2">All Servers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map(srv => (
            <button key={srv.serverId} onClick={() => onSelectServer(srv)}
              className="text-left bg-surface border border-border rounded-xl p-4 hover:border-accent transition-colors group">
              <div className="flex items-center gap-2 mb-3">
                <HealthDot health={srv.health} size="sm" />
                <span className="font-semibold text-text-primary group-hover:text-accent transition-colors">{srv.serverName}</span>
                <span className="ml-auto">{srv.reachable ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}</span>
              </div>
              {srv.reachable ? (
                <>
                  <p className="text-[10px] text-text-muted mb-2 font-mono">{srv.url}{srv.version && ` · v${srv.version}`}</p>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {[
                      { label: "Running",  value: srv.healthyCnt,  color: "text-green-600" },
                      { label: "Errors",   value: srv.errorCnt,    color: srv.errorCnt > 0 ? "text-red-600" : "text-text-muted" },
                      { label: "Stuck",    value: srv.stuckCnt,    color: srv.stuckCnt > 0 ? "text-amber-600" : "text-text-muted" },
                      { label: "Down",     value: srv.downCnt,     color: srv.downCnt > 0 ? "text-gray-500" : "text-text-muted" },
                    ].map(s => (
                      <div key={s.label}>
                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[9px] text-text-muted uppercase">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {(srv.totalErrors > 0 || srv.totalQueued > 0) && (
                    <div className="mt-2 pt-2 border-t border-border flex gap-3 text-[10px]">
                      {srv.totalErrors > 0 && <span className="text-red-500 font-medium">{srv.totalErrors} total errors</span>}
                      {srv.totalQueued > 0 && <span className="text-amber-600 font-medium">{srv.totalQueued} queued</span>}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                  <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{srv.error ?? "Unreachable"}</span>
                </div>
              )}
            </button>
          ))}
          {servers.length === 0 && (
            <div className="col-span-3 text-center py-16 text-text-muted">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No Mirth servers configured</p>
              <p className="text-xs mt-1">Ask an admin to add servers in Admin → Mirth</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MirthPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  // Navigation state
  type View = "dashboard" | "server" | "channel";
  const [view, setView] = useState<View>("dashboard");
  const [selectedServer, setSelectedServer] = useState<DashboardServer | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<MirthChannel | null>(null);

  // Data
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<MirthServerPublic[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Server management
  const [showServerForm, setShowServerForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MirthServerPublic | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const runQueryRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setIsAdmin(!!d.user?.isAdmin)).catch(() => {});
  }, []);

  const selectedServerIdRef = useRef<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/mirth/dashboard");
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); }
      else {
        setDashboard(d);
        // Update selected server without adding it as a dependency (avoids infinite loop)
        if (selectedServerIdRef.current) {
          const updated = (d as Dashboard).servers.find(s => s.serverId === selectedServerIdRef.current);
          if (updated) setSelectedServer(updated);
        }
      }
    } catch { setError("Network error"); }
    setLoading(false);
  }, []); // no deps — uses ref to avoid infinite loop

  // Keep ref in sync with state without triggering loadDashboard re-creation
  useEffect(() => { selectedServerIdRef.current = selectedServer?.serverId ?? null; }, [selectedServer]);

  const loadServers = useCallback(async () => {
    const r = await fetch("/api/mirth/servers").catch(() => null);
    if (r?.ok) { const d = await r.json(); setServers(d.servers ?? []); }
  }, []);

  useEffect(() => { loadDashboard(); loadServers(); }, [loadDashboard, loadServers]);

  useEffect(() => { runQueryRef.current = loadDashboard; });
  useEffect(() => {
    if (autoRefresh === 0) return;
    const id = setInterval(() => runQueryRef.current(), autoRefresh * 1000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const handleDeleteServer = async (id: string) => {
    if (!confirm("Delete this Mirth server?")) return;
    setDeletingId(id);
    await fetch(`/api/mirth/servers/${id}`, { method: "DELETE" }).catch(() => {});
    setDeletingId(null);
    loadServers(); loadDashboard();
  };

  const goToDashboard = () => { setView("dashboard"); setSelectedServer(null); setSelectedChannel(null); };
  const goToServer = (s: DashboardServer) => { setView("server"); setSelectedServer(s); setSelectedChannel(null); };
  const goToChannel = (s: DashboardServer, ch: MirthChannel) => { setSelectedServer(s); setSelectedChannel(ch); setView("channel"); };

  const toggleExpanded = (id: string) => setExpandedServers(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="jp-root">

      {/* Header */}
      <header className="jp-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <GitBranch className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">Mirth Connect</h1>
          {/* Breadcrumb */}
          {view !== "dashboard" && selectedServer && (
            <>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <button onClick={() => goToServer(selectedServer)} className="text-sm text-text-secondary hover:text-accent transition-colors">{selectedServer.serverName}</button>
            </>
          )}
          {view === "channel" && selectedChannel && (
            <>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-primary">{selectedChannel.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Timer className="w-3 h-3 text-text-muted flex-shrink-0" />
            <select value={autoRefresh} onChange={e => setAutoRefresh(Number(e.target.value))}
              className="text-xs px-2 py-1 border border-border rounded-lg bg-surface text-text-secondary">
              {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={loadDashboard} disabled={loading} className="jp-action-btn jp-action-btn--primary disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="jp-main flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="jp-sidebar flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* Dashboard link */}
            <button onClick={goToDashboard}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm font-medium transition-colors ${view === "dashboard" ? "bg-accent text-white" : "text-text-secondary hover:bg-muted"}`}>
              <Activity className="w-4 h-4 flex-shrink-0" />
              Dashboard
              {dashboard && (dashboard.summaryCounts.error ?? 0) + (dashboard.summaryCounts.down ?? 0) > 0 && (
                <span className="ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {(dashboard.summaryCounts.error ?? 0) + (dashboard.summaryCounts.down ?? 0)}
                </span>
              )}
            </button>

            {/* Server list */}
            <div className="jp-section">
              <h3 className="jp-section-title">Servers</h3>
              <div className="space-y-0.5">
                {(dashboard?.servers ?? []).map(srv => (
                  <div key={srv.serverId}>
                    <div className={`flex items-center gap-1.5 rounded group ${view === "server" && selectedServer?.serverId === srv.serverId ? "bg-muted" : ""}`}>
                      <button onClick={() => toggleExpanded(srv.serverId)} className="p-0.5 text-text-muted hover:text-text-primary">
                        {expandedServers.has(srv.serverId) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      <button onClick={() => goToServer(srv)} className="flex-1 flex items-center gap-1.5 py-1 text-left">
                        <HealthDot health={srv.health} size="xs" />
                        <span className="text-xs text-text-secondary group-hover:text-text-primary truncate flex-1">{srv.serverName}</span>
                        {srv.errorCnt > 0 && <span className="text-[9px] font-bold text-red-500">{srv.errorCnt}</span>}
                      </button>
                      {isAdmin && (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                          <button onClick={() => { const s = servers.find(x => x.id === srv.serverId); setEditingServer(s); setShowServerForm(true); }}
                            className="p-0.5 rounded hover:bg-muted text-text-muted"><Edit2 className="w-2.5 h-2.5" /></button>
                          <button onClick={() => handleDeleteServer(srv.serverId)} disabled={deletingId === srv.serverId}
                            className="p-0.5 rounded hover:bg-red-50 text-text-muted hover:text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>
                        </div>
                      )}
                    </div>
                    {expandedServers.has(srv.serverId) && (
                      <div className="ml-5 space-y-0.5 mt-0.5">
                        {srv.channels.map(ch => (
                          <button key={ch.id} onClick={() => goToChannel(srv, ch)}
                            className={`w-full flex items-center gap-1.5 py-0.5 px-1.5 rounded text-left hover:bg-muted ${view === "channel" && selectedChannel?.id === ch.id && selectedServer?.serverId === srv.serverId ? "bg-muted" : ""}`}>
                            <HealthDot health={ch.health} size="xs" />
                            <span className="text-[11px] text-text-muted hover:text-text-primary truncate">{ch.name}</span>
                          </button>
                        ))}
                        {srv.channels.length === 0 && <p className="text-[10px] text-text-muted italic px-2 py-0.5">{srv.reachable ? "No channels" : "Unreachable"}</p>}
                      </div>
                    )}
                  </div>
                ))}
                {(!dashboard || dashboard.servers.length === 0) && (
                  <p className="text-xs text-text-muted italic px-2 py-1">No servers</p>
                )}
              </div>
            </div>
          </div>

          {/* Add server button (admin) */}
          {isAdmin && (
            <div className="flex-shrink-0 border-t border-border pt-3">
              <button onClick={() => { setEditingServer(undefined); setShowServerForm(true); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-text-secondary hover:bg-muted hover:text-text-primary transition-colors">
                <Plus className="w-4 h-4" /> Add Server
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {error && (
            <div className="flex-shrink-0 mx-6 mt-4 flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {view === "dashboard" && (
            dashboard
              ? <DashboardView dashboard={dashboard} onSelectServer={goToServer} onSelectChannel={goToChannel} />
              : <div className="flex items-center justify-center flex-1">
                  {loading
                    ? <RefreshCw className="w-8 h-8 animate-spin text-text-muted" />
                    : <div className="jp-empty"><Info className="w-10 h-10 text-text-muted opacity-30 mb-3" /><p className="text-text-muted">No data</p></div>}
                </div>
          )}

          {view === "server" && selectedServer && (
            <ServerDetail server={selectedServer} isAdmin={isAdmin} onSelectChannel={ch => goToChannel(selectedServer, ch)} />
          )}

          {view === "channel" && selectedServer && selectedChannel && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center gap-3">
                <HealthDot health={selectedChannel.health} />
                <span className="font-semibold text-text-primary">{selectedChannel.name}</span>
                <HealthBadge health={selectedChannel.health} />
                <span className="text-xs text-text-muted">{fmtNum(selectedChannel.received)} rcvd · {fmtNum(selectedChannel.sent)} sent · <span className={selectedChannel.error > 0 ? "text-red-600 font-semibold" : ""}>{fmtNum(selectedChannel.error)} err</span> · <span className={selectedChannel.queued > 0 ? "text-amber-600 font-semibold" : ""}>{fmtNum(selectedChannel.queued)} queued</span></span>
              </div>
              <ChannelExplorer serverId={selectedServer.serverId} channel={selectedChannel} />
            </div>
          )}
        </div>
      </div>

      {/* Server form modal */}
      {showServerForm && (
        <ServerFormModal
          initial={editingServer}
          onClose={() => { setShowServerForm(false); setEditingServer(undefined); }}
          onSaved={() => { loadServers(); loadDashboard(); }}
        />
      )}
    </div>
  );
}
