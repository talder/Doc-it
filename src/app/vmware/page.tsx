"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Server, RefreshCw, Search, Download, Settings,
  ChevronUp, ChevronDown, X, Check, Plus, Trash2, Eye, EyeOff,
  Bookmark, BookmarkCheck, Database, Power, Camera, AlertTriangle,
  Play, Square, RotateCcw, PauseCircle, ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { VmHostStats, SnapshotInfo } from "@/lib/vmware";

// ── Types ─────────────────────────────────────────────────────────────────────

type VmPowerState = "POWERED_ON" | "POWERED_OFF" | "SUSPENDED";

interface VmRecord {
  vmId: string; name: string; powerState: VmPowerState; host: string;
  guestOS: string; guestOSDisplay: string; guestOSFullName: string;
  toolsVersion: string; toolsStatus: string;
  memoryMiB: number; memoryUsedMiB: number | null;
  cpuCount: number; cpuUsageMhz: number | null;
  storageBytesProvisioned: number;
  ipAddress: string; annotation: string; hardwareVersion: string; snapshotCount: number;
}

interface SavedFilter {
  id: string; name: string; powerState: string; host: string; os: string; q: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b <= 0) return "0 B";
  if (b >= 1_099_511_627_776) return `${(b / 1_099_511_627_776).toFixed(1)} TB`;
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_024).toFixed(1)} KB`;
}
function fmtMiB(m: number): string { return m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : `${m} MB`; }
function fmtTime(iso: string): string { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function")
    return (crypto as { randomUUID: () => string }).randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const LS_FILTERS_KEY = "docit-vmware-saved-filters";
function loadSavedFilters(): SavedFilter[] { try { const r = localStorage.getItem(LS_FILTERS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function persistSavedFilters(f: SavedFilter[]): void { try { localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(f)); } catch {} }

// ── Power badge ───────────────────────────────────────────────────────────────

function PowerBadge({ state }: { state: VmPowerState }) {
  const cls = { POWERED_ON: "bg-green-100 text-green-800 border-green-300", POWERED_OFF: "bg-red-100 text-red-800 border-red-300", SUSPENDED: "bg-amber-100 text-amber-800 border-amber-300" };
  const dot = { POWERED_ON: "bg-green-500", POWERED_OFF: "bg-red-500", SUSPENDED: "bg-amber-500" };
  const lbl = { POWERED_ON: "On", POWERED_OFF: "Off", SUSPENDED: "Suspended" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${cls[state] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot[state] ?? "bg-gray-400"}`} />
      {lbl[state] ?? state}
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

type SortKey = "name" | "host" | "powerState" | "guestOSDisplay" | "toolsVersion" | "memoryMiB" | "cpuCount" | "storageBytesProvisioned" | "ipAddress" | "snapshotCount";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return null;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
}

// ── Snapshot tree ──────────────────────────────────────────────────────────────

function SnapshotTree({ snapshots, onDelete, deleting }: {
  snapshots: SnapshotInfo[];
  onDelete: (moRef: string, withChildren: boolean) => void;
  deleting: string | null;
}) {
  return (
    <ul className="space-y-1">
      {snapshots.map((snap) => (
        <li key={snap.moRef} className="pl-3 border-l border-border">
          <div className="flex items-start gap-2 py-1">
            <Camera className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-primary truncate">{snap.name || "(unnamed)"}</span>
                <span className={`text-[10px] px-1.5 rounded ${snap.powerState === "poweredOn" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{snap.powerState}</span>
              </div>
              {snap.description && <p className="text-[10px] text-text-muted truncate">{snap.description}</p>}
              {snap.createdAt && <p className="text-[10px] text-text-muted">{fmtTime(snap.createdAt)}</p>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => onDelete(snap.moRef, false)}
                disabled={!!deleting}
                className="px-1.5 py-0.5 text-[10px] border border-border rounded hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                title="Delete this snapshot"
              >
                {deleting === snap.moRef ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Delete"}
              </button>
              {snap.children.length > 0 && (
                <button
                  onClick={() => onDelete(snap.moRef, true)}
                  disabled={!!deleting}
                  className="px-1.5 py-0.5 text-[10px] border border-border rounded hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  title="Delete with all child snapshots"
                >
                  Delete +children
                </button>
              )}
            </div>
          </div>
          {snap.children.length > 0 && (
            <SnapshotTree snapshots={snap.children} onDelete={onDelete} deleting={deleting} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────

interface CfgForm { enabled: boolean; vcenterUrl: string; username: string; password: string; passwordSet: boolean; ignoreSslErrors: boolean; allowedUsers: string[]; }
const EMPTY_CFG: CfgForm = { enabled: false, vcenterUrl: "", username: "", password: "", passwordSet: false, ignoreSslErrors: false, allowedUsers: [] };

function ConfigPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CfgForm>(EMPTY_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [newUser, setNewUser] = useState("");

  useEffect(() => {
    fetch("/api/vmware/config").then((r) => r.json()).then((d) => {
      if (!d.error) setForm({ enabled: !!d.enabled, vcenterUrl: d.vcenterUrl || "", username: d.username || "", password: "", passwordSet: !!d.passwordSet, ignoreSslErrors: !!d.ignoreSslErrors, allowedUsers: Array.isArray(d.allowedUsers) ? d.allowedUsers : [] });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveError("");
    const body: Record<string, unknown> = { enabled: form.enabled, vcenterUrl: form.vcenterUrl.trim(), username: form.username.trim(), ignoreSslErrors: form.ignoreSslErrors, allowedUsers: form.allowedUsers };
    if (form.password) body.password = form.password;
    const res = await fetch("/api/vmware/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { onSaved(); onClose(); } else { const d = await res.json(); setSaveError(d.error || "Failed to save"); }
    setSaving(false);
  };

  if (loading) return <div className="w-80 border-l border-border bg-surface flex items-center justify-center"><span className="text-text-muted text-sm">Loading…</span></div>;

  return (
    <div className="w-80 border-l border-border bg-surface flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">vCenter Settings</span></div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`relative w-10 h-5 rounded-full transition-colors ${form.enabled ? "bg-accent" : "bg-[var(--color-muted)]"}`} onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.enabled ? "translate-x-5" : ""}`} />
          </div>
          <span className="text-sm font-medium text-text-primary">Enable VMware Inventory</span>
        </label>
        {[{ label: "vCenter URL", key: "vcenterUrl" as const, type: "url", ph: "https://vcenter.example.com" }, { label: "Username", key: "username" as const, type: "text", ph: "administrator@vsphere.local" }].map(({ label, key, type, ph }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
            <input type={type} className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder={ph} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Password {form.passwordSet && !form.password && <span className="text-green-600">(set)</span>}</label>
          <div className="relative">
            <input type={showPwd ? "text" : "password"} className="w-full px-3 py-1.5 pr-9 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder={form.passwordSet ? "Leave blank to keep" : "Enter password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary" onClick={() => setShowPwd((v) => !v)}>{showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary"><input type="checkbox" checked={form.ignoreSslErrors} onChange={(e) => setForm((f) => ({ ...f, ignoreSslErrors: e.target.checked }))} className="rounded border-border" />Ignore SSL errors</label>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Allowed Users</label>
          <div className="flex gap-2 mb-2">
            <input type="text" className="flex-1 px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder="username" value={newUser} onChange={(e) => setNewUser(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { if (newUser.trim() && !form.allowedUsers.includes(newUser.trim())) setForm((f) => ({ ...f, allowedUsers: [...f.allowedUsers, newUser.trim()] })); setNewUser(""); } }} />
            <button onClick={() => { if (newUser.trim() && !form.allowedUsers.includes(newUser.trim())) setForm((f) => ({ ...f, allowedUsers: [...f.allowedUsers, newUser.trim()] })); setNewUser(""); }} className="px-2 py-1.5 bg-accent text-white rounded-lg"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1">{form.allowedUsers.map((u) => (
            <div key={u} className="flex items-center justify-between px-2 py-1 rounded bg-surface-alt text-sm text-text-primary">
              <span>{u}</span><button onClick={() => setForm((f) => ({ ...f, allowedUsers: f.allowedUsers.filter((x) => x !== u) }))} className="text-text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}</div>
        </div>
        {testResult && <div className={`text-xs px-3 py-2 rounded-lg border ${testResult.ok ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}`}>{testResult.message}</div>}
        {saveError && <div className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-800">{saveError}</div>}
      </div>
      <div className="flex-shrink-0 px-4 py-3 border-t border-border flex gap-2">
        <button onClick={async () => { setTesting(true); setTestResult(null); const res = await fetch("/api/vmware/vms?refresh=true").catch(() => null); if (res?.ok) { const d = await res.json(); setTestResult({ ok: true, message: `OK — ${d.vms?.length ?? 0} VMs` }); } else { const d = await res?.json().catch(() => ({})); setTestResult({ ok: false, message: d?.error || "Failed" }); } setTesting(false); }} disabled={testing} className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary disabled:opacity-50">{testing ? "Testing…" : "Test Connection"}</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-1.5">{saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Save</>}</button>
      </div>
    </div>
  );
}

// ── Export modal ──────────────────────────────────────────────────────────────

function ExportTableModal({ vms, onClose }: { vms: VmRecord[]; onClose: () => void }) {
  const router = useRouter();
  const [spaces, setSpaces] = useState<{ slug: string; name: string }[]>([]);
  const [spaceSlug, setSpaceSlug] = useState("");
  const [tableTitle, setTableTitle] = useState(() => { const n = new Date(); return `VMware Inventory ${n.toLocaleDateString()} ${n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`; });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/spaces").then((r) => r.json()).then((d: { slug: string; name: string }[]) => { setSpaces(Array.isArray(d) ? d : []); if (d.length) setSpaceSlug(d[0].slug); }).catch(() => {}); }, []);
  const handleExport = async () => {
    if (!spaceSlug || !tableTitle.trim()) return;
    setExporting(true); setError("");
    try {
      const columns = [
        { name: "VM Name", type: "text", width: 220 }, { name: "Host", type: "text", width: 160 },
        { name: "Status", type: "select", options: ["POWERED_ON", "POWERED_OFF", "SUSPENDED"], width: 120 },
        { name: "IP Address", type: "text", width: 140 }, { name: "OS", type: "text", width: 180 },
        { name: "OS Full Name", type: "text", width: 200 }, { name: "Tools Version", type: "text", width: 120 },
        { name: "HW Version", type: "text", width: 100 }, { name: "Snapshots", type: "number", width: 90 },
        { name: "Memory (MB)", type: "number", width: 120 }, { name: "CPU (vCPUs)", type: "number", width: 100 },
        { name: "Storage Provisioned", type: "text", width: 140 }, { name: "Annotation", type: "text", width: 200 }, { name: "VM ID", type: "text", width: 140 },
      ];
      const cr = await fetch(`/api/spaces/${spaceSlug}/enhanced-tables`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: tableTitle.trim(), columns }) });
      if (!cr.ok) { const d = await cr.json(); setError(d.error || `HTTP ${cr.status}`); setExporting(false); return; }
      const db = await cr.json(); const dbId: string = db.id; const cm: Record<string, string> = {};
      for (const col of db.columns as { id: string; name: string }[]) cm[col.name] = col.id;
      const rows = vms.map((vm) => ({ id: uuid(), cells: { [cm["VM Name"]]: vm.name, [cm["Host"]]: vm.host, [cm["Status"]]: vm.powerState, [cm["IP Address"]]: vm.ipAddress || "—", [cm["OS"]]: vm.guestOSDisplay, [cm["OS Full Name"]]: vm.guestOSFullName || vm.guestOSDisplay, [cm["Tools Version"]]: vm.toolsVersion || "—", [cm["HW Version"]]: vm.hardwareVersion || "—", [cm["Snapshots"]]: vm.snapshotCount, [cm["Memory (MB)"]]: vm.memoryMiB, [cm["CPU (vCPUs)"]]: vm.cpuCount, [cm["Storage Provisioned"]]: fmtBytes(vm.storageBytesProvisioned), [cm["Annotation"]]: vm.annotation || "", [cm["VM ID"]]: vm.vmId }, createdAt: new Date().toISOString() }));
      const ur = await fetch(`/api/spaces/${spaceSlug}/enhanced-tables/${dbId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!ur.ok) { const d = await ur.json(); setError(d.error || "Failed"); setExporting(false); return; }
      try { sessionStorage.setItem("docit-open-db", JSON.stringify({ spaceSlug, dbId })); } catch {}
      onClose(); router.push("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); setExporting(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Database className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Export to Enhanced Table</span></div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-text-muted">Creates a table with <span className="font-semibold text-text-primary">{vms.length} VM{vms.length !== 1 ? "s" : ""}</span> (current filter). Includes IP, annotation, hardware version, snapshot count.</p>
          <div><label className="block text-xs font-medium text-text-secondary mb-1">Space</label>
            <select className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary" value={spaceSlug} onChange={(e) => setSpaceSlug(e.target.value)}>{spaces.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}{spaces.length === 0 && <option value="">No spaces</option>}</select>
          </div>
          <div><label className="block text-xs font-medium text-text-secondary mb-1">Table Name</label>
            <input type="text" className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary" value={tableTitle} onChange={(e) => setTableTitle(e.target.value)} /></div>
          {error && <div className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-800">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary">Cancel</button>
          <button onClick={handleExport} disabled={exporting || !spaceSlug || !tableTitle.trim()} className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5">{exporting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><Database className="w-3.5 h-3.5" /> Create Table</>}</button>
        </div>
      </div>
    </div>
  );
}

// ── VM Row ────────────────────────────────────────────────────────────────────

function VmRow({ vm, onFilterHost, onFilterOS, isAdmin }: {
  vm: VmRecord; onFilterHost: (h: string) => void; onFilterOS: (os: string) => void; isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [snapsLoading, setSnapsLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const isZombie = vm.powerState === "POWERED_OFF";

  const loadSnapshots = async () => {
    setSnapsLoading(true);
    try {
      const res = await fetch(`/api/vmware/vms/${vm.vmId}/snapshots`);
      const d = await res.json();
      setSnapshots(d.snapshots ?? []);
    } catch { setSnapshots([]); }
    setSnapsLoading(false);
  };

  const handleSnapshot = async () => {
    setSnapshotPanelOpen((v) => !v);
    if (!snapshotPanelOpen && snapshots === null) await loadSnapshots();
  };

  const handleDelete = async (moRef: string, withChildren: boolean) => {
    if (!confirm(`Delete snapshot "${moRef}"${withChildren ? " and all its children" : ""}?`)) return;
    setDeleting(moRef);
    await fetch(`/api/vmware/snapshots/${encodeURIComponent(moRef)}?children=${withChildren}`, { method: "DELETE" });
    await loadSnapshots();
    setDeleting(null);
  };

  const handlePower = async (action: string) => {
    if (!confirm(`${action} VM "${vm.name}"?`)) return;
    setActionLoading(action); setActionMsg("");
    const res = await fetch(`/api/vmware/vms/${vm.vmId}/power`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await res.json();
    setActionMsg(res.ok ? `✓ ${action} sent` : `✗ ${d.error || "Failed"}`);
    setActionLoading(null);
    setTimeout(() => setActionMsg(""), 4000);
  };

  return (
    <>
      <tr className={`cl-tr cursor-pointer ${isZombie ? "opacity-70" : ""}`} onClick={() => setExpanded((v) => !v)}>
        <td className="cl-td font-medium text-text-primary">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            {isZombie && <span title="Powered off — possible zombie VM" className="text-red-400"><AlertTriangle className="w-3 h-3" /></span>}
            {vm.snapshotCount > 0 && (
              <button
                title={`${vm.snapshotCount} snapshot${vm.snapshotCount !== 1 ? "s" : ""} — click to manage`}
                onClick={(e) => { e.stopPropagation(); handleSnapshot(); }}
                className={`text-[10px] px-1 rounded font-bold flex items-center gap-0.5 transition-colors ${
                  snapshotPanelOpen
                    ? "bg-amber-300 text-amber-900"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                <Camera className="w-2.5 h-2.5" />{vm.snapshotCount}
              </button>
            )}
            <span className="truncate">{vm.name}</span>
          </div>
        </td>
        <td className="cl-td">
          {vm.host && vm.host !== "Unknown" ? (
            <button className="text-text-secondary hover:text-accent text-xs" onClick={(e) => { e.stopPropagation(); onFilterHost(vm.host); }}>{vm.host}</button>
          ) : <span className="text-text-muted text-xs">—</span>}
        </td>
        <td className="cl-td"><PowerBadge state={vm.powerState} /></td>
        <td className="cl-td">
          <button className="text-text-secondary hover:text-accent text-xs text-left" onClick={(e) => { e.stopPropagation(); onFilterOS(vm.guestOSDisplay); }}>{vm.guestOSDisplay || "—"}</button>
        </td>
        <td className="cl-td text-text-secondary text-xs">{vm.ipAddress || "—"}</td>
        <td className="cl-td text-text-secondary text-xs">{vm.toolsVersion || "—"}</td>
        <td className="cl-td">
          <span className="text-text-primary font-medium">{fmtMiB(vm.memoryMiB)}</span>
          {vm.memoryUsedMiB !== null && <span className="text-xs text-text-muted ml-1">/ {fmtMiB(vm.memoryUsedMiB)} used</span>}
        </td>
        <td className="cl-td">
          <span className="text-text-primary font-medium">{vm.cpuCount} vCPU</span>
          {vm.cpuUsageMhz !== null && <span className="text-xs text-text-muted ml-1">/ {vm.cpuUsageMhz} MHz</span>}
        </td>
        <td className="cl-td text-text-secondary">{fmtBytes(vm.storageBytesProvisioned)}</td>
      </tr>

      {/* Snapshot panel — always directly below the main row when open */}
      {snapshotPanelOpen && (
        <tr className="border-b border-amber-200">
          <td colSpan={9} className="px-4 py-3 bg-amber-50/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                <Camera className="w-4 h-4" />
                Snapshots — {vm.name}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={loadSnapshots} disabled={snapsLoading} className="text-xs text-accent hover:underline flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${snapsLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button onClick={() => setSnapshotPanelOpen(false)} className="p-1 rounded hover:bg-amber-100 text-amber-700"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {snapsLoading ? (
              <div className="text-xs text-text-muted flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Loading snapshots…</div>
            ) : snapshots && snapshots.length > 0 ? (
              <SnapshotTree snapshots={snapshots} onDelete={handleDelete} deleting={deleting} />
            ) : (
              <p className="text-xs text-text-muted italic">No snapshots found for this VM.</p>
            )}
            <p className="text-[10px] text-amber-600 mt-2">⚠️ Snapshot deletion is irreversible. Old snapshots can consume significant disk space.</p>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="bg-surface-alt border-b border-border">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs mb-3">
              {[
                ["VM ID", vm.vmId], ["Power State", vm.powerState], ["Host", vm.host || "—"],
                ["IP Address", vm.ipAddress || "—"], ["OS (category)", vm.guestOSDisplay || "—"],
                ["OS (full name)", vm.guestOSFullName || "—"], ["OS (enum)", vm.guestOS || "—"],
                ["HW Version", vm.hardwareVersion || "—"], ["Tools Version", vm.toolsVersion || "Not installed"],
                ["Tools Status", vm.toolsStatus || "—"],
                ["Memory Assigned", `${vm.memoryMiB} MiB (${fmtMiB(vm.memoryMiB)})`],
                ["Memory In Use", vm.memoryUsedMiB !== null ? `${vm.memoryUsedMiB} MiB (${fmtMiB(vm.memoryUsedMiB)})` : vm.toolsStatus === "RUNNING" ? "—" : "— (Tools required)"],
                ["CPUs", `${vm.cpuCount} vCPU`],
                ["CPU Usage", vm.cpuUsageMhz !== null ? `${vm.cpuUsageMhz} MHz` : vm.toolsStatus === "RUNNING" ? "— (counters needed)" : "— (Tools required)"],
                ["Storage", fmtBytes(vm.storageBytesProvisioned)],
                ["Snapshots", `${vm.snapshotCount}`],
                ...(vm.annotation ? [["Notes", vm.annotation]] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-text-muted uppercase tracking-wide text-[10px] mb-0.5">{label}</div>
                  <div className="text-text-primary font-medium break-all">{value}</div>
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap border-t border-border pt-3">
              {vm.powerState !== "POWERED_ON" && (
                <button onClick={() => handlePower("start")} disabled={!!actionLoading} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                  <Play className="w-3 h-3" />{actionLoading === "start" ? "Starting…" : "Start"}
                </button>
              )}
              {vm.powerState === "POWERED_ON" && (<>
                <button onClick={() => handlePower("shutdown")} disabled={!!actionLoading || vm.toolsStatus !== "RUNNING"} className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50" title={vm.toolsStatus !== "RUNNING" ? "Tools required for graceful shutdown" : "Graceful shutdown"}>
                  <Square className="w-3 h-3" />{actionLoading === "shutdown" ? "…" : "Shutdown"}
                </button>
                <button onClick={() => handlePower("stop")} disabled={!!actionLoading} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50" title="Hard power off">
                  <Power className="w-3 h-3" />{actionLoading === "stop" ? "…" : "Force Off"}
                </button>
                <button onClick={() => handlePower("reboot")} disabled={!!actionLoading || vm.toolsStatus !== "RUNNING"} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50" title={vm.toolsStatus !== "RUNNING" ? "Tools required for graceful reboot" : "Graceful reboot"}>
                  <RotateCcw className="w-3 h-3" />{actionLoading === "reboot" ? "…" : "Reboot"}
                </button>
                <button onClick={() => handlePower("reset")} disabled={!!actionLoading} className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted text-text-secondary disabled:opacity-50" title="Hard reset">
                  <RefreshCw className="w-3 h-3" />{actionLoading === "reset" ? "…" : "Reset"}
                </button>
                <button onClick={() => handlePower("suspend")} disabled={!!actionLoading} className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted text-text-secondary disabled:opacity-50">
                  <PauseCircle className="w-3 h-3" />{actionLoading === "suspend" ? "…" : "Suspend"}
                </button>
              </>)}
              {actionMsg && <span className={`text-xs font-medium ${actionMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{actionMsg}</span>}

              {(vm.snapshotCount > 0 || isAdmin) && (
                <button onClick={(e) => { e.stopPropagation(); handleSnapshot(); }} className={`flex items-center gap-1 px-2 py-1 text-xs border rounded ml-auto transition-colors ${
                  snapshotPanelOpen ? "bg-amber-100 border-amber-300 text-amber-800" : "border-border hover:bg-muted text-text-secondary"
                }`}>
                  <Camera className="w-3 h-3" />
                  {vm.snapshotCount > 0 ? `${vm.snapshotCount} Snapshot${vm.snapshotCount !== 1 ? "s" : ""}` : "Snapshots"}
                  <ChevronRight className={`w-3 h-3 transition-transform ${snapshotPanelOpen ? "rotate-90" : ""}`} />
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page

export default function VmwarePage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [vms, setVms] = useState<VmRecord[]>([]);
  const [hostStats, setHostStats] = useState<Record<string, VmHostStats>>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [filterPower, setFilterPower] = useState("all");
  const [filterHost, setFilterHost] = useState("all");
  const [filterOS, setFilterOS] = useState("all");

  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const savedMenuRef = useRef<HTMLDivElement>(null);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showConfig, setShowConfig] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user?.isAdmin) setIsAdmin(true); }).catch(() => {}); }, []);
  useEffect(() => { setSavedFilters(loadSavedFilters()); }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) setShowSavedMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const fetchVMs = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    const url = `/api/vmware/vms${refresh ? "?refresh=true" : ""}`;
    const res = await fetch(url).catch(() => null);
    if (!res) { setError("Network error"); setLoading(false); return; }
    if (res.status === 403) { setAccessDenied(true); setLoading(false); return; }
    if (!res.ok) { const d = await res.json(); setError(d.error || `HTTP ${res.status}`); setLoading(false); return; }
    const data = await res.json();
    setVms(data.vms ?? []);
    setHostStats(data.hostStats ?? {});
    setFetchedAt(data.fetchedAt ?? null);
    setFromCache(!!data.fromCache);
    setLoading(false);
  }, []);

  useEffect(() => { fetchVMs(); }, [fetchVMs]);

  const allHosts = useMemo(() => {
    const s = Array.from(new Set(vms.map((v) => v.host).filter((h) => h && h !== "Unknown"))).sort();
    if (vms.some((v) => !v.host || v.host === "Unknown")) s.push("Unknown");
    return s;
  }, [vms]);
  const allOS = useMemo(() => Array.from(new Set(vms.map((v) => v.guestOSDisplay).filter(Boolean))).sort(), [vms]);

  const filtered = useMemo(() => {
    let list = vms;
    if (filterPower !== "all") list = list.filter((v) => v.powerState === filterPower);
    if (filterHost !== "all") list = list.filter((v) => v.host === filterHost);
    if (filterOS !== "all") list = list.filter((v) => v.guestOSDisplay === filterOS);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q) || v.host.toLowerCase().includes(q) || v.guestOSDisplay.toLowerCase().includes(q) || v.ipAddress.toLowerCase().includes(q) || v.annotation.toLowerCase().includes(q) || v.vmId.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "host") cmp = a.host.localeCompare(b.host);
      else if (sortKey === "powerState") cmp = a.powerState.localeCompare(b.powerState);
      else if (sortKey === "guestOSDisplay") cmp = a.guestOSDisplay.localeCompare(b.guestOSDisplay);
      else if (sortKey === "toolsVersion") cmp = a.toolsVersion.localeCompare(b.toolsVersion);
      else if (sortKey === "ipAddress") cmp = a.ipAddress.localeCompare(b.ipAddress);
      else if (sortKey === "memoryMiB") cmp = a.memoryMiB - b.memoryMiB;
      else if (sortKey === "cpuCount") cmp = a.cpuCount - b.cpuCount;
      else if (sortKey === "storageBytesProvisioned") cmp = a.storageBytesProvisioned - b.storageBytesProvisioned;
      else if (sortKey === "snapshotCount") cmp = a.snapshotCount - b.snapshotCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [vms, filterPower, filterHost, filterOS, searchQ, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasActiveFilters = filterPower !== "all" || filterHost !== "all" || filterOS !== "all" || !!searchQ.trim();
  const clearFilters = () => { setFilterPower("all"); setFilterHost("all"); setFilterOS("all"); setSearchQ(""); };

  const stats = useMemo(() => {
    const hc: Record<string, number> = {}, oc: Record<string, number> = {};
    for (const vm of vms) {
      hc[vm.host || "Unknown"] = (hc[vm.host || "Unknown"] || 0) + 1;
      oc[vm.guestOSDisplay || "Unknown"] = (oc[vm.guestOSDisplay || "Unknown"] || 0) + 1;
    }
    return {
      total: vms.length,
      on: vms.filter((v) => v.powerState === "POWERED_ON").length,
      off: vms.filter((v) => v.powerState === "POWERED_OFF").length,
      suspended: vms.filter((v) => v.powerState === "SUSPENDED").length,
      withSnapshots: vms.filter((v) => v.snapshotCount > 0).length,
      byHost: Object.entries(hc).sort((a, b) => a[0].localeCompare(b[0])),
      byOS: Object.entries(oc).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [vms]);

  const handleSaveFilter = () => {
    const name = saveFilterName.trim(); if (!name) return;
    const f: SavedFilter = { id: Date.now().toString(), name, powerState: filterPower, host: filterHost, os: filterOS, q: searchQ };
    const updated = [...savedFilters, f]; setSavedFilters(updated); persistSavedFilters(updated);
    setSaveFilterName(""); setShowSaveFilter(false);
  };

  const exportCSV = useCallback(() => {
    setExporting("csv");
    const header = ["Name", "Host", "Status", "IP Address", "OS", "OS Full Name", "HW Version", "Tools Version", "Snapshots", "Memory (MB)", "Memory Used (MB)", "CPU (vCPUs)", "Storage", "Annotation"];
    const rows = filtered.map((v) => [v.name, v.host, v.powerState, v.ipAddress || "—", v.guestOSDisplay, v.guestOSFullName || "—", v.hardwareVersion || "—", v.toolsVersion || "—", v.snapshotCount, v.memoryMiB, v.memoryUsedMiB ?? "—", v.cpuCount, fmtBytes(v.storageBytesProvisioned), v.annotation || ""]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `vmware-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    setExporting(null);
  }, [filtered]);

  const exportXLSX = useCallback(() => {
    setExporting("xlsx");
    const data = filtered.map((v) => ({ "Name": v.name, "Host": v.host, "Status": v.powerState, "IP": v.ipAddress || "—", "OS": v.guestOSDisplay, "OS Full Name": v.guestOSFullName || "—", "HW Version": v.hardwareVersion || "—", "Tools Version": v.toolsVersion || "—", "Snapshots": v.snapshotCount, "Memory (MB)": v.memoryMiB, "Memory Used (MB)": v.memoryUsedMiB ?? "—", "CPU": v.cpuCount, "Storage": fmtBytes(v.storageBytesProvisioned), "Annotation": v.annotation || "" }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "VMs");
    XLSX.writeFile(wb, `vmware-${new Date().toISOString().slice(0, 10)}.xlsx`); setExporting(null);
  }, [filtered]);

  // Oversubscription color
  const oversubColor = (ratio: number) => {
    if (ratio === 0) return "";
    if (ratio < 2) return "text-green-600";
    if (ratio < 4) return "text-amber-600";
    return "text-red-600";
  };

  if (accessDenied) return (
    <div className="jp-root">
      <header className="jp-header"><button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button><Server className="w-5 h-5 text-accent" /><h1 className="text-lg font-bold text-text-primary ml-2">VMware Inventory</h1></header>
      <div className="jp-empty"><Server className="w-10 h-10 text-text-muted opacity-40 mb-3" /><p className="text-text-muted">You do not have access to the VMware Inventory module.</p></div>
    </div>
  );

  return (
    <>
      <style>{`@media print{body>*{display:none!important}.vmware-print-target{display:block!important;position:fixed;top:0;left:0;width:100%;z-index:9999;background:white;}}`}</style>
      {showExportModal && <ExportTableModal vms={filtered} onClose={() => setShowExportModal(false)} />}
      <div className="jp-root" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <header className="jp-header flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
            <Server className="w-5 h-5 text-accent flex-shrink-0" />
            <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">VMware Inventory</h1>
            {fetchedAt && <span className="text-xs text-text-muted hidden sm:block">{fromCache ? "📦 Cached: " : "Updated: "}{fmtTime(fetchedAt)}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" /><input type="text" className="oc-search" placeholder="Search VMs…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} /></div>
            <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary" value={filterPower} onChange={(e) => setFilterPower(e.target.value)}><option value="all">All States</option><option value="POWERED_ON">On</option><option value="POWERED_OFF">Off</option><option value="SUSPENDED">Suspended</option></select>
            {allHosts.length > 0 && <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[160px]" value={filterHost} onChange={(e) => setFilterHost(e.target.value)}><option value="all">All Hosts</option>{allHosts.map((h) => <option key={h} value={h}>{h}</option>)}</select>}
            {allOS.length > 0 && <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[180px]" value={filterOS} onChange={(e) => setFilterOS(e.target.value)}><option value="all">All OS</option>{allOS.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
            {hasActiveFilters && <button onClick={clearFilters} className="jp-action-btn"><X className="w-3.5 h-3.5" /> Clear</button>}
            <div className="relative" ref={savedMenuRef}>
              <button className={`jp-action-btn ${showSavedMenu ? "jp-action-btn--primary" : ""}`} onClick={() => setShowSavedMenu((v) => !v)}><Bookmark className="w-3.5 h-3.5" />{savedFilters.length > 0 && <span className="text-xs">{savedFilters.length}</span>}</button>
              {showSavedMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[230px]">
                  <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase">Saved Filters</div>
                  {savedFilters.length === 0 && <div className="px-3 py-2 text-xs text-text-muted">No saved filters</div>}
                  {savedFilters.map((f) => (
                    <div key={f.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted group">
                      <button className="flex-1 text-left text-sm text-text-primary truncate" onClick={() => { setFilterPower(f.powerState); setFilterHost(f.host); setFilterOS(f.os); setSearchQ(f.q); setShowSavedMenu(false); }}>{f.name}</button>
                      <button onClick={() => { const u = savedFilters.filter((x) => x.id !== f.id); setSavedFilters(u); persistSavedFilters(u); }} className="p-1 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <div className="border-t border-border mt-1 px-2 pt-1 pb-1">
                    {showSaveFilter ? (
                      <div className="flex gap-1 mt-0.5">
                        <input autoFocus type="text" className="flex-1 px-2 py-1 text-xs border border-border rounded-lg bg-surface-alt text-text-primary focus:outline-none focus:border-accent" placeholder="Filter name…" value={saveFilterName} onChange={(e) => setSaveFilterName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveFilter(); if (e.key === "Escape") setShowSaveFilter(false); }} />
                        <button onClick={handleSaveFilter} disabled={!saveFilterName.trim()} className="p-1.5 bg-accent text-white rounded disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setShowSaveFilter(false)} className="p-1.5 text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setShowSaveFilter(true)} disabled={!hasActiveFilters} className="w-full text-left text-xs text-accent hover:underline flex items-center gap-1 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"><BookmarkCheck className="w-3.5 h-3.5" /> Save current filter…</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className="jp-action-btn" onClick={() => fetchVMs(true)} disabled={loading} title="Refresh from vCenter (bypass cache)"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />{!loading && "Refresh"}</button>
            <div className="flex items-center gap-1">
              <button className="jp-action-btn" onClick={exportCSV} disabled={!!exporting || filtered.length === 0}><Download className="w-3.5 h-3.5" /> CSV</button>
              <button className="jp-action-btn" onClick={exportXLSX} disabled={!!exporting || filtered.length === 0}><Download className="w-3.5 h-3.5" /> XLS</button>
              <button className="jp-action-btn" onClick={() => { setExporting("pdf"); window.print(); setExporting(null); }} disabled={!!exporting || filtered.length === 0}><Download className="w-3.5 h-3.5" /> PDF</button>
              <button className="jp-action-btn" onClick={() => setShowExportModal(true)} disabled={filtered.length === 0}><Database className="w-3.5 h-3.5" /> Save as Table</button>
            </div>
            {isAdmin && <button className={`jp-action-btn ${showConfig ? "jp-action-btn--primary" : ""}`} onClick={() => setShowConfig((v) => !v)}><Settings className="w-4 h-4" /></button>}
          </div>
        </header>

        <div className="jp-main flex-1 overflow-hidden">
          <aside className="jp-sidebar overflow-y-auto">
            {!loading && vms.length > 0 && (
              <>
                <div className="jp-section">
                  <h3 className="jp-section-title">Summary</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-text-muted"><span>Total VMs</span><span className="font-medium text-text-primary">{stats.total}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-green-600">Powered On</span><span className="font-medium text-green-700">{stats.on}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-red-600">Powered Off</span><span className="font-medium text-red-700">{stats.off}</span></div>
                    {stats.suspended > 0 && <div className="flex justify-between text-xs"><span className="text-amber-600">Suspended</span><span className="font-medium text-amber-700">{stats.suspended}</span></div>}
                    {stats.withSnapshots > 0 && <div className="flex justify-between text-xs"><span className="text-amber-700">With Snapshots</span><span className="font-medium text-amber-700">{stats.withSnapshots}</span></div>}
                  </div>
                </div>
                {stats.byHost.length > 0 && (
                  <div className="jp-section">
                    <h3 className="jp-section-title">By Host</h3>
                    <div className="space-y-1">
                      {stats.byHost.map(([host, count]) => {
                        const hs = hostStats[host];
                        const ratio = hs?.ratio ?? 0;
                        return (
                          <div key={host} className="flex justify-between items-center text-xs text-text-muted">
                            <div className="min-w-0 flex-1">
                              <button className={`truncate pr-1 text-left hover:text-accent transition-colors ${filterHost === host ? "text-accent font-medium" : "text-text-secondary"}`} title={host} onClick={() => setFilterHost(filterHost === host ? "all" : host)}>
                                {filterHost === host && "▶ "}{host}
                              </button>
                              {hs && hs.physicalCpuCores > 0 && (
                                <div className={`text-[10px] ${oversubColor(ratio)}`} title={`${hs.allocatedVcpus} vCPUs / ${hs.physicalCpuCores} cores = ${ratio.toFixed(1)}x`}>
                                  {hs.allocatedVcpus}v / {hs.physicalCpuCores}c = {ratio.toFixed(1)}x
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-text-primary flex-shrink-0 ml-1">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {stats.byOS.length > 0 && (
                  <div className="jp-section">
                    <h3 className="jp-section-title">By OS</h3>
                    <div className="space-y-1">
                      {stats.byOS.map(([os, count]) => (
                        <div key={os} className="flex justify-between items-center text-xs text-text-muted">
                          <button className={`truncate pr-2 text-left hover:text-accent transition-colors ${filterOS === os ? "text-accent font-medium" : "text-text-secondary"}`} title={os} onClick={() => setFilterOS(filterOS === os ? "all" : os)}>
                            {filterOS === os && "▶ "}{os}
                          </button>
                          <span className="font-medium text-text-primary flex-shrink-0">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>

          <main className="jp-content overflow-auto">
            {loading ? (
              <div className="jp-empty"><RefreshCw className="w-8 h-8 text-text-muted animate-spin mb-3" /><p className="text-text-muted">Connecting to vCenter…</p></div>
            ) : error ? (
              <div className="jp-empty">
                <Server className="w-10 h-10 text-text-muted opacity-40 mb-3" />
                <p className="text-text-muted font-medium mb-1">Could not load inventory</p>
                <p className="text-xs text-text-muted max-w-xs text-center">{error}</p>
                {isAdmin && <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowConfig(true)}><Settings className="w-4 h-4" /> Configure vCenter</button>}
              </div>
            ) : filtered.length === 0 ? (
              <div className="jp-empty">
                <Server className="w-10 h-10 text-text-muted opacity-40 mb-3" />
                <p className="text-text-muted">{vms.length === 0 ? "No VMs found" : "No VMs match filters"}</p>
                {hasActiveFilters && <button className="jp-action-btn mt-3" onClick={clearFilters}><X className="w-3.5 h-3.5" /> Clear filters</button>}
              </div>
            ) : (
              <div className="cl-table-wrap vmware-print-target" ref={printRef}>
                <table className="cl-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("name")} className="cl-th cl-th--sort">Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("host")} className="cl-th cl-th--sort">Host <SortIcon col="host" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("powerState")} className="cl-th cl-th--sort">Status <SortIcon col="powerState" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("guestOSDisplay")} className="cl-th cl-th--sort">OS <SortIcon col="guestOSDisplay" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("ipAddress")} className="cl-th cl-th--sort">IP <SortIcon col="ipAddress" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("toolsVersion")} className="cl-th cl-th--sort">Tools <SortIcon col="toolsVersion" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("memoryMiB")} className="cl-th cl-th--sort">Memory <SortIcon col="memoryMiB" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("cpuCount")} className="cl-th cl-th--sort">CPU <SortIcon col="cpuCount" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("storageBytesProvisioned")} className="cl-th cl-th--sort">Storage <SortIcon col="storageBytesProvisioned" sortKey={sortKey} sortDir={sortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((vm) => (
                      <VmRow key={vm.vmId} vm={vm} isAdmin={isAdmin}
                        onFilterHost={(h) => setFilterHost((p) => p === h ? "all" : h)}
                        onFilterOS={(os) => setFilterOS((p) => p === os ? "all" : os)}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="cl-table-count">
                  {filtered.length} {filtered.length === 1 ? "VM" : "VMs"}
                  {filtered.length < vms.length && ` (filtered from ${vms.length})`}
                  {stats.off > 0 && <span className="ml-2 text-red-500">· {stats.off} powered off</span>}
                  {stats.withSnapshots > 0 && <span className="ml-2 text-amber-600">· {stats.withSnapshots} with snapshots</span>}
                </div>
              </div>
            )}
          </main>

          {showConfig && isAdmin && <ConfigPanel onClose={() => setShowConfig(false)} onSaved={() => fetchVMs(true)} />}
        </div>
      </div>
    </>
  );
}
