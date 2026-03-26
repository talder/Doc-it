"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Phone, Plus, ChevronUp, ChevronDown, Search } from "lucide-react";
import JournalCalendar from "@/components/JournalCalendar";
import OnCallHeatmap from "@/components/OnCallHeatmap";
import OnCallModal from "@/components/OnCallModal";
import OnCallDetailModal from "@/components/OnCallDetailModal";
import type { OnCallEntry } from "@/lib/oncall-shared";
import { getHeatmapCounts, formatWorkingTime } from "@/lib/oncall-shared";

type SortKey = "id" | "date" | "time" | "registrar" | "workingMinutes";
type SortDir = "asc" | "desc";

function stripHtml(html: string) { return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

export default function OnCallPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState("");
  const [entries, setEntries] = useState<OnCallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [showNewModal, setShowNewModal] = useState(false);
  const [detailEntry, setDetailEntry] = useState<OnCallEntry | null>(null);

  // Fetch current user
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user?.username) setCurrentUser(d.user.username); })
      .catch(() => {});
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQ.trim().length >= 2) params.set("q", searchQ.trim());
      if (selectedDate) { params.set("from", selectedDate); params.set("to", selectedDate); }
      const res = await fetch(`/api/oncall?${params}`);
      if (res.status === 403) { setAccessDenied(true); return; }
      if (res.ok) setEntries((await res.json()).entries ?? []);
    } catch {}
    setLoading(false);
  }, [searchQ, selectedDate]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const entryDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
const heatmapCounts = useMemo(() => getHeatmapCounts(entries, 90), [entries]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id": cmp = a.id.localeCompare(b.id); break;
        case "date": cmp = a.date.localeCompare(b.date) || a.time.localeCompare(b.time); break;
        case "time": cmp = a.time.localeCompare(b.time); break;
        case "registrar": cmp = a.registrar.localeCompare(b.registrar); break;
        case "workingMinutes": cmp = a.workingMinutes - b.workingMinutes; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [entries, sortKey, sortDir]);

  const totalMinutes = useMemo(() => entries.reduce((s, e) => s + e.workingMinutes, 0), [entries]);

  const handleSave = async (data: { date: string; time: string; description: string; workingTime: string; assistedBy: string[]; solution: string }) => {
    await fetch("/api/oncall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchEntries();
  };

  const handleSolutionSaved = (updated: OnCallEntry) => {
    setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    setDetailEntry(updated);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  if (accessDenied) {
    return (
      <div className="jp-root">
        <header className="jp-header">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Phone className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary ml-2">On-Call Reports</h1>
        </header>
        <div className="jp-empty">
          <Phone className="w-10 h-10 text-text-muted opacity-40 mb-3" />
          <p className="text-text-muted">You do not have access to the On-Call module.</p>
          <p className="text-xs text-text-muted mt-1">Contact an administrator to be added to the allowed users list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="jp-root">
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Phone className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">On-Call Reports</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              className="oc-search"
              placeholder="Search…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4" /> Log Call
          </button>
        </div>
      </header>

      <div className="jp-main">
        {/* Sidebar */}
        <aside className="jp-sidebar">
          <JournalCalendar
            entryDates={entryDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
          />

          <div className="jp-section">
            <OnCallHeatmap counts={heatmapCounts} />
          </div>

          {entries.length > 0 && (
            <div className="jp-section">
              <h3 className="jp-section-title">Summary</h3>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Total calls</span>
                  <span className="font-medium text-text-primary">{entries.length}</span>
                </div>
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Total time</span>
                  <span className="font-medium text-text-primary">{formatWorkingTime(totalMinutes)}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="jp-content">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="jp-empty">
              <Phone className="w-10 h-10 text-text-muted mb-3 opacity-40" />
              <p className="text-text-muted">No on-call entries{selectedDate || searchQ ? " matching filters" : " yet"}</p>
              <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowNewModal(true)}>
                <Plus className="w-4 h-4" /> Log Call
              </button>
            </div>
          ) : (
            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("id")} className="cl-th cl-th--sort">ID <SortIcon col="id" /></th>
                    <th onClick={() => toggleSort("date")} className="cl-th cl-th--sort">Date <SortIcon col="date" /></th>
                    <th onClick={() => toggleSort("time")} className="cl-th cl-th--sort">Time <SortIcon col="time" /></th>
                    <th onClick={() => toggleSort("registrar")} className="cl-th cl-th--sort">Registrar <SortIcon col="registrar" /></th>
                    <th onClick={() => toggleSort("workingMinutes")} className="cl-th cl-th--sort">Working time <SortIcon col="workingMinutes" /></th>
                    <th className="cl-th">Assisted by</th>
                    <th className="cl-th">Problem (summary)</th>
                    <th className="cl-th">Solution</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => {
                    const hasSolution = stripHtml(e.solution ?? "").length > 0;
                    return (
                      <tr key={e.id} className="cl-tr" onClick={() => setDetailEntry(e)}>
                        <td className="cl-td cl-td--id">{e.id}</td>
                        <td className="cl-td cl-td--date">{e.date}</td>
                        <td className="cl-td">{e.time}</td>
                        <td className="cl-td">{e.registrar}</td>
                        <td className="cl-td">
                          <span className="oc-badge-time">{formatWorkingTime(e.workingMinutes)}</span>
                        </td>
                        <td className="cl-td">{(e.assistedBy ?? []).join(", ") || "—"}</td>
                        <td className="cl-td cl-td--desc">{stripHtml(e.description).slice(0, 80)}{stripHtml(e.description).length > 80 ? "…" : ""}</td>
                        <td className="cl-td">
                          {hasSolution ? (
                            <span className="oc-badge-solution">Resolved</span>
                          ) : (
                            <span className="oc-badge-pending">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="cl-table-count">{sorted.length} {sorted.length === 1 ? "entry" : "entries"} · {formatWorkingTime(totalMinutes)} total</div>
            </div>
          )}
        </main>
      </div>

      <OnCallModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSave={handleSave}
        currentUser={currentUser}
      />
      <OnCallDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onSolutionSaved={handleSolutionSaved}
      />
    </div>
  );
}
