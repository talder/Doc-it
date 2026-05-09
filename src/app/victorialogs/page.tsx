"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Activity, RefreshCw, Play, ChevronRight, ChevronDown,
  Copy, Check, AlertTriangle, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  _time?: string;
  _msg?: string;
  _stream?: string;
  [key: string]: string | undefined;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "All Logs",        query: "*" },
  { label: "VMware Changes",  query: "\"vmware.change\"" },
  { label: "Errors",          query: "error" },
  { label: "Doc Changes",     query: "\"doc.create\" OR \"doc.update\" OR \"doc.delete\"" },
] as const;

const TIME_OPTIONS = ["15m", "1h", "6h", "24h", "7d"] as const;
const LIMIT_OPTIONS = [100, 500, 1000, 5000] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function tryParseJson(s: string): Record<string, unknown> | null {
  if (!s || s[0] !== "{") return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {}
  return null;
}

/** Reserved fields rendered separately — excluded from the expanded key-value list */
const RESERVED = new Set(["_time", "_msg", "_stream"]);

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ entry, index }: { entry: LogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const msg     = entry._msg ?? "";
  const stream  = entry._stream ?? "";
  const parsed  = tryParseJson(msg);
  const extra   = Object.entries(entry).filter(([k]) => !RESERVED.has(k));
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
        className={`border-b border-border hover:bg-muted/40 cursor-pointer group ${index % 2 === 1 ? "bg-surface-alt/20" : ""}`}
        onClick={() => canExpand && setExpanded((v) => !v)}
      >
        {/* Time */}
        <td className="px-3 py-1.5 align-top text-[10px] text-text-muted font-mono whitespace-nowrap w-[148px] flex-shrink-0">
          {entry._time ? fmtTime(entry._time) : "—"}
        </td>
        {/* Stream */}
        <td className="px-3 py-1.5 align-top text-[10px] text-text-muted font-mono w-[160px] max-w-[160px] truncate">
          <span title={stream}>{stream || "—"}</span>
        </td>
        {/* Message */}
        <td className="px-3 py-1.5 align-top">
          <div className="flex items-start gap-1.5 min-w-0">
            {canExpand ? (
              expanded
                ? <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5 text-text-muted" />
                : <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-text-muted" />
            ) : <span className="w-3 flex-shrink-0" />}
            <span className="text-xs font-mono text-text-primary truncate" title={msg}>
              {msg || <span className="text-text-muted italic">(empty)</span>}
            </span>
          </div>
        </td>
        {/* Copy */}
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
            {/* Parsed JSON body */}
            {parsed && (
              <div className="mb-2 space-y-0.5">
                {Object.entries(parsed).map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs font-mono">
                    <span className="text-accent w-28 flex-shrink-0 truncate" title={k}>{k}</span>
                    <span className="text-text-primary break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Extra VictoriaLogs fields */}
            {extra.length > 0 && (
              <div className={`space-y-0.5 ${parsed ? "pt-2 border-t border-border" : ""}`}>
                {extra.map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs font-mono">
                    <span className="text-text-muted w-28 flex-shrink-0 truncate" title={k}>{k}</span>
                    <span className="text-text-secondary break-all">{v ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Raw message if not JSON */}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VictoriaLogsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("*");
  const [timeRange, setTimeRange] = useState<string>("1h");
  const [limit, setLimit] = useState(500);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/victorialogs/check")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.allowed))
      .catch(() => setConfigured(false));
  }, []);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/victorialogs/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() || "*", start: `now-${timeRange}`, end: "now", limit }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || `HTTP ${res.status}`);
      } else {
        setEntries(d.entries ?? []);
        setDurationMs(Date.now() - t0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
    setLoading(false);
  }, [query, timeRange, limit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) runQuery();
    if (e.key === "Escape") inputRef.current?.blur();
  };

  const selectPreset = (q: string) => {
    setQuery(q);
    // auto-run with new query
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    fetch("/api/victorialogs/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q || "*", start: `now-${timeRange}`, end: "now", limit }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setEntries(d.entries ?? []); setDurationMs(Date.now() - t0); }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setLoading(false));
  };

  return (
    <div className="jp-root" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

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

      {/* ── Query bar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-3 space-y-2.5">
        {/* Query input + Run */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='LogsQL query — e.g. * or "vmware.change" or error'
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

        {/* Presets · Time range · Limit */}
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

          <div className="ml-auto flex items-center gap-1.5">
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
              className="ml-1 text-xs px-2 py-1 border border-border rounded-lg bg-surface text-text-secondary"
            >
              {LIMIT_OPTIONS.map((l) => (
                <option key={l} value={l}>{l} rows</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* Not configured */}
        {configured === false ? (
          <div className="jp-empty">
            <AlertTriangle className="w-10 h-10 text-amber-400 opacity-80 mb-3" />
            <p className="text-text-primary font-medium mb-1">VictoriaLogs not configured</p>
            <p className="text-xs text-text-muted text-center max-w-xs">
              Set a <strong>Syslog host</strong> in <strong>Admin → Audit → Settings</strong>.
              The module queries <code className="font-mono">http://&lt;host&gt;:9428</code>.
            </p>
          </div>

        /* Loading spinner */
        ) : loading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
          </div>

        /* Error */
        ) : error ? (
          <div className="jp-empty">
            <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-red-600 font-medium mb-1">Query failed</p>
            <p className="text-xs text-text-muted text-center max-w-sm">{error}</p>
          </div>

        /* No results after a run */
        ) : entries.length === 0 && durationMs !== null ? (
          <div className="jp-empty">
            <Activity className="w-10 h-10 text-text-muted opacity-30 mb-3" />
            <p className="text-text-muted">No log entries found</p>
            <p className="text-xs text-text-muted mt-1">Try a wider time range or a different query</p>
          </div>

        /* Results table */
        ) : entries.length > 0 ? (
          <>
            {/* Status bar */}
            <div className="sticky top-0 z-10 px-4 py-1.5 flex items-center gap-3 border-b border-border bg-surface-alt text-xs text-text-muted">
              <span className="font-semibold text-text-primary">{entries.length.toLocaleString()} entries</span>
              {durationMs !== null && <span>{durationMs} ms</span>}
              <span className="text-text-muted">·</span>
              <span>Last {timeRange}</span>
              {entries.length >= limit && (
                <span className="text-amber-600 font-medium">
                  · Limit reached — increase row count to see more
                </span>
              )}
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
                {entries.map((entry, i) => (
                  <LogRow key={i} entry={entry} index={i} />
                ))}
              </tbody>
            </table>
          </>

        /* Initial empty state */
        ) : (
          <div className="jp-empty">
            <Activity className="w-12 h-12 text-text-muted opacity-20 mb-4" />
            <p className="text-text-muted font-medium">Run a query to explore logs</p>
            <p className="text-xs text-text-muted mt-1 text-center max-w-xs">
              Use the query bar above, pick a preset, or press <kbd className="font-mono bg-muted px-1 rounded text-[10px]">Enter</kbd> to run.
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
  );
}
