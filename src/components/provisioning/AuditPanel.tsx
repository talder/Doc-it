"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download, Loader2, RefreshCw, Shield,
} from "lucide-react";
import type { InfraAuditEntry, InfraAuditTab } from "@/lib/provisioning-shared";

// ── Component ────────────────────────────────────────────────────────────────

export default function AuditPanel() {
  const [entries, setEntries] = useState<InfraAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filters
  const [tabFilter, setTabFilter] = useState<InfraAuditTab | "">("");
  const [userFilter, setUserFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tabFilter) params.set("tab", tabFilter);
      if (userFilter) params.set("user", userFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/provisioning/audit?${params}`);
      if (res.ok) {
        const d = await res.json();
        setEntries(d.entries ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [tabFilter, userFilter, fromDate, toDate]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(loadEntries, 30_000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, loadEntries]);

  // CSV export
  const exportCsv = () => {
    const rows = [
      ["Timestamp", "User", "Tab", "Action", "Target", "Status", "Details"],
      ...entries.map(e => [e.timestamp, e.user, e.tab, e.action, e.target, e.status, JSON.stringify(e.details)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `infra-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const fmtTime = (s: string) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

  const TAB_LABELS: Record<string, string> = { provision: "Provision", dns: "DNS", dhcp: "DHCP", ad: "AD" };

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Shield className="w-5 h-5 text-accent" />
        <select value={tabFilter} onChange={e => setTabFilter(e.target.value as InfraAuditTab | "")}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary">
          <option value="">All Tabs</option>
          <option value="provision">Provision</option>
          <option value="dns">DNS</option>
          <option value="dhcp">DHCP</option>
          <option value="ad">Active Directory</option>
        </select>
        <input value={userFilter} onChange={e => setUserFilter(e.target.value)} placeholder="User filter…"
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary w-40" />
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
        <span className="text-xs text-text-muted">to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
        <button onClick={loadEntries} className="p-2 rounded-lg border border-border hover:bg-muted text-text-muted">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
          Auto-refresh (30s)
        </label>
        <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary ml-auto">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Results count */}
      <div className="text-xs text-text-muted mb-2">{entries.length} entries</div>

      {/* Audit table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Timestamp</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">User</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Tab</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Action</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Target</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No audit entries</td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 text-xs text-text-muted whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                <td className="px-4 py-2 text-text-primary font-mono">{e.user}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    e.tab === "dns" ? "bg-blue-50 text-blue-700" :
                    e.tab === "dhcp" ? "bg-purple-50 text-purple-700" :
                    e.tab === "ad" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-50 text-gray-600"
                  }`}>{TAB_LABELS[e.tab] ?? e.tab}</span>
                </td>
                <td className="px-4 py-2 text-text-secondary">{e.action}</td>
                <td className="px-4 py-2 font-mono text-text-primary text-xs truncate max-w-[300px]">{e.target}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    e.status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}>{e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
