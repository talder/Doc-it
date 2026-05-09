"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ClipboardList, ChevronUp, ChevronDown, Download, BarChart2, List } from "lucide-react";
import JournalCalendar from "@/components/JournalCalendar";
import ChangeLogModal from "@/components/ChangeLogModal";
import ChangeLogDetailModal from "@/components/ChangeLogDetailModal";
import type { ChangeLogEntry, ChangeCategory, ChangeRisk, ChangeStatus } from "@/lib/changelog";

type SortKey = "date" | "id" | "system" | "category" | "risk" | "status";
type SortDir = "asc" | "desc";
type TabKey = "list" | "stats";

const RISK_ORDER: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
const RISKS: ChangeRisk[] = ["Low", "Medium", "High", "Critical"];
const STATUSES: ChangeStatus[] = ["Planned", "In Progress", "Completed", "Failed", "Rolled Back"];

const RISK_BADGE: Record<string, string> = { Low: "cl-risk--low", Medium: "cl-risk--medium", High: "cl-risk--high", Critical: "cl-risk--critical" };
const STATUS_BADGE: Record<string, string> = { Completed: "cl-status--completed", Failed: "cl-status--failed", "Rolled Back": "cl-status--rolledback", Planned: "cl-status--planned", "In Progress": "cl-status--inprogress" };

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ entries }: { entries: ChangeLogEntry[] }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCount = entries.filter(e => e.date.startsWith(thisMonth)).length;
  const failedCount = entries.filter(e => e.status === "Failed" || e.status === "Rolled Back").length;
  const highRiskCount = entries.filter(e => e.risk === "High" || e.risk === "Critical").length;

  const byCategory: Record<string, number> = {};
  const bySys: Record<string, number> = {};
  const byRisk: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  const byStatus: Record<string, number> = {};
  for (const e of entries) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    bySys[e.system] = (bySys[e.system] || 0) + 1;
    byRisk[e.risk] = (byRisk[e.risk] || 0) + 1;
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  }
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...sortedCats.map(([, v]) => v), 1);
  const topSys = Object.entries(bySys).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxSys = Math.max(...topSys.map(([, v]) => v), 1);

  // Changes per week — last 8 weeks
  const weekBuckets: { label: string; count: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(); start.setDate(start.getDate() - start.getDay() - w * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const s = start.toISOString().slice(0, 10), e2 = end.toISOString().slice(0, 10);
    weekBuckets.push({ label: start.toLocaleDateString("en", { month: "short", day: "numeric" }), count: entries.filter(e => e.date >= s && e.date <= e2).length });
  }
  const maxWeek = Math.max(...weekBuckets.map(b => b.count), 1);

  const kpi = [
    { label: "Total (visible)", value: entries.length, color: "text-accent" },
    { label: "This month", value: thisMonthCount, color: "text-blue-600" },
    { label: "Failed / Rolled back", value: failedCount, color: "text-red-600" },
    { label: "High / Critical risk", value: highRiskCount, color: "text-amber-600" },
  ];

  return (
    <div className="p-6 space-y-8 overflow-auto">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpi.map(c => (
          <div key={c.label} className="bg-surface-alt border border-border rounded-xl p-4">
            <p className="text-xs text-text-muted mb-1">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Weekly trend */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Changes per Week (last 8 weeks)</h3>
        <div className="flex items-end gap-2" style={{ height: 100 }}>
          {weekBuckets.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-text-muted">{b.count > 0 ? b.count : ""}</span>
              <div className="w-full bg-accent rounded-t transition-all" style={{ height: Math.max(4, (b.count / maxWeek) * 72) }} />
              <span className="text-[9px] text-text-muted text-center leading-tight">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk distribution */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">By Risk</h3>
        <div className="grid grid-cols-4 gap-3">
          {[{ l: "Low", c: "bg-green-50 text-green-800 border-green-200" }, { l: "Medium", c: "bg-amber-50 text-amber-800 border-amber-200" }, { l: "High", c: "bg-orange-50 text-orange-800 border-orange-200" }, { l: "Critical", c: "bg-red-50 text-red-800 border-red-200" }].map(({ l, c }) => (
            <div key={l} className={`border rounded-xl p-3 text-center ${c}`}>
              <p className="text-2xl font-bold">{byRisk[l] || 0}</p>
              <p className="text-xs font-medium mt-1">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* By category */}
      {sortedCats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">By Category</h3>
          <div className="space-y-2">
            {sortedCats.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-28 flex-shrink-0 truncate">{cat}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${(count / maxCat) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-text-primary w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By status */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">By Status</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
            <div key={s} className="bg-surface-alt border border-border rounded-lg px-4 py-2 text-center min-w-[100px]">
              <p className="text-xl font-bold text-text-primary">{count}</p>
              <p className="text-xs text-text-muted mt-0.5">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top systems */}
      {topSys.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Most Changed Systems (top 10)</h3>
          <div className="space-y-2">
            {topSys.map(([sys, count]) => (
              <div key={sys} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-40 flex-shrink-0 truncate">{sys}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(count / maxSys) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-text-primary w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChangeLogPage() {
  const router = useRouter();

  const [allEntries, setAllEntries] = useState<ChangeLogEntry[]>([]);
  const [knownSystems, setKnownSystems] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>(["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // Sort + Tab
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<TabKey>("list");

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ChangeLogEntry | null>(null);
  const [rollbackPrefill, setRollbackPrefill] = useState<Partial<ChangeLogEntry> | undefined>(undefined);

  useEffect(() => {
    fetch("/api/settings/changelog")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.categories?.length) setCategories(d.categories); }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changelog");
      if (res.ok) {
        const data = await res.json();
        setAllEntries(data.entries || []);
        setKnownSystems(data.systems || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side filter
  const filtered = useMemo(() => {
    let list = [...allEntries];
    const from = selectedDate || dateFrom;
    const to = selectedDate || dateTo;
    if (from) list = list.filter(e => e.date >= from);
    if (to) list = list.filter(e => e.date <= to);
    if (categoryFilter) list = list.filter(e => e.category === categoryFilter);
    if (riskFilter) list = list.filter(e => e.risk === riskFilter);
    if (statusFilter) list = list.filter(e => e.status === statusFilter);
    if (systemFilter) list = list.filter(e => e.system.toLowerCase() === systemFilter.toLowerCase());
    if (searchQ.trim().length >= 2) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(e => e.id.toLowerCase().includes(q) || e.system.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.impact.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.author.toLowerCase().includes(q) || (e.approvedBy || "").toLowerCase().includes(q));
    }
    return list;
  }, [allEntries, selectedDate, dateFrom, dateTo, categoryFilter, riskFilter, statusFilter, systemFilter, searchQ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "id": cmp = a.id.localeCompare(b.id); break;
        case "system": cmp = a.system.localeCompare(b.system); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "risk": cmp = (RISK_ORDER[a.risk] ?? 0) - (RISK_ORDER[b.risk] ?? 0); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const entryDates = useMemo(() => new Set(allEntries.map(e => e.date)), [allEntries]);

  // Top systems for sidebar filter
  const topSystems = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of allEntries) c[e.system] = (c[e.system] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [allEntries]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  };

  const handleSave = async (data: Parameters<typeof fetch>[1] extends { body?: string | null } ? Record<string, unknown> : never) => {
    await fetch("/api/changelog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setRollbackPrefill(undefined);
    await fetchData();
  };

  const handleSaveTyped = async (data: { date: string; time?: string; system: string; category: ChangeCategory; description: string; impact: string; risk: ChangeRisk; status: ChangeStatus; approvedBy?: string; plannedStart?: string; plannedEnd?: string; rollbackOf?: string; }) => {
    await fetch("/api/changelog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setRollbackPrefill(undefined);
    await fetchData();
  };

  const exportCSV = () => {
    const header = ["ID", "Date", "Time", "Author", "Approved By", "System", "Category", "Risk", "Status", "Description", "Impact", "Rollback Of", "Related RFC", "Logged At"];
    const rows = sorted.map(e => [e.id, e.date, e.time || "", e.author, e.approvedBy || "", e.system, e.category, e.risk, e.status, e.description, e.impact, e.rollbackOf || "", e.relatedCrId || "", e.createdAt]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `changelog-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => { setSelectedDate(null); setDateFrom(""); setDateTo(""); setCategoryFilter(""); setRiskFilter(""); setStatusFilter(""); setSystemFilter(""); setSearchQ(""); };
  const hasFilter = !!(selectedDate || dateFrom || dateTo || categoryFilter || riskFilter || statusFilter || systemFilter || searchQ);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  // KPI summary (list tab header)
  const thisMonth = new Date().toISOString().slice(0, 7);
  const kpiMonth = filtered.filter(e => e.date.startsWith(thisMonth)).length;
  const kpiFailed = filtered.filter(e => e.status === "Failed" || e.status === "Rolled Back").length;
  const kpiHighRisk = filtered.filter(e => e.risk === "High" || e.risk === "Critical").length;

  return (
    <div className="jp-root">
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <ClipboardList className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Change Log</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button onClick={() => setTab("list")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${tab === "list" ? "bg-accent text-white" : "text-text-secondary hover:bg-muted"}`}>
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button onClick={() => setTab("stats")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${tab === "stats" ? "bg-accent text-white" : "text-text-secondary hover:bg-muted"}`}>
              <BarChart2 className="w-3.5 h-3.5" /> Statistics
            </button>
          </div>
          {sorted.length > 0 && (
            <button className="jp-action-btn" onClick={exportCSV} title="Export filtered entries as CSV">
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
          {hasFilter && (
            <button className="jp-action-btn" onClick={clearFilters}>Clear filters</button>
          )}
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => { setRollbackPrefill(undefined); setShowNewModal(true); }}>
            <Plus className="w-4 h-4" /> Log Change
          </button>
        </div>
      </header>

      <div className="jp-main">
        {/* Sidebar */}
        <aside className="jp-sidebar overflow-y-auto">
          {/* Calendar */}
          <JournalCalendar entryDates={entryDates} selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d === selectedDate ? null : d); setDateFrom(""); setDateTo(""); }} />

          {/* Date range */}
          <div className="jp-section">
            <h3 className="jp-section-title">Date Range</h3>
            <div className="space-y-1.5">
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wide">From</label>
                <input type="date" className="cl-input mt-0.5" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSelectedDate(null); }} />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wide">To</label>
                <input type="date" className="cl-input mt-0.5" value={dateTo} onChange={e => { setDateTo(e.target.value); setSelectedDate(null); }} />
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="jp-section">
            <h3 className="jp-section-title">Category</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!categoryFilter ? " cl-cat-btn--active" : ""}`} onClick={() => setCategoryFilter("")}>All</button>
              {categories.map(c => (
                <button key={c} className={`cl-cat-btn${categoryFilter === c ? " cl-cat-btn--active" : ""}`} onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)}>{c}</button>
              ))}
            </div>
          </div>

          {/* Risk */}
          <div className="jp-section">
            <h3 className="jp-section-title">Risk</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!riskFilter ? " cl-cat-btn--active" : ""}`} onClick={() => setRiskFilter("")}>All</button>
              {RISKS.map(r => (
                <button key={r} className={`cl-cat-btn${riskFilter === r ? " cl-cat-btn--active" : ""}`} onClick={() => setRiskFilter(riskFilter === r ? "" : r)}>{r}</button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="jp-section">
            <h3 className="jp-section-title">Status</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!statusFilter ? " cl-cat-btn--active" : ""}`} onClick={() => setStatusFilter("")}>All</button>
              {STATUSES.map(s => (
                <button key={s} className={`cl-cat-btn${statusFilter === s ? " cl-cat-btn--active" : ""}`} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* Systems */}
          {topSystems.length > 0 && (
            <div className="jp-section">
              <h3 className="jp-section-title">By System</h3>
              <div className="space-y-1">
                {topSystems.map(([sys, count]) => (
                  <div key={sys} className="flex items-center justify-between text-xs">
                    <button className={`truncate pr-2 text-left hover:text-accent transition-colors ${systemFilter === sys ? "text-accent font-medium" : "text-text-secondary"}`}
                      title={sys} onClick={() => setSystemFilter(systemFilter === sys ? "" : sys)}>
                      {systemFilter === sys && "▶ "}{sys}
                    </button>
                    <span className="text-text-muted flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="jp-section">
            <h3 className="jp-section-title">Search</h3>
            <input type="text" className="cl-input" placeholder="Search changes…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
        </aside>

        {/* Main content */}
        <main className="jp-content overflow-auto">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : tab === "stats" ? (
            <StatsPanel entries={filtered} />
          ) : (
            <>
              {/* KPI cards */}
              {filtered.length > 0 && (
                <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
                  {[
                    { label: "Visible", value: filtered.length, color: "text-accent" },
                    { label: "This month", value: kpiMonth, color: "text-blue-600" },
                    { label: "Failed/Rolled back", value: kpiFailed, color: "text-red-600" },
                    { label: "High/Critical", value: kpiHighRisk, color: "text-amber-600" },
                  ].map(c => (
                    <div key={c.label} className="bg-surface-alt border border-border rounded-lg px-3 py-2">
                      <p className="text-[10px] text-text-muted">{c.label}</p>
                      <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {sorted.length === 0 ? (
                <div className="jp-empty">
                  <ClipboardList className="w-10 h-10 text-text-muted mb-3 opacity-40" />
                  <p className="text-text-muted">No change entries{hasFilter ? " matching filters" : " yet"}</p>
                  {!hasFilter && (
                    <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowNewModal(true)}>
                      <Plus className="w-4 h-4" /> Log Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="cl-table-wrap">
                  <table className="cl-table">
                    <thead>
                      <tr>
                        <th onClick={() => toggleSort("id")} className="cl-th cl-th--sort">ID <SortIcon col="id" /></th>
                        <th onClick={() => toggleSort("date")} className="cl-th cl-th--sort">Date <SortIcon col="date" /></th>
                        <th onClick={() => toggleSort("system")} className="cl-th cl-th--sort">System <SortIcon col="system" /></th>
                        <th onClick={() => toggleSort("category")} className="cl-th cl-th--sort">Category <SortIcon col="category" /></th>
                        <th className="cl-th">Description</th>
                        <th onClick={() => toggleSort("risk")} className="cl-th cl-th--sort">Risk <SortIcon col="risk" /></th>
                        <th onClick={() => toggleSort("status")} className="cl-th cl-th--sort">Status <SortIcon col="status" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(e => (
                        <tr key={e.id} className="cl-tr" onClick={() => setDetailEntry(e)}>
                          <td className="cl-td cl-td--id">
                            {e.rollbackOf ? <span title={`Rollback of ${e.rollbackOf}`}>↩ </span> : null}{e.id}
                          </td>
                          <td className="cl-td cl-td--date">{e.date}{e.time ? ` ${e.time}` : ""}</td>
                          <td className="cl-td cl-td--system">{e.system}</td>
                          <td className="cl-td">{e.category}</td>
                          <td className="cl-td cl-td--desc">{e.description.length > 80 ? e.description.slice(0, 80) + "…" : e.description}</td>
                          <td className="cl-td"><span className={`cl-badge ${RISK_BADGE[e.risk] || ""}`}>{e.risk}</span></td>
                          <td className="cl-td"><span className={`cl-badge ${STATUS_BADGE[e.status] || ""}`}>{e.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cl-table-count">{sorted.length} {sorted.length === 1 ? "entry" : "entries"}{hasFilter ? ` (filtered from ${allEntries.length})` : ""}</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <ChangeLogModal
        isOpen={showNewModal}
        onClose={() => { setShowNewModal(false); setRollbackPrefill(undefined); }}
        onSave={handleSaveTyped}
        knownSystems={knownSystems}
        categories={categories}
        prefill={rollbackPrefill}
      />
      <ChangeLogDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onLogRollback={(e) => { setRollbackPrefill(e); setShowNewModal(true); }}
      />
    </div>
  );
}
