"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Headset, Settings, ChevronUp, ChevronDown, Filter, Clock, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import TicketCreateModal from "@/components/helpdesk/TicketCreateModal";
import TicketDetailPanel from "@/components/helpdesk/TicketDetailPanel";
import type { Ticket, HdGroup, HdCategory, HdFieldDef, HdForm, TicketStatus, TicketPriority } from "@/lib/helpdesk";

const STATUSES: TicketStatus[] = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];
const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

type SortKey = "id" | "subject" | "status" | "priority" | "category" | "assignedTo" | "updatedAt";
type SortDir = "asc" | "desc";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HelpdeskPage() {
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<HdGroup[]>([]);
  const [categories, setCategories] = useState<HdCategory[]>([]);
  const [fieldDefs, setFieldDefs] = useState<HdFieldDef[]>([]);
  const [forms, setForms] = useState<HdForm[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterGroup, setFilterGroup] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQ.trim()) params.set("q", searchQ.trim());
      if (filterStatus) params.set("status", filterStatus);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterGroup) params.set("assignedGroup", filterGroup);
      if (filterAssignee) params.set("assignedTo", filterAssignee);
      const res = await fetch(`/api/helpdesk?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch {}
  }, [searchQ, filterStatus, filterPriority, filterGroup, filterAssignee]);

  // Fetch config (groups, categories, etc.)
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/helpdesk/admin");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setCategories(data.categories || []);
        setFieldDefs(data.fieldDefs || []);
        setForms(data.forms || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchTickets(), fetchConfig()]).then(() => setLoading(false));
  }, [fetchTickets, fetchConfig]);

  // Sorted tickets
  const sorted = useMemo(() => {
    const arr = [...tickets];
    arr.sort((a, b) => {
      let va: string, vb: string;
      if (sortKey === "updatedAt") { va = a.updatedAt; vb = b.updatedAt; }
      else { va = String((a as unknown as Record<string, unknown>)[sortKey] || ""); vb = String((b as unknown as Record<string, unknown>)[sortKey] || ""); }
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [tickets, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  // Stats
  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === "Open").length;
    const inProgress = tickets.filter((t) => t.status === "In Progress").length;
    const waiting = tickets.filter((t) => t.status === "Waiting").length;
    const resolved = tickets.filter((t) => t.status === "Resolved" || t.status === "Closed").length;
    const breached = tickets.filter((t) => (t.slaResponseMet === false || t.slaResolutionMet === false)).length;
    return { open, inProgress, waiting, resolved, breached, total: tickets.length };
  }, [tickets]);

  // Unique assignees for filter
  const assignees = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => { if (t.assignedTo) set.add(t.assignedTo); });
    return Array.from(set).sort();
  }, [tickets]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || id;
  const groupName = (id?: string) => id ? groups.find((g) => g.id === id)?.name || id : "—";

  return (
    <div className="jp-root">
      {/* Header */}
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Headset className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Helpdesk</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="jp-action-btn" onClick={() => router.push("/helpdesk/admin")} data-tip="Admin Settings">
            <Settings className="w-4 h-4" />
          </button>
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="hd-stats-bar">
        <div className="hd-stat" onClick={() => { setFilterStatus(""); setFilterPriority(""); }}>
          <span className="hd-stat-count">{stats.total}</span>
          <span className="hd-stat-label">Total</span>
        </div>
        <div className="hd-stat hd-stat--open" onClick={() => setFilterStatus("Open")}>
          <Clock className="w-4 h-4" />
          <span className="hd-stat-count">{stats.open}</span>
          <span className="hd-stat-label">Open</span>
        </div>
        <div className="hd-stat hd-stat--progress" onClick={() => setFilterStatus("In Progress")}>
          <AlertTriangle className="w-4 h-4" />
          <span className="hd-stat-count">{stats.inProgress}</span>
          <span className="hd-stat-label">In Progress</span>
        </div>
        <div className="hd-stat hd-stat--waiting" onClick={() => setFilterStatus("Waiting")}>
          <Clock className="w-4 h-4" />
          <span className="hd-stat-count">{stats.waiting}</span>
          <span className="hd-stat-label">Waiting</span>
        </div>
        <div className="hd-stat hd-stat--resolved" onClick={() => setFilterStatus("Resolved")}>
          <CheckCircle className="w-4 h-4" />
          <span className="hd-stat-count">{stats.resolved}</span>
          <span className="hd-stat-label">Resolved</span>
        </div>
        {stats.breached > 0 && (
          <div className="hd-stat hd-stat--breached">
            <XCircle className="w-4 h-4" />
            <span className="hd-stat-count">{stats.breached}</span>
            <span className="hd-stat-label">SLA Breached</span>
          </div>
        )}
      </div>

      {/* Main */}
      <div className="jp-main">
        {/* Sidebar filters */}
        <aside className="jp-sidebar">
          <div className="jp-section">
            <h3 className="jp-section-title"><Filter className="w-3.5 h-3.5" /> Filters</h3>

            <label className="cl-label">Search</label>
            <input className="cl-input" placeholder="Search tickets…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />

            <label className="cl-label mt-2">Status</label>
            <select className="cl-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label className="cl-label mt-2">Priority</label>
            <select className="cl-input" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <label className="cl-label mt-2">Group</label>
            <select className="cl-input" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">All</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <label className="cl-label mt-2">Assignee</label>
            <select className="cl-input" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
              <option value="">All</option>
              {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            {(filterStatus || filterPriority || filterGroup || filterAssignee || searchQ) && (
              <button className="cl-btn cl-btn--secondary mt-3 w-full" onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterGroup(""); setFilterAssignee(""); setSearchQ(""); }}>
                Clear Filters
              </button>
            )}
          </div>
        </aside>

        {/* Ticket table */}
        <div className="jp-content">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="jp-empty">No tickets found</div>
          ) : (
            <table className="cl-table hd-ticket-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort("id")} className="cursor-pointer">ID <SortIcon col="id" /></th>
                  <th onClick={() => toggleSort("subject")} className="cursor-pointer">Subject <SortIcon col="subject" /></th>
                  <th onClick={() => toggleSort("status")} className="cursor-pointer">Status <SortIcon col="status" /></th>
                  <th onClick={() => toggleSort("priority")} className="cursor-pointer">Priority <SortIcon col="priority" /></th>
                  <th onClick={() => toggleSort("category")} className="cursor-pointer">Category <SortIcon col="category" /></th>
                  <th onClick={() => toggleSort("assignedTo")} className="cursor-pointer">Assignee <SortIcon col="assignedTo" /></th>
                  <th onClick={() => toggleSort("updatedAt")} className="cursor-pointer">Updated <SortIcon col="updatedAt" /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className="hd-ticket-row" onClick={() => setSelectedTicket(t.id)}>
                    <td className="hd-ticket-id">{t.id}</td>
                    <td>
                      <div className="hd-ticket-subject">{t.subject}</div>
                      <div className="hd-ticket-requester">by {t.requester}</div>
                    </td>
                    <td><span className={`cl-badge hd-status--${t.status.toLowerCase().replace(/\s+/g, "-")}`}>{t.status}</span></td>
                    <td><span className={`cl-badge hd-priority--${t.priority.toLowerCase()}`}>{t.priority}</span></td>
                    <td>{catName(t.category)}</td>
                    <td>{t.assignedTo || "—"}</td>
                    <td className="text-xs text-text-muted">{timeAgo(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <TicketCreateModal
          isOpen
          groups={groups}
          categories={categories}
          fieldDefs={fieldDefs}
          forms={forms}
          onClose={() => { setShowCreate(false); fetchTickets(); }}
          onSave={async (data) => {
            await fetch("/api/helpdesk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
          }}
        />
      )}

      {/* Detail panel */}
      {selectedTicket && (
        <TicketDetailPanel
          ticketId={selectedTicket}
          groups={groups}
          categories={categories}
          fieldDefs={fieldDefs}
          onClose={() => setSelectedTicket(null)}
          onUpdated={fetchTickets}
        />
      )}
    </div>
  );
}
