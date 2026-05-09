"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ClipboardList, ChevronUp, ChevronDown, Download, BarChart2, List, Calendar, Settings, X, Zap } from "lucide-react";
import JournalCalendar from "@/components/JournalCalendar";
import ChangeLogModal from "@/components/ChangeLogModal";
import ChangeLogDetailModal from "@/components/ChangeLogDetailModal";
import type { ChangeLogEntry, ChangeCategory, ChangeRisk, ChangeLifecycleStatus, FreezePeriod, ChangeTemplate } from "@/lib/changelog-shared";

type SortKey = "date" | "id" | "system" | "category" | "risk" | "status" | "changeType";
type SortDir = "asc" | "desc";
type TabKey = "list" | "calendar" | "stats";

const RISK_ORDER: Record<string, number> = { Low:0, Medium:1, High:2, Critical:3 };
const RISKS: ChangeRisk[] = ["Low","Medium","High","Critical"];
const STATUSES: ChangeLifecycleStatus[] = ["Draft","Submitted","Under Review","CAB Approval","Approved","Implementing","Closed","Rejected","Failed","Rolled Back"];
const CHANGE_TYPES = ["Standard","Normal","Emergency"] as const;

const RISK_BADGE: Record<string,string> = { Low:"cl-risk--low", Medium:"cl-risk--medium", High:"cl-risk--high", Critical:"cl-risk--critical" };
const STATUS_BADGE: Record<string,string> = {
  Draft:"bg-gray-100 text-gray-700", Submitted:"bg-blue-100 text-blue-800",
  "Under Review":"bg-cyan-100 text-cyan-800", "CAB Approval":"bg-purple-100 text-purple-800",
  Approved:"bg-green-100 text-green-800", Implementing:"bg-amber-100 text-amber-800",
  Closed:"bg-gray-100 text-gray-600", Rejected:"bg-red-100 text-red-800",
  Failed:"bg-red-100 text-red-800", "Rolled Back":"bg-orange-100 text-orange-800",
  Completed:"bg-gray-100 text-gray-600", Planned:"bg-blue-100 text-blue-800", "In Progress":"bg-amber-100 text-amber-800",
};
const TYPE_BADGE: Record<string,string> = { Standard:"bg-green-100 text-green-800", Normal:"bg-blue-100 text-blue-800", Emergency:"bg-red-100 text-red-800" };

// ── FSC Calendar ──────────────────────────────────────────────────────

function FSCCalendar({ entries, freezePeriods, onSelect }: {
  entries: ChangeLogEntry[];
  freezePeriods: FreezePeriod[];
  onSelect: (e: ChangeLogEntry) => void;
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const entryByDate = useMemo(() => {
    const map: Record<string, ChangeLogEntry[]> = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    // Also map planned dates
    for (const e of entries) {
      if (e.plannedStart) {
        const d = e.plannedStart.slice(0,10);
        if (!map[d]) map[d] = [];
        if (!map[d].find(x => x.id === e.id)) map[d].push(e);
      }
    }
    return map;
  }, [entries]);

  const isFrozen = (d: number) => {
    const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return freezePeriods.some(fp => ds >= fp.from && ds <= fp.to);
  };

  const today = new Date().toISOString().slice(0,10);
  const prevMonth = () => { const d = new Date(y, m-2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); };
  const nextMonth = () => { const d = new Date(y, m, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); };
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div className="p-4 flex-1 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted text-text-muted"><ChevronDown className="w-4 h-4 rotate-90" /></button>
        <h3 className="text-sm font-semibold text-text-primary">{new Date(y, m-1, 1).toLocaleDateString("en",{month:"long",year:"numeric"})}</h3>
        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted text-text-muted"><ChevronDown className="w-4 h-4 -rotate-90" /></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {days.map(d => <div key={d} className="bg-surface-alt text-center text-[10px] font-semibold text-text-muted py-1.5">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="bg-surface min-h-[80px]" />;
          const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dayEntries = entryByDate[ds] || [];
          const frozen = isFrozen(d);
          const isToday = ds === today;
          return (
            <div key={i} className={`bg-surface min-h-[80px] p-1.5 ${frozen ? "bg-red-50" : ""}`}>
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-accent text-white" : "text-text-secondary"}`}>{d}</div>
              {frozen && <div className="text-[9px] text-red-600 font-medium mb-1">🔒 Freeze</div>}
              {dayEntries.slice(0,3).map(e => (
                <button key={e.id} onClick={() => onSelect(e)}
                  className={`w-full text-left text-[9px] px-1 py-0.5 rounded mb-0.5 truncate font-medium ${TYPE_BADGE[e.changeType || "Normal"] || "bg-blue-100 text-blue-800"}`}>
                  {e.id} {e.system}
                </button>
              ))}
              {dayEntries.length > 3 && <div className="text-[9px] text-text-muted">+{dayEntries.length-3} more</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[10px] text-text-muted flex-wrap">
        <span><span className="inline-block w-3 h-3 rounded bg-green-100 mr-1" />Standard</span>
        <span><span className="inline-block w-3 h-3 rounded bg-blue-100 mr-1" />Normal</span>
        <span><span className="inline-block w-3 h-3 rounded bg-red-100 mr-1" />Emergency</span>
        <span><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200 mr-1" />Freeze period</span>
      </div>
    </div>
  );
}

// ── Stats panel ────────────────────────────────────────────────────────

function StatsPanel({ entries }: { entries: ChangeLogEntry[] }) {
  const thisMonth = new Date().toISOString().slice(0,7);
  const kpi = [
    { label:"Total (visible)", value: entries.length, color:"text-accent" },
    { label:"This month", value: entries.filter(e => e.date.startsWith(thisMonth)).length, color:"text-blue-600" },
    { label:"Open (non-closed)", value: entries.filter(e => !["Closed","Completed","Rejected"].includes(e.status)).length, color:"text-amber-600" },
    { label:"High/Critical", value: entries.filter(e => e.risk==="High"||e.risk==="Critical").length, color:"text-red-600" },
  ];
  const byType: Record<string,number> = {};
  const byCat: Record<string,number> = {};
  const byRisk: Record<string,number> = {Low:0,Medium:0,High:0,Critical:0};
  const byStatus: Record<string,number> = {};
  const bySys: Record<string,number> = {};
  for (const e of entries) {
    byType[e.changeType||"Normal"] = (byType[e.changeType||"Normal"]||0)+1;
    byCat[e.category] = (byCat[e.category]||0)+1;
    byRisk[e.risk] = (byRisk[e.risk]||0)+1;
    byStatus[e.status] = (byStatus[e.status]||0)+1;
    bySys[e.system] = (bySys[e.system]||0)+1;
  }
  const sortedCats = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const maxCat = Math.max(...sortedCats.map(([,v])=>v),1);
  const topSys = Object.entries(bySys).sort((a,b) => b[1]-a[1]).slice(0,10);
  const maxSys = Math.max(...topSys.map(([,v])=>v),1);
  const weekBuckets: {label:string;count:number}[] = [];
  for (let w=7;w>=0;w--) {
    const start = new Date(); start.setDate(start.getDate()-start.getDay()-w*7);
    const end = new Date(start); end.setDate(end.getDate()+6);
    const s=start.toISOString().slice(0,10), e2=end.toISOString().slice(0,10);
    weekBuckets.push({label:start.toLocaleDateString("en",{month:"short",day:"numeric"}), count:entries.filter(e=>e.date>=s&&e.date<=e2).length});
  }
  const maxW = Math.max(...weekBuckets.map(b=>b.count),1);

  const successRate = entries.filter(e=>["Closed","Completed"].includes(e.status)).length /
    Math.max(entries.filter(e=>["Closed","Completed","Failed","Rolled Back"].includes(e.status)).length,1);

  return (
    <div className="p-6 space-y-8 overflow-auto">
      <div className="grid grid-cols-4 gap-4">
        {kpi.map(c => <div key={c.label} className="bg-surface-alt border border-border rounded-xl p-4"><p className="text-xs text-text-muted mb-1">{c.label}</p><p className={`text-3xl font-bold ${c.color}`}>{c.value}</p></div>)}
      </div>
      <div className="bg-surface-alt border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Success Rate</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
            <div className={`h-full rounded-full ${successRate >= 0.9 ? "bg-green-500" : successRate >= 0.7 ? "bg-amber-400" : "bg-red-500"}`} style={{width:`${successRate*100}%`}} />
          </div>
          <span className="text-lg font-bold text-text-primary">{Math.round(successRate*100)}%</span>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Changes per Week (last 8 weeks)</h3>
        <div className="flex items-end gap-2" style={{height:100}}>
          {weekBuckets.map((b,i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-text-muted">{b.count>0?b.count:""}</span>
              <div className="w-full bg-accent rounded-t" style={{height:Math.max(4,(b.count/maxW)*72)}} />
              <span className="text-[9px] text-text-muted text-center leading-tight">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">By Change Type</h3>
        <div className="grid grid-cols-3 gap-3">
          {[{l:"Standard",c:"bg-green-50 text-green-800 border-green-200"},{l:"Normal",c:"bg-blue-50 text-blue-800 border-blue-200"},{l:"Emergency",c:"bg-red-50 text-red-800 border-red-200"}].map(({l,c}) => (
            <div key={l} className={`border rounded-xl p-3 text-center ${c}`}><p className="text-2xl font-bold">{byType[l]||0}</p><p className="text-xs font-medium mt-1">{l}</p></div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">By Risk</h3>
        <div className="grid grid-cols-4 gap-3">
          {[{l:"Low",c:"bg-green-50 text-green-800 border-green-200"},{l:"Medium",c:"bg-amber-50 text-amber-800 border-amber-200"},{l:"High",c:"bg-orange-50 text-orange-800 border-orange-200"},{l:"Critical",c:"bg-red-50 text-red-800 border-red-200"}].map(({l,c}) => (
            <div key={l} className={`border rounded-xl p-3 text-center ${c}`}><p className="text-2xl font-bold">{byRisk[l]||0}</p><p className="text-xs font-medium mt-1">{l}</p></div>
          ))}
        </div>
      </div>
      {sortedCats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">By Category</h3>
          <div className="space-y-2">{sortedCats.map(([cat,count]) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-xs text-text-secondary w-28 flex-shrink-0 truncate">{cat}</span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{width:`${(count/maxCat)*100}%`}} /></div>
              <span className="text-xs font-medium text-text-primary w-6 text-right">{count}</span>
            </div>
          ))}</div>
        </div>
      )}
      {topSys.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Most Changed Systems</h3>
          <div className="space-y-2">{topSys.map(([sys,count]) => (
            <div key={sys} className="flex items-center gap-3">
              <span className="text-xs text-text-secondary w-40 flex-shrink-0 truncate">{sys}</span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{width:`${(count/maxSys)*100}%`}} /></div>
              <span className="text-xs font-medium text-text-primary w-6 text-right">{count}</span>
            </div>
          ))}</div>
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">By Status</h3>
        <div className="flex flex-wrap gap-3">{Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).map(([s,count]) => (
          <div key={s} className="bg-surface-alt border border-border rounded-lg px-4 py-2 text-center min-w-[100px]">
            <p className="text-xl font-bold text-text-primary">{count}</p><p className="text-xs text-text-muted mt-0.5">{s}</p>
          </div>
        ))}</div>
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────

function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cabMembers, setCabMembers] = useState("");
  const [newFreeze, setNewFreeze] = useState({ from:"", to:"", reason:"" });
  const [freezePeriods, setFreezePeriods] = useState<FreezePeriod[]>([]);
  const [templates, setTemplates] = useState<ChangeTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings/changelog").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      setCabMembers((d.cabMembers || []).join(", "));
      setFreezePeriods(d.freezePeriods || []);
      setTemplates(d.templates || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/changelog", { method: "PUT", headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ retentionYears: 5, cabMembers: cabMembers.split(",").map(s=>s.trim()).filter(Boolean), freezePeriods, templates }) });
      if (res.ok) { onSaved(); onClose(); }
    } finally { setSaving(false); }
  };

  const addFreeze = () => {
    if (!newFreeze.from || !newFreeze.to || !newFreeze.reason) return;
    setFreezePeriods(f => [...f, { id: Date.now().toString(), ...newFreeze }]);
    setNewFreeze({ from:"", to:"", reason:"" });
  };

  if (!loaded) return <div className="w-96 border-l border-border bg-surface flex items-center justify-center"><span className="text-text-muted text-sm">Loading…</span></div>;

  return (
    <div className="w-96 border-l border-border bg-surface flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Change Log Settings</span></div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* CAB Members */}
        <div>
          <label className="cl-label">CAB Members (usernames)</label>
          <input type="text" className="cl-input" placeholder="user1, user2, user3" value={cabMembers} onChange={e => setCabMembers(e.target.value)} />
          <p className="text-[10px] text-text-muted mt-1">Comma-separated. Will be notified for Normal/Emergency changes.</p>
        </div>

        {/* Freeze Periods */}
        <div>
          <label className="cl-label mb-2 block">Change Freeze Periods</label>
          {freezePeriods.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {freezePeriods.map(fp => (
                <div key={fp.id} className="flex items-center gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs">
                  <div className="flex-1 min-w-0"><span className="font-medium">{fp.from} – {fp.to}</span><br/><span className="text-text-muted truncate">{fp.reason}</span></div>
                  <button onClick={() => setFreezePeriods(f => f.filter(x => x.id !== fp.id))} className="text-red-500 hover:text-red-700"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <input type="date" className="cl-input text-xs" placeholder="From" value={newFreeze.from} onChange={e => setNewFreeze(f => ({...f, from: e.target.value}))} />
            <input type="date" className="cl-input text-xs" placeholder="To" value={newFreeze.to} onChange={e => setNewFreeze(f => ({...f, to: e.target.value}))} />
          </div>
          <input type="text" className="cl-input text-xs mt-1.5" placeholder="Reason (e.g. Year-end freeze)" value={newFreeze.reason} onChange={e => setNewFreeze(f => ({...f, reason: e.target.value}))} />
          <button onClick={addFreeze} disabled={!newFreeze.from||!newFreeze.to||!newFreeze.reason} className="mt-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">Add Freeze Period</button>
        </div>

        {/* Templates */}
        <div>
          <label className="cl-label mb-2 block">Change Templates</label>
          {templates.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {templates.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 bg-surface-alt border border-border rounded-lg text-xs">
                  <div className="flex-1 min-w-0"><span className="font-medium">{t.name}</span> <span className="text-text-muted">({t.changeType}, {t.category}, {t.risk})</span></div>
                  <button onClick={() => setTemplates(ts => ts.filter(x => x.id !== t.id))} className="text-text-muted hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setTemplates(ts => [...ts, { id: Date.now().toString(), name: "New Template", changeType: "Normal", category: "Software", risk: "Low", description: "", impact: "", backoutPlan: "" }])}
            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted text-text-secondary">
            + Add Template
          </button>
          {templates.map((t, i) => t.name === "New Template" ? null : (
            <div key={t.id} className="mt-2 space-y-1">
              <input className="cl-input text-xs" placeholder="Template name" value={t.name} onChange={e => setTemplates(ts => ts.map((x,j) => j===i ? {...x, name: e.target.value} : x))} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 px-4 py-3 border-t border-border">
        <button onClick={save} disabled={saving} className="w-full py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ChangeLogPage() {
  const router = useRouter();
  const [allEntries, setAllEntries] = useState<ChangeLogEntry[]>([]);
  const [knownSystems, setKnownSystems] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>(["Disk","Network","Security","Software","Hardware","Configuration","Other"]);
  const [templates, setTemplates] = useState<ChangeTemplate[]>([]);
  const [freezePeriods, setFreezePeriods] = useState<FreezePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string|null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<TabKey>("list");
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ChangeLogEntry|null>(null);
  const [rollbackPrefill, setRollbackPrefill] = useState<Partial<ChangeLogEntry>|undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [myChangesOnly, setMyChangesOnly] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r=>r.json()).then(d => { setCurrentUser(d.user?.username||""); setIsAdmin(!!d.user?.isAdmin); }).catch(()=>{});
    fetch("/api/settings/changelog").then(r=>r.ok?r.json():null).then(d=>{if(d?.categories?.length)setCategories(d.categories);}).catch(()=>{});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changelog");
      if (res.ok) {
        const data = await res.json();
        setAllEntries(data.entries || []);
        setKnownSystems(data.systems || []);
        setTemplates(data.templates || []);
        setFreezePeriods(data.freezePeriods || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = [...allEntries];
    const from = selectedDate || dateFrom;
    const to = selectedDate || dateTo;
    if (from) list = list.filter(e => e.date >= from);
    if (to) list = list.filter(e => e.date <= to);
    if (categoryFilter) list = list.filter(e => e.category === categoryFilter);
    if (riskFilter) list = list.filter(e => e.risk === riskFilter);
    if (statusFilter) list = list.filter(e => e.status === statusFilter);
    if (typeFilter) list = list.filter(e => (e.changeType || "Normal") === typeFilter);
    if (systemFilter) list = list.filter(e => e.system.toLowerCase() === systemFilter.toLowerCase());
    if (myChangesOnly) list = list.filter(e => e.assignedTo === currentUser || e.author === currentUser);
    if (searchQ.trim().length >= 2) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(e => e.id.toLowerCase().includes(q)||e.system.toLowerCase().includes(q)||e.description.toLowerCase().includes(q)||e.category.toLowerCase().includes(q)||e.author.toLowerCase().includes(q)||(e.assignedTo||'').toLowerCase().includes(q));
    }
    return list;
  }, [allEntries, selectedDate, dateFrom, dateTo, categoryFilter, riskFilter, statusFilter, typeFilter, systemFilter, myChangesOnly, searchQ, currentUser]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a,b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "id": cmp = a.id.localeCompare(b.id); break;
        case "system": cmp = a.system.localeCompare(b.system); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "risk": cmp = (RISK_ORDER[a.risk]??0)-(RISK_ORDER[b.risk]??0); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "changeType": cmp = (a.changeType||"Normal").localeCompare(b.changeType||"Normal"); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const entryDates = useMemo(() => new Set(allEntries.map(e => e.date)), [allEntries]);
  const topSystems = useMemo(() => {
    const c: Record<string,number> = {};
    for (const e of allEntries) c[e.system] = (c[e.system]||0)+1;
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);
  }, [allEntries]);

  const pendingApprovalCount = allEntries.filter(e => !["Closed","Completed","Rejected"].includes(e.status) && ["CAB Approval","Under Review","Submitted"].includes(e.status)).length;

  const toggleSort = (k: SortKey) => { if (sortKey===k) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortKey(k); setSortDir(k==="date"?"desc":"asc"); } };
  const clearFilters = () => { setSelectedDate(null); setDateFrom(""); setDateTo(""); setCategoryFilter(""); setRiskFilter(""); setStatusFilter(""); setTypeFilter(""); setSystemFilter(""); setSearchQ(""); setMyChangesOnly(false); };
  const hasFilter = !!(selectedDate||dateFrom||dateTo||categoryFilter||riskFilter||statusFilter||typeFilter||systemFilter||myChangesOnly||searchQ);

  const handleSave = async (data: Record<string,unknown>) => {
    const res = await fetch("/api/changelog", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(data) });
    const body = res.ok ? await res.json() : {};
    setRollbackPrefill(undefined);
    await fetchData();
    return { conflicts: body.conflicts || [] };
  };

  const thisMonth = new Date().toISOString().slice(0,7);
  const kpiFailed = filtered.filter(e=>e.status==="Failed"||e.status==="Rolled Back").length;
  const kpiHigh = filtered.filter(e=>e.risk==="High"||e.risk==="Critical").length;

  const SortIcon = ({ col }: { col: SortKey }) => { if (sortKey!==col) return null; return sortDir==="asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />; };

  const tabs: {key: TabKey; label: string; Icon: typeof List}[] = [
    { key:"list", label:"List", Icon: List },
    { key:"calendar", label:"FSC Calendar", Icon: Calendar },
    { key:"stats", label:"Statistics", Icon: BarChart2 },
  ];

  return (
    <div className="jp-root">
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <ClipboardList className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Change Log</h1>
          {pendingApprovalCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-semibold">{pendingApprovalCount} awaiting approval</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {tabs.map(({key,label,Icon}) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${tab===key?"bg-accent text-white":"text-text-secondary hover:bg-muted"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          {sorted.length > 0 && (
            <button className="jp-action-btn" onClick={() => {
              const header = ["ID","Type","Date","Time","Author","System","Category","Risk","Status","Description","Impact","Backout","Downtime(min)","PIR","Closed At"];
              const rows = sorted.map(e=>[e.id,e.changeType||"Normal",e.date,e.time||"",e.author,e.system,e.category,e.risk,e.status,e.description,e.impact,e.backoutPlan||"",e.downtimeMinutes||"",e.pirNotes||"",e.closedAt||""]);
              const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
              const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
              const a=document.createElement("a"); a.href=url; a.download=`changelog-${new Date().toISOString().slice(0,10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}><Download className="w-4 h-4" /> CSV</button>
          )}
          {hasFilter && <button className="jp-action-btn" onClick={clearFilters}>Clear filters</button>}
          {isAdmin && (
            <button className={`jp-action-btn ${showSettings?"jp-action-btn--primary":""}`} onClick={() => setShowSettings(v=>!v)} title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => { setRollbackPrefill(undefined); setShowNewModal(true); }}>
            <Plus className="w-4 h-4" /> Log Change
          </button>
        </div>
      </header>

      <div className="jp-main">
        {/* Sidebar */}
        <aside className="jp-sidebar overflow-y-auto">
          <JournalCalendar entryDates={entryDates} selectedDate={selectedDate}
            onSelectDate={d => { setSelectedDate(d===selectedDate?null:d); setDateFrom(""); setDateTo(""); }} />
          <div className="jp-section">
            <h3 className="jp-section-title">Date Range</h3>
            <div className="space-y-1.5">
              <div><label className="text-[10px] text-text-muted uppercase tracking-wide">From</label>
                <input type="date" className="cl-input mt-0.5" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setSelectedDate(null);}} /></div>
              <div><label className="text-[10px] text-text-muted uppercase tracking-wide">To</label>
                <input type="date" className="cl-input mt-0.5" value={dateTo} onChange={e=>{setDateTo(e.target.value);setSelectedDate(null);}} /></div>
            </div>
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Change Type</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!typeFilter?" cl-cat-btn--active":""}`} onClick={()=>setTypeFilter("")}>All</button>
              {CHANGE_TYPES.map(t => (
                <button key={t} className={`cl-cat-btn${typeFilter===t?" cl-cat-btn--active":""}`} onClick={()=>setTypeFilter(typeFilter===t?"":t)}>
                  {t === "Emergency" && <Zap className="w-2.5 h-2.5 inline mr-0.5" />}{t}
                </button>
              ))}
            </div>
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Category</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!categoryFilter?" cl-cat-btn--active":""}`} onClick={()=>setCategoryFilter("")}>All</button>
              {categories.map(c=><button key={c} className={`cl-cat-btn${categoryFilter===c?" cl-cat-btn--active":""}`} onClick={()=>setCategoryFilter(categoryFilter===c?"":c)}>{c}</button>)}
            </div>
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Risk</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!riskFilter?" cl-cat-btn--active":""}`} onClick={()=>setRiskFilter("")}>All</button>
              {RISKS.map(r=><button key={r} className={`cl-cat-btn${riskFilter===r?" cl-cat-btn--active":""}`} onClick={()=>setRiskFilter(riskFilter===r?"":r)}>{r}</button>)}
            </div>
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Status</h3>
            <div className="cl-cat-filters">
              <button className={`cl-cat-btn${!statusFilter?" cl-cat-btn--active":""}`} onClick={()=>setStatusFilter("")}>All</button>
              {STATUSES.map(s=><button key={s} className={`cl-cat-btn${statusFilter===s?" cl-cat-btn--active":""}`} onClick={()=>setStatusFilter(statusFilter===s?"":s)}>{s}</button>)}
            </div>
          </div>
          {topSystems.length > 0 && (
            <div className="jp-section">
              <h3 className="jp-section-title">By System</h3>
              <div className="space-y-1">
                {topSystems.map(([sys,count])=>(
                  <div key={sys} className="flex items-center justify-between text-xs">
                    <button className={`truncate pr-2 text-left hover:text-accent transition-colors ${systemFilter===sys?"text-accent font-medium":"text-text-secondary"}`}
                      title={sys} onClick={()=>setSystemFilter(systemFilter===sys?"":sys)}>
                      {systemFilter===sys&&"▶ "}{sys}
                    </button>
                    <span className="text-text-muted flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {freezePeriods.length > 0 && (
            <div className="jp-section">
              <h3 className="jp-section-title">Freeze Periods</h3>
              {freezePeriods.map(fp => (
                <div key={fp.id} className="text-xs p-2 bg-red-50 border border-red-200 rounded-lg mb-1.5">
                  <p className="font-medium text-red-800">🔒 {fp.from} – {fp.to}</p>
                  <p className="text-red-700">{fp.reason}</p>
                </div>
              ))}
            </div>
          )}
          <div className="jp-section">
            <h3 className="jp-section-title">Quick Filters</h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary py-1">
              <input type="checkbox" checked={myChangesOnly} onChange={e=>setMyChangesOnly(e.target.checked)} className="rounded" />
              My changes (assigned to me / authored)
            </label>
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Search</h3>
            <input type="text" className="cl-input" placeholder="Search changes…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} />
          </div>
        </aside>

        {/* Main */}
        <main className="jp-content overflow-auto flex flex-col">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : tab === "calendar" ? (
            <FSCCalendar entries={allEntries} freezePeriods={freezePeriods} onSelect={e => setDetailEntry(e)} />
          ) : tab === "stats" ? (
            <StatsPanel entries={filtered} />
          ) : (
            <>
              {filtered.length > 0 && (
                <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
                  {[
                    {label:"Visible",value:filtered.length,color:"text-accent"},
                    {label:"This month",value:filtered.filter(e=>e.date.startsWith(thisMonth)).length,color:"text-blue-600"},
                    {label:"Failed/Rolled back",value:kpiFailed,color:"text-red-600"},
                    {label:"High/Critical",value:kpiHigh,color:"text-amber-600"},
                  ].map(c=>(
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
                  <p className="text-text-muted">No change entries{hasFilter?" matching filters":" yet"}</p>
                  {!hasFilter && <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={()=>setShowNewModal(true)}><Plus className="w-4 h-4" /> Log Change</button>}
                </div>
              ) : (
                <div className="cl-table-wrap">
                  <table className="cl-table">
                    <thead>
                      <tr>
                        <th onClick={()=>toggleSort("id")} className="cl-th cl-th--sort">ID <SortIcon col="id" /></th>
                        <th onClick={()=>toggleSort("changeType")} className="cl-th cl-th--sort">Type <SortIcon col="changeType" /></th>
                        <th onClick={()=>toggleSort("date")} className="cl-th cl-th--sort">Date <SortIcon col="date" /></th>
                        <th onClick={()=>toggleSort("system")} className="cl-th cl-th--sort">System <SortIcon col="system" /></th>
                        <th onClick={()=>toggleSort("category")} className="cl-th cl-th--sort">Category <SortIcon col="category" /></th>
                        <th className="cl-th">Description</th>
                        <th onClick={()=>toggleSort("risk")} className="cl-th cl-th--sort">Risk <SortIcon col="risk" /></th>
                        <th onClick={()=>toggleSort("status")} className="cl-th cl-th--sort">Status <SortIcon col="status" /></th>
                        <th className="cl-th">Assigned To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(e => (
                        <tr key={e.id} className="cl-tr" onClick={()=>setDetailEntry(e)}>
                          <td className="cl-td cl-td--id">{e.rollbackOf&&<span title={`Rollback of ${e.rollbackOf}`}>↩ </span>}{e.id}</td>
                          <td className="cl-td">
                            <span className={`cl-badge text-[10px] ${TYPE_BADGE[e.changeType||"Normal"]||""}`}>
                              {e.changeType==="Emergency"&&<Zap className="w-2.5 h-2.5 inline mr-0.5" />}
                              {e.changeType||"Normal"}
                            </span>
                          </td>
                          <td className="cl-td cl-td--date">{e.date}{e.time?` ${e.time}`:""}</td>
                          <td className="cl-td cl-td--system">{e.system}</td>
                          <td className="cl-td">{e.category}</td>
                          <td className="cl-td cl-td--desc">{e.description.length>70?e.description.slice(0,70)+"…":e.description}</td>
                          <td className="cl-td"><span className={`cl-badge ${RISK_BADGE[e.risk]||""}`}>{e.risk}</span></td>
                          <td className="cl-td"><span className={`cl-badge text-[10px] ${STATUS_BADGE[e.status]||""}`}>{e.status}</span></td>
                          <td className="cl-td text-xs text-text-secondary">{e.assignedTo || <span className="text-text-muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cl-table-count">{sorted.length} {sorted.length===1?"entry":"entries"}{hasFilter?` (filtered from ${allEntries.length})`:""}</div>
                </div>
              )}
            </>
          )}
        </main>

        {showSettings && <SettingsPanel onClose={()=>setShowSettings(false)} onSaved={fetchData} />}
      </div>

      <ChangeLogModal
        isOpen={showNewModal}
        onClose={() => { setShowNewModal(false); setRollbackPrefill(undefined); }}
        onSave={handleSave}
        knownSystems={knownSystems}
        categories={categories}
        templates={templates}
        prefill={rollbackPrefill}
      />
      <ChangeLogDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onLogRollback={e => { setRollbackPrefill(e); setShowNewModal(true); }}
        onUpdated={updated => {
          setAllEntries(es => es.map(e => e.id === updated.id ? updated : e));
          setDetailEntry(updated);
        }}
        currentUser={currentUser}
        isCabMember={false}
      />
    </div>
  );
}
