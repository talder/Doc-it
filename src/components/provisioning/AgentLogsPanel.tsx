"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Download, FileText, Info, Loader2, RefreshCw, Server, XCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  host: string;
}

type LevelFilter = "" | "ERROR" | "WARN" | "INFO";

// Host colour palette — cycles through for multi-host differentiation
const HOST_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentLogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [hostFilter, setHostFilter] = useState("");
  const [maxLines, setMaxLines] = useState(200);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ lines: String(maxLines) });
      if (levelFilter) params.set("level", levelFilter);
      const res = await fetch(`/api/provisioning/agent-logs?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Failed: HTTP ${res.status}`);
      }
      const d = await res.json();
      setEntries(d.entries ?? []);
      setHosts(d.hosts ?? []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    }
    setLoading(false);
  }, [levelFilter, maxLines]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(loadLogs, 15_000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, loadLogs]);

  // CSV export
  const exportCsv = () => {
    const rows = [
      ["Host", "Timestamp", "Level", "Message"],
      ...filteredEntries.map(e => [e.host, e.timestamp, e.level, e.message]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `agent-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const levelIcon = (level: string) => {
    switch (level) {
      case "ERROR": return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
      case "WARN":  return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      default:      return <Info className="w-3.5 h-3.5 text-accent/60 flex-shrink-0" />;
    }
  };

  const levelClass = (level: string) => {
    switch (level) {
      case "ERROR": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      case "WARN":  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
      default:      return "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
    }
  };

  const hostColor = (host: string) => {
    const idx = hosts.indexOf(host);
    return HOST_COLORS[idx >= 0 ? idx % HOST_COLORS.length : 0];
  };

  const filteredEntries = hostFilter ? entries.filter(e => e.host === hostFilter) : entries;

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <FileText className="w-5 h-5 text-accent" />

        {/* Host filter — only show when multiple hosts */}
        {hosts.length > 1 && (
          <select value={hostFilter} onChange={e => setHostFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary font-mono">
            <option value="">All Servers ({hosts.length})</option>
            {hosts.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        )}
        {hosts.length === 1 && (
          <span className="flex items-center gap-1.5 text-xs text-text-muted font-mono bg-muted/50 px-2 py-1 rounded">
            <Server className="w-3 h-3" /> {hosts[0]}
          </span>
        )}

        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as LevelFilter)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary">
          <option value="">All Levels</option>
          <option value="ERROR">Errors Only</option>
          <option value="WARN">Warnings Only</option>
          <option value="INFO">Info Only</option>
        </select>

        <select value={maxLines} onChange={e => setMaxLines(Number(e.target.value))}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary">
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
        </select>

        <button onClick={loadLogs} className="p-2 rounded-lg border border-border hover:bg-muted text-text-muted">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
          Auto-refresh (15s)
        </label>
        <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary ml-auto">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Results count */}
      <div className="text-xs text-text-muted mb-2">{filteredEntries.length} log entries</div>

      {/* Log entries — theme-aware */}
      <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
        <div className="overflow-auto max-h-[calc(100vh-280px)] font-mono text-xs">
          {loading && entries.length === 0 ? (
            <div className="px-4 py-10 text-center text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="px-4 py-10 text-center text-text-muted">No log entries found</div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredEntries.map((e, i) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-1.5 hover:bg-muted/50 ${
                  e.level === "ERROR" ? "bg-red-50/50 dark:bg-red-950/20" : ""
                }`}>
                  {levelIcon(e.level)}
                  {hosts.length > 1 && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${hostColor(e.host)}`}>
                      {e.host}
                    </span>
                  )}
                  <span className="text-text-muted flex-shrink-0 w-[140px]">{e.timestamp}</span>
                  <span className={`flex-shrink-0 w-[52px] text-center text-[10px] font-bold px-1 py-0.5 rounded ${levelClass(e.level)}`}>
                    {e.level}
                  </span>
                  <span className={`break-all ${e.level === "ERROR" ? "text-red-600 dark:text-red-400" : "text-text-primary"}`}>
                    {e.message}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
