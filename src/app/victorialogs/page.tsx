"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, AppWindow, ArrowLeft, Bookmark, BookmarkPlus,
  Check, ChevronDown, ChevronRight, Clock, Copy, Download, Filter,
  Play, RefreshCw, Save, Search, Server, Tag, Timer, Trash2, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LogEntry {
  _time?: string;
  _msg?: string;
  _stream?: string;
  [key: string]: string | undefined;
}

interface FieldValue { value: string; hits: number; }

interface Overview {
  hosts: FieldValue[];
  apps: FieldValue[];
  eventTypes: FieldValue[];
}

interface SavedQuery {
  id: number;
  name: string;
  query: string;
  time_range: string;
  row_limit: number;
  created_by: string;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "All Logs",       query: "*" },
  { label: "VMware Changes", query: "\"vmware.change\"" },
  { label: "Errors",         query: "error" },
  { label: "Doc Changes",    query: "\"doc.create\" OR \"doc.update\" OR \"doc.delete\"" },
] as const;

const TIME_OPTIONS = ["15m", "1h", "6h", "24h", "7d"] as const;
const LIMIT_OPTIONS = [100, 500, 1000, 5000] as const;
const REFRESH_OPTIONS = [
  { label: "Off",   value: 0   },
  { label: "10 s",  value: 10  },
  { label: "30 s",  value: 30  },
  { label: "1 min", value: 60  },
  { label: "5 min", value: 300 },
] as const;

const RECENT_KEY = "docit-vl-recent";
const MAX_RECENT = 10;
const RESERVED = new Set(["_time", "_msg", "_stream"]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtHits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function tryParseJson(s: string): Record<string, unknown> | null {
  if (!s || s[0] !== "{") return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {}
  return null;
}

/** Append a field filter to the current query (replaces if query is * or empty). */
function buildFilter(currentQuery: string, field: string, value: string): string {
  const q = currentQuery.trim();
  const filter = `${field}:"${value}"`;
  if (!q || q === "*") return filter;
  return `${q} AND ${filter}`;
}

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

function saveRecent(q: string) {
  const prev = loadRecent().filter((r) => r !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
}

function downloadBlob(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function doExportCSV(entries: LogEntry[]) {
  if (!entries.length) return;
  const keys = Array.from(new Set(entries.flatMap((e) => Object.keys(e))));
  const header = keys.map((k) => `"${k}"`).join(",");
  const rows = entries.map((e) =>
    keys.map((k) => `"${(e[k] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  downloadBlob("logs.csv", [header, ...rows].join("\n"), "text/csv");
}

function doExportJSON(entries: LogEntry[]) {
  downloadBlob("logs.json", JSON.stringify(entries, null, 2), "application/json");
}

// ── SourceList ─────────────────────────────────────────────────────────────────

function SourceList({
  title,
  icon: Icon,
  items,
  loading,
  onSelect,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: FieldValue[];
  loading: boolean;
  onSelect: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_LIMIT = 6;
  const visible = showAll ? items : items.slice(0, VISIBLE_LIMIT);

  return (
    <div className="jp-section">
      <h3 className="jp-section-title flex items-center gap-1">
        <Icon className="w-3 h-3" /> {title}
      </h3>
      {loading ? (
        <p className="text-xs text-text-muted italic">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-muted italic">No data in last 24h</p>
      ) : (
        <>
          <div className="space-y-0.5">
            {visible.map((item) => (
              <button
                key={item.value}
                onClick={() => onSelect(item.value)}
                className="w-full flex items-center justify-between px-1.5 py-1 rounded text-left hover:bg-muted group"
                title={`Add filter: ${item.value}`}
              >
                <span className="text-xs text-text-secondary truncate flex-1 group-hover:text-text-primary">
                  {item.value}
                </span>
                <span className="text-[10px] text-text-muted ml-1.5 flex-shrink-0 font-mono">
                  {fmtHits(item.hits)}
                </span>
              </button>
            ))}
          </div>
          {items.length > VISIBLE_LIMIT && (
            <button className="jp-tiny-btn mt-1" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `+${items.length - VISIBLE_LIMIT} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── LogRow ─────────────────────────────────────────────────────────────────────

function LogRow({
  entry,
  index,
  onAddFilter,
}: {
  entry: LogEntry;
  index: number;
  onAddFilter: (field: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const msg = entry._msg ?? "";
  const stream = entry._stream ?? "";
  const parsed = tryParseJson(msg);
  const extra = Object.entries(entry).filter(([k]) => !RESERVED.has(k));
  const canExpand = !!(parsed || extra.length > 0);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <tr
        className={`border-b border-border hover:bg-muted/40 cursor-pointer group ${
          index % 2 === 1 ? "bg-surface-alt/20" : ""
        }`}
        onClick={() => canExpand && setExpanded((v) => !v)}
      >
        <td className="px-3 py-1.5 align-top text-[10px] text-text-muted font-mono whitespace-nowrap w-[148px] flex-shrink-0">
          {entry._time ? fmtTime(entry._time) : "—"}
        </td>
        <td className="px-3 py-1.5 align-top text-[10px] text-text-muted font-mono w-[160px] max-w-[160px] truncate">
          <span title={stream}>{stream || "—"}</span>
        </td>
        <td className="px-3 py-1.5 align-top">
          <div className="flex items-start gap-1.5 min-w-0">
            {canExpand ? (
              expanded
                ? <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5 text-text-muted" />
                : <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-text-muted" />
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <span className="text-xs font-mono text-text-primary truncate" title={msg}>
              {msg || <span className="text-text-muted italic">(empty)</span>}
            </span>
          </div>
        </td>
        <td className="px-2 py-1.5 w-7 align-top">
          <button
            onClick={handleCopy}
            className="p-0.5 rounded hover:bg-muted text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy entry as JSON"
          >
            {copied
              ? <Check className="w-3 h-3 text-green-500" />
              : <Copy className="w-3 h-3" />}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={4} className="px-6 py-3 bg-surface-alt/60">
            {parsed && (
              <div className="mb-2 space-y-0.5">
                {Object.entries(parsed).map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs font-mono group/field items-center">
                    <span className="text-accent w-28 flex-shrink-0 truncate" title={k}>{k}</span>
                    <span className="text-text-primary break-all flex-1">{String(v)}</span>
                    <button
                      onClick={() => onAddFilter(k, String(v))}
                      className="opacity-0 group-hover/field:opacity-100 p-0.5 rounded hover:bg-muted text-text-muted hover:text-accent flex-shrink-0"
                      title={`Filter: ${k}:"${String(v)}"`}
                    >
                      <Filter className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {extra.length > 0 && (
              <div className={`space-y-0.5 ${parsed ? "pt-2 border-t border-border" : ""}`}>
                {extra.map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs font-mono group/field items-center">
                    <span className="text-text-muted w-28 flex-shrink-0 truncate" title={k}>{k}</span>
                    <span className="text-text-secondary break-all flex-1">{v ?? ""}</span>
                    <button
                      onClick={() => onAddFilter(k, v ?? "")}
                      className="opacity-0 group-hover/field:opacity-100 p-0.5 rounded hover:bg-muted text-text-muted hover:text-accent flex-shrink-0"
                      title={`Filter: ${k}:"${v}"`}
                    >
                      <Filter className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!parsed && (
              <div className="text-xs font-mono text-text-primary break-all whitespace-pre-wrap max-h-40 overflow-auto">
                {msg}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VictoriaLogsPage() {
  const router = useRouter();

  // Query state
  const [query, setQuery] = useState("*");
  const [timeRange, setTimeRange] = useState<string>("1h");
  const [limit, setLimit] = useState(500);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [clientSearch, setClientSearch] = useState("");

  // Results
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Connectivity
  const [configured, setConfigured] = useState<boolean | null>(null);

  // Sidebar overview
  const [overview, setOverview] = useState<Overview>({ hosts: [], apps: [], eventTypes: [] });
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Saved queries
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Recent queries
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  // Host filter
  const [selectedHost, setSelectedHost] = useState("");
  const [configuredHosts, setConfiguredHosts] = useState<{ hostname: string; label: string }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const runQueryRef = useRef<() => void>(() => {});

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/victorialogs/check")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.allowed))
      .catch(() => setConfigured(false));
    setRecentQueries(loadRecent());
    // Fetch configured hosts for filter dropdown
    fetch("/api/victorialogs/hosts")
      .then((r) => r.json())
      .then((d) => { if (d.hosts) setConfiguredHosts(d.hosts); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!configured) return;
    setOverviewLoading(true);
    fetch("/api/victorialogs/overview")
      .then((r) => r.json())
      .then((d: Overview) => { if (d.hosts) setOverview(d); })
      .catch(() => {})
      .finally(() => setOverviewLoading(false));
  }, [configured]);

  const loadSavedQueries = useCallback(async () => {
    setSavedLoading(true);
    try {
      const r = await fetch("/api/victorialogs/saved-queries");
      const d = await r.json();
      if (d.queries) setSavedQueries(d.queries as SavedQuery[]);
    } catch {}
    setSavedLoading(false);
  }, []);

  useEffect(() => { loadSavedQueries(); }, [loadSavedQueries]);

  // ── Core query runner ────────────────────────────────────────────────────────

  /** Wrap a query with the selected host filter if one is active. */
  const wrapHostFilter = useCallback((q: string): string => {
    if (!selectedHost) return q;
    const hostClause = `hostname:"${selectedHost}"`;
    const trimmed = q.trim();
    if (!trimmed || trimmed === "*") return hostClause;
    return `${hostClause} AND ${trimmed}`;
  }, [selectedHost]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/victorialogs/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: wrapHostFilter(query.trim() || "*"),
          start: `now-${timeRange}`,
          end: "now",
          limit,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || `HTTP ${res.status}`);
      } else {
        setEntries(d.entries ?? []);
        setDurationMs(Date.now() - t0);
        const q = query.trim() || "*";
        if (q !== "*") {
          saveRecent(q);
          setRecentQueries(loadRecent());
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
    setLoading(false);
  }, [query, timeRange, limit, wrapHostFilter]);

  // Keep ref in sync so auto-refresh always calls the latest closure
  useEffect(() => { runQueryRef.current = runQuery; });

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh === 0) return;
    const id = setInterval(() => runQueryRef.current(), autoRefresh * 1000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // ── Fire-and-forget query helper ─────────────────────────────────────────────

  const runImmediate = useCallback((q: string, tr: string, lim: number) => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    fetch("/api/victorialogs/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: wrapHostFilter(q), start: `now-${tr}`, end: "now", limit: lim }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else { setEntries(d.entries ?? []); setDurationMs(Date.now() - t0); }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setLoading(false));
  }, [wrapHostFilter]);

  // ── Sidebar click handlers ───────────────────────────────────────────────────

  const applyFilter = useCallback((field: string, value: string) => {
    const newQuery = buildFilter(query, field, value);
    setQuery(newQuery);
    runImmediate(newQuery, timeRange, limit);
  }, [query, timeRange, limit, runImmediate]);

  const applySavedQuery = useCallback((sq: { query: string; time_range?: string; row_limit?: number }) => {
    const q = sq.query;
    const tr = sq.time_range ?? timeRange;
    const lim = sq.row_limit ?? limit;
    setQuery(q);
    if (sq.time_range) setTimeRange(sq.time_range);
    if (sq.row_limit) setLimit(sq.row_limit);
    runImmediate(q, tr, lim);
  }, [timeRange, limit, runImmediate]);

  const selectPreset = (q: string) => {
    setQuery(q);
    runImmediate(q, timeRange, limit);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) runQuery();
    if (e.key === "Escape") inputRef.current?.blur();
  };

  // ── Save query ───────────────────────────────────────────────────────────────

  const handleSaveQuery = async () => {
    if (!saveName.trim() || !query.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/victorialogs/saved-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), query: query.trim(), timeRange, rowLimit: limit }),
      });
      if (r.ok) {
        setShowSaveModal(false);
        setSaveName("");
        loadSavedQueries();
      }
    } catch {}
    setSaving(false);
  };

  const handleDeleteSaved = async (id: number) => {
    try {
      await fetch(`/api/victorialogs/saved-queries/${id}`, { method: "DELETE" });
      setSavedQueries((qs) => qs.filter((s) => s.id !== id));
    } catch {}
  };

  // ── Client-side search ───────────────────────────────────────────────────────

  const displayEntries = useMemo(() => {
    if (!clientSearch.trim()) return entries;
    const term = clientSearch.toLowerCase();
    return entries.filter((e) =>
      Object.values(e).some((v) => v?.toLowerCase().includes(term))
    );
  }, [entries, clientSearch]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="jp-root">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="jp-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Activity className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">VictoriaLogs</h1>
          {configured !== null && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
              configured
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {configured ? "● Connected" : "● Not configured"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSaveModal(true); setSaveName(""); }}
            disabled={!query.trim() || query === "*"}
            className="jp-action-btn disabled:opacity-40"
            title="Save current query"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Save Query
          </button>
          <button
            onClick={runQuery}
            disabled={loading || !configured}
            className="jp-action-btn jp-action-btn--primary disabled:opacity-40"
            title="Re-run current query"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Running…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="jp-main flex-1 overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="jp-sidebar">
          <SourceList
            title="Hosts"
            icon={Server}
            items={overview.hosts}
            loading={overviewLoading}
            onSelect={(v) => applyFilter("hostname", v)}
          />
          <SourceList
            title="Applications"
            icon={AppWindow}
            items={overview.apps}
            loading={overviewLoading}
            onSelect={(v) => applyFilter("app_name", v)}
          />
          <SourceList
            title="Event Types"
            icon={Tag}
            items={overview.eventTypes}
            loading={overviewLoading}
            onSelect={(v) => applyFilter("msg_id", v)}
          />

          {/* Saved Queries */}
          <div className="jp-section">
            <h3 className="jp-section-title flex items-center gap-1">
              <Bookmark className="w-3 h-3" /> Saved Queries
            </h3>
            {savedLoading ? (
              <p className="text-xs text-text-muted italic">Loading…</p>
            ) : savedQueries.length === 0 ? (
              <p className="text-xs text-text-muted italic">No saved queries yet</p>
            ) : (
              <div className="space-y-1">
                {savedQueries.map((sq) => (
                  <div key={sq.id} className="group flex items-start gap-1">
                    <button
                      onClick={() => applySavedQuery(sq)}
                      className="flex-1 text-left px-1.5 py-1 rounded hover:bg-muted min-w-0"
                      title={sq.query}
                    >
                      <p className="text-xs text-text-primary font-medium truncate">{sq.name}</p>
                      <p className="text-[10px] text-text-muted font-mono truncate">{sq.query}</p>
                      <p className="text-[10px] text-text-muted">{sq.time_range} · {sq.row_limit} rows</p>
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(sq.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500 flex-shrink-0 mt-0.5"
                      title="Delete saved query"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Queries */}
          {recentQueries.length > 0 && (
            <div className="jp-section">
              <h3 className="jp-section-title flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent
              </h3>
              <div className="space-y-0.5">
                {recentQueries.map((q) => (
                  <button
                    key={q}
                    onClick={() => applySavedQuery({ query: q })}
                    className="w-full text-left px-1.5 py-1 rounded hover:bg-muted text-xs text-text-secondary font-mono truncate block"
                    title={q}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Query bar */}
          <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-3 space-y-2">
            {/* Input + Run */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='LogsQL query — e.g. * or hostname:"server01" or error'
                  className="w-full px-3 py-2 text-sm font-mono bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent placeholder:text-text-muted"
                />
                {query !== "*" && query !== "" && (
                  <button
                    onClick={() => setQuery("*")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
                    title="Clear query"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={runQuery}
                disabled={loading || !configured}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </button>
            </div>

            {/* Presets + options row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Preset:</span>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => selectPreset(p.query)}
                  className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                    query === p.query
                      ? "bg-accent text-white border-accent"
                      : "border-border text-text-secondary hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}

              {/* Host filter */}
              {(configuredHosts.length > 0 || overview.hosts.length > 0) && (
                <>
                  <span className="text-[10px] text-text-muted uppercase tracking-wide font-medium ml-2">Host:</span>
                  <select
                    value={selectedHost}
                    onChange={(e) => { setSelectedHost(e.target.value); }}
                    className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                      selectedHost
                        ? "bg-accent text-white border-accent"
                        : "border-border text-text-secondary bg-surface"
                    }`}
                  >
                    <option value="">All hosts</option>
                    {/* Configured (admin-managed) hosts first */}
                    {configuredHosts.length > 0 && (
                      <optgroup label="Configured">
                        {configuredHosts.map((h) => (
                          <option key={`c-${h.hostname}`} value={h.hostname}>
                            {h.label ? `${h.label} (${h.hostname})` : h.hostname}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Auto-discovered hosts (from overview, excluding already configured) */}
                    {(() => {
                      const cfgSet = new Set(configuredHosts.map((h) => h.hostname));
                      const discovered = overview.hosts.filter((h) => !cfgSet.has(h.value));
                      if (discovered.length === 0) return null;
                      return (
                        <optgroup label="Discovered">
                          {discovered.map((h) => (
                            <option key={`d-${h.value}`} value={h.value}>{h.value}</option>
                          ))}
                        </optgroup>
                      );
                    })()}
                  </select>
                </>
              )}

              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Last:</span>
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeRange(t)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      timeRange === t
                        ? "bg-accent text-white border-accent"
                        : "border-border text-text-secondary hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="text-xs px-2 py-1 border border-border rounded-lg bg-surface text-text-secondary"
                >
                  {LIMIT_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l} rows</option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <Timer className="w-3 h-3 text-text-muted flex-shrink-0" />
                  <select
                    value={autoRefresh}
                    onChange={(e) => setAutoRefresh(Number(e.target.value))}
                    className="text-xs px-2 py-1 border border-border rounded-lg bg-surface text-text-secondary"
                    title="Auto-refresh"
                  >
                    {REFRESH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-text-muted absolute left-1.5 pointer-events-none" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Filter results…"
                    className="pl-6 pr-6 py-1 text-xs border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent w-32"
                  />
                  {clientSearch && (
                    <button
                      onClick={() => setClientSearch("")}
                      className="absolute right-1.5 text-text-muted hover:text-text-primary"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {configured === false ? (
              <div className="jp-empty">
                <AlertTriangle className="w-10 h-10 text-amber-400 opacity-80 mb-3" />
                <p className="text-text-primary font-medium mb-1">VictoriaLogs not configured</p>
                <p className="text-xs text-text-muted text-center max-w-xs">
                  Set a <strong>Syslog host</strong> in <strong>Admin → Audit → Settings</strong>.
                  The module queries <code className="font-mono">http://&lt;host&gt;:9428</code>.
                </p>
              </div>

            ) : loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
              </div>

            ) : error ? (
              <div className="jp-empty">
                <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-sm text-red-600 font-medium mb-1">Query failed</p>
                <p className="text-xs text-text-muted text-center max-w-sm">{error}</p>
              </div>

            ) : displayEntries.length === 0 && durationMs !== null ? (
              <div className="jp-empty">
                <Activity className="w-10 h-10 text-text-muted opacity-30 mb-3" />
                <p className="text-text-muted">
                  {clientSearch ? `No entries match "${clientSearch}"` : "No log entries found"}
                </p>
                {!clientSearch && (
                  <p className="text-xs text-text-muted mt-1">Try a wider time range or different query</p>
                )}
              </div>

            ) : displayEntries.length > 0 ? (
              <>
                {/* Status bar */}
                <div className="sticky top-0 z-10 px-4 py-1.5 flex items-center gap-3 border-b border-border bg-surface-alt text-xs text-text-muted">
                  <span className="font-semibold text-text-primary">
                    {displayEntries.length.toLocaleString()}
                    {clientSearch && entries.length !== displayEntries.length
                      ? ` of ${entries.length.toLocaleString()}`
                      : ""} entries
                  </span>
                  {durationMs !== null && <span>{durationMs} ms</span>}
                  <span>·</span>
                  <span>Last {timeRange}</span>
                  {autoRefresh > 0 && (
                    <span className="text-green-600 font-medium">
                      · Auto {REFRESH_OPTIONS.find((o) => o.value === autoRefresh)?.label}
                    </span>
                  )}
                  {entries.length >= limit && (
                    <span className="text-amber-600 font-medium">
                      · Limit reached — increase row count for more
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => doExportCSV(displayEntries)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted text-text-secondary"
                      title="Export as CSV"
                    >
                      <Download className="w-3 h-3" /> CSV
                    </button>
                    <button
                      onClick={() => doExportJSON(displayEntries)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted text-text-secondary"
                      title="Export as JSON"
                    >
                      <Download className="w-3 h-3" /> JSON
                    </button>
                  </div>
                </div>

                <table className="w-full" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 148 }} />
                    <col style={{ width: 160 }} />
                    <col />
                    <col style={{ width: 28 }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide">Time</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide">Stream</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide">Message</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayEntries.map((entry, i) => (
                      <LogRow key={i} entry={entry} index={i} onAddFilter={applyFilter} />
                    ))}
                  </tbody>
                </table>
              </>

            ) : (
              <div className="jp-empty">
                <Activity className="w-12 h-12 text-text-muted opacity-20 mb-4" />
                <p className="text-text-muted font-medium">Run a query to explore logs</p>
                <p className="text-xs text-text-muted mt-1 text-center max-w-xs">
                  Use the query bar above, pick a preset, or click a host / app in the sidebar.
                </p>
                {configured && (
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => selectPreset(p.query)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-muted hover:text-text-primary transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save Query Modal ─────────────────────────────────────────────────── */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-accent" /> Save Query
              </h2>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-1 rounded hover:bg-muted text-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveQuery(); }}
                  placeholder="e.g. VMware errors last hour"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Query</label>
                <p className="text-xs font-mono text-text-muted bg-surface-alt px-3 py-2 rounded-lg border border-border truncate">
                  {query}
                </p>
              </div>
              <div className="flex gap-4 text-xs text-text-muted">
                <span>Time: <strong className="text-text-primary">{timeRange}</strong></span>
                <span>Limit: <strong className="text-text-primary">{limit} rows</strong></span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuery}
                disabled={!saveName.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
