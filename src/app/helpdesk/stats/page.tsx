"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Download } from "lucide-react";

interface Stats {
  total: number;
  totalOpen: number;
  totalResolved: number;
  totalClosed: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  byGroup: Record<string, number>;
  byAgent: Record<string, { assigned: number; resolved: number; totalWorkMinutes: number }>;
  sla: { responseMet: number; responseBreached: number; resolutionMet: number; resolutionBreached: number };
  avgResolutionHours: number;
  timeTracking: { totalWorkMinutes: number; totalBillableMinutes: number; totalWorkHours: number; totalBillableHours: number };
  period: { from: string; to: string };
}

export default function HelpdeskStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/helpdesk/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const exportCsv = () => {
    const params = new URLSearchParams({ format: "csv" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(`/api/helpdesk/stats?${params}`, "_blank");
  };

  return (
    <div className="jp-root">
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/helpdesk")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <BarChart3 className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Helpdesk Statistics</h1>
        </div>
        <button className="cl-btn cl-btn--secondary text-xs" onClick={exportCsv}><Download className="w-3 h-3" /> Export CSV</button>
      </header>

      {/* Date range filter */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <label className="text-xs text-text-secondary">From</label>
        <input type="date" className="cl-input text-xs" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs text-text-secondary">To</label>
        <input type="date" className="cl-input text-xs" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="cl-btn cl-btn--primary text-xs" onClick={fetchStats}>Apply</button>
        {(from || to) && <button className="cl-btn cl-btn--secondary text-xs" onClick={() => { setFrom(""); setTo(""); setTimeout(fetchStats, 0); }}>Clear</button>}
      </div>

      {loading || !stats ? (
        <div className="jp-empty">Loading…</div>
      ) : (
        <div className="p-6 space-y-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Tickets" value={stats.total} />
            <StatCard label="Open" value={stats.totalOpen} color="text-yellow-500" />
            <StatCard label="Resolved" value={stats.totalResolved} color="text-green-500" />
            <StatCard label="Closed" value={stats.totalClosed} color="text-text-muted" />
          </div>

          {/* SLA + resolution */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Avg Resolution" value={`${stats.avgResolutionHours}h`} />
            <StatCard label="SLA Response Met" value={stats.sla.responseMet} color="text-green-500" />
            <StatCard label="SLA Response Breached" value={stats.sla.responseBreached} color="text-red-500" />
            <StatCard label="SLA Resolution Breached" value={stats.sla.resolutionBreached} color="text-red-500" />
          </div>

          {/* Time tracking */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Work Hours" value={stats.timeTracking.totalWorkHours} />
            <StatCard label="Billable Hours" value={stats.timeTracking.totalBillableHours} />
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <BreakdownTable title="By Status" data={stats.byStatus} />
            <BreakdownTable title="By Priority" data={stats.byPriority} />
            <BreakdownTable title="By Type" data={stats.byType} />
            <BreakdownTable title="By Group" data={stats.byGroup} />
          </div>

          {/* Agent table */}
          {Object.keys(stats.byAgent).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-primary mb-2">Agent Performance</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-4 text-xs font-medium text-text-secondary bg-bg-secondary px-3 py-1.5">
                  <span>Agent</span><span className="text-right">Assigned</span><span className="text-right">Resolved</span><span className="text-right">Work Hours</span>
                </div>
                {Object.entries(stats.byAgent).map(([agent, a]) => (
                  <div key={agent} className="grid grid-cols-4 text-sm px-3 py-1.5 border-t border-border">
                    <span className="font-medium text-text-primary">{agent}</span>
                    <span className="text-right text-text-secondary">{a.assigned}</span>
                    <span className="text-right text-text-secondary">{a.resolved}</span>
                    <span className="text-right text-text-secondary">{Math.round(a.totalWorkMinutes / 6) / 10}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color || "text-text-primary"}`}>{value}</div>
    </div>
  );
}

function BreakdownTable({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-2">{title}</h3>
      <div className="border border-border rounded-lg overflow-hidden">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center justify-between px-3 py-1.5 text-sm border-t border-border first:border-t-0">
            <span className="text-text-primary">{key}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-bg-tertiary rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${Math.round((count / total) * 100)}%` }} /></div>
              <span className="text-text-secondary text-xs w-8 text-right">{count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
