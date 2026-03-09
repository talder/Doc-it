"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ClipboardList, ChevronUp, ChevronDown } from "lucide-react";
import JournalCalendar from "@/components/JournalCalendar";
import ChangeLogModal from "@/components/ChangeLogModal";
import ChangeLogDetailModal from "@/components/ChangeLogDetailModal";
import type { ChangeLogEntry, ChangeCategory } from "@/lib/changelog";

const CATEGORIES: ChangeCategory[] = ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"];

type SortKey = "date" | "id" | "system" | "category" | "risk" | "status";
type SortDir = "asc" | "desc";

const RISK_ORDER: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

export default function ChangeLogPage() {
  const router = useRouter();

  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [knownSystems, setKnownSystems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ChangeLogEntry | null>(null);

  // Fetch entries
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQ.trim().length >= 2) params.set("q", searchQ.trim());
      if (categoryFilter) params.set("category", categoryFilter);
      if (selectedDate) {
        params.set("from", selectedDate);
        params.set("to", selectedDate);
      }
      const res = await fetch(`/api/changelog?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setKnownSystems(data.systems || []);
      }
    } catch {}
    setLoading(false);
  }, [searchQ, categoryFilter, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calendar dot dates
  const entryDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  // Sort helper
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...entries];
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
  }, [entries, sortKey, sortDir]);

  // Save handler
  const handleSave = async (data: {
    date: string;
    system: string;
    category: ChangeCategory;
    description: string;
    impact: string;
    risk: string;
    status: string;
  }) => {
    await fetch("/api/changelog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchData();
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  return (
    <div className="jp-root">
      {/* Header */}
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ClipboardList className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Change Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4" /> Log Change
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="jp-main">
        {/* Sidebar: Calendar + Category filter */}
        <aside className="jp-sidebar">
          <JournalCalendar
            entryDates={entryDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
          />

          <div className="jp-section">
            <h3 className="jp-section-title">Filter by category</h3>
            <div className="cl-cat-filters">
              <button
                className={`cl-cat-btn${!categoryFilter ? " cl-cat-btn--active" : ""}`}
                onClick={() => setCategoryFilter("")}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`cl-cat-btn${categoryFilter === c ? " cl-cat-btn--active" : ""}`}
                  onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="jp-section">
            <h3 className="jp-section-title">Quick search</h3>
            <input
              type="text"
              className="cl-input"
              placeholder="Search changes…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
        </aside>

        {/* Table */}
        <main className="jp-content">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="jp-empty">
              <ClipboardList className="w-10 h-10 text-text-muted mb-3 opacity-40" />
              <p className="text-text-muted">No change entries{categoryFilter || selectedDate || searchQ ? " matching filters" : " yet"}</p>
              <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowNewModal(true)}>
                <Plus className="w-4 h-4" /> Log Change
              </button>
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
                  {sorted.map((e) => (
                    <tr key={e.id} className="cl-tr" onClick={() => setDetailEntry(e)}>
                      <td className="cl-td cl-td--id">{e.id}</td>
                      <td className="cl-td cl-td--date">{e.date}</td>
                      <td className="cl-td cl-td--system">{e.system}</td>
                      <td className="cl-td">{e.category}</td>
                      <td className="cl-td cl-td--desc">{e.description.length > 80 ? e.description.slice(0, 80) + "…" : e.description}</td>
                      <td className="cl-td"><span className={`cl-badge cl-risk--${e.risk.toLowerCase()}`}>{e.risk}</span></td>
                      <td className="cl-td"><span className={`cl-badge cl-status--${e.status.toLowerCase().replace(/\s+/g, "")}`}>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cl-table-count">{sorted.length} {sorted.length === 1 ? "entry" : "entries"}</div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <ChangeLogModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSave={handleSave}
        knownSystems={knownSystems}
      />
      <ChangeLogDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />
    </div>
  );
}
