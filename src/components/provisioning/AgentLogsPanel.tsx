"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Download, FileText, Info, Loader2, RefreshCw, XCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

type LevelFilter = "" | "ERROR" | "WARN" | "INFO";

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentLogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [host, setHost] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [maxLines, setMaxLines] = useState(200);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ lines: String(maxLines) });
      if (levelFilter) params.set("level", levelFilter);
      const res = await fetch(`/api/provisioning/agent/api/logs?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Agent returned ${res.status}`);
      }
      const d = await res.json();
      setEntries(d.entries ?? []);
      setHost(d.host ?? "");
      // Scroll to bottom after load
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
      ["Timestamp", "Level", "Message"],
      ...entries.map(e => [e.timestamp, e.level, e.message]),
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
      default:      return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
    }
  };

  const levelClass = (level: string) => {
    switch (level) {
      case "ERROR": return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400";
      case "WARN":  return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
      default:      return "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400";
    }
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <FileText className="w-5 h-5 text-accent" />
        {host && <span className="text-xs text-text-muted font-mono bg-muted/50 px-2 py-1 rounded">{host}</span>}

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
      <div className="text-xs text-text-muted mb-2">{entries.length} log entries</div>

      {/* Log entries */}
      <div className="border border-border rounded-xl overflow-hidden bg-[#1e1e2e] dark:bg-[#0d0d14]">
        <div className="overflow-auto max-h-[calc(100vh-280px)] font-mono text-xs">
          {loading && entries.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400">No log entries found</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {entries.map((e, i) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-1.5 hover:bg-white/5 ${
                  e.level === "ERROR" ? "bg-red-950/30" : ""
                }`}>
                  {levelIcon(e.level)}
                  <span className="text-gray-500 flex-shrink-0 w-[140px]">{e.timestamp}</span>
                  <span className={`flex-shrink-0 w-[52px] text-center text-[10px] font-bold px-1 py-0.5 rounded ${levelClass(e.level)}`}>
                    {e.level}
                  </span>
                  <span className={`break-all ${e.level === "ERROR" ? "text-red-300" : "text-gray-300"}`}>
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
