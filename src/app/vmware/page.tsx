"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Server, RefreshCw, Search, Download, Settings,
  ChevronUp, ChevronDown, X, Check, Plus, Trash2, Eye, EyeOff,
  Bookmark, BookmarkCheck, Database,
} from "lucide-react";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type VmPowerState = "POWERED_ON" | "POWERED_OFF" | "SUSPENDED";

interface VmRecord {
  vmId: string;
  name: string;
  powerState: VmPowerState;
  host: string;
  guestOS: string;
  guestOSDisplay: string;
  guestOSFullName: string;
  toolsVersion: string;
  toolsStatus: string;
  memoryMiB: number;
  memoryUsedMiB: number | null;
  cpuCount: number;
  cpuUsageMhz: number | null;
  storageBytesProvisioned: number;
}

interface SavedFilter {
  id: string;
  name: string;
  powerState: string;
  host: string;
  os: string;
  q: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_024).toFixed(1)} KB`;
}

function fmtMiB(mib: number): string {
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GB`;
  return `${mib} MB`;
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// Cross-browser UUID generator (crypto.randomUUID not available in all browsers)
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function") {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const LS_FILTERS_KEY = "docit-vmware-saved-filters";
function loadSavedFilters(): SavedFilter[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(LS_FILTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistSavedFilters(filters: SavedFilter[]): void {
  try { localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(filters)); } catch {}
}

// ── Power badge ───────────────────────────────────────────────────────────────

function PowerBadge({ state }: { state: VmPowerState }) {
  const cls: Record<VmPowerState, string> = {
    POWERED_ON: "bg-green-100 text-green-800 border-green-300",
    POWERED_OFF: "bg-red-100 text-red-800 border-red-300",
    SUSPENDED: "bg-amber-100 text-amber-800 border-amber-300",
  };
  const dot: Record<VmPowerState, string> = {
    POWERED_ON: "bg-green-500", POWERED_OFF: "bg-red-500", SUSPENDED: "bg-amber-500",
  };
  const label: Record<VmPowerState, string> = {
    POWERED_ON: "On", POWERED_OFF: "Off", SUSPENDED: "Suspended",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${cls[state] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot[state] ?? "bg-gray-400"}`} />
      {label[state] ?? state}
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

type SortKey = "name" | "host" | "powerState" | "guestOSDisplay" | "toolsVersion" | "memoryMiB" | "cpuCount" | "storageBytesProvisioned";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return null;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
}

// ── Config panel ──────────────────────────────────────────────────────────────

interface VmwareCfgForm {
  enabled: boolean; vcenterUrl: string; username: string; password: string;
  passwordSet: boolean; ignoreSslErrors: boolean; allowedUsers: string[];
}
const EMPTY_CFG: VmwareCfgForm = {
  enabled: false, vcenterUrl: "", username: "", password: "", passwordSet: false,
  ignoreSslErrors: false, allowedUsers: [],
};

function ConfigPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VmwareCfgForm>(EMPTY_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [newUser, setNewUser] = useState("");

  useEffect(() => {
    fetch("/api/vmware/config").then((r) => r.json()).then((d) => {
      if (!d.error) setForm({
        enabled: !!d.enabled, vcenterUrl: d.vcenterUrl || "", username: d.username || "",
        password: "", passwordSet: !!d.passwordSet, ignoreSslErrors: !!d.ignoreSslErrors,
        allowedUsers: Array.isArray(d.allowedUsers) ? d.allowedUsers : [],
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveError("");
    const body: Record<string, unknown> = {
      enabled: form.enabled, vcenterUrl: form.vcenterUrl.trim(),
      username: form.username.trim(), ignoreSslErrors: form.ignoreSslErrors,
      allowedUsers: form.allowedUsers,
    };
    if (form.password) body.password = form.password;
    const res = await fetch("/api/vmware/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json(); setSaveError(d.error || "Failed to save"); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    const res = await fetch("/api/vmware/vms").catch(() => null);
    if (res?.ok) { const d = await res.json(); setTestResult({ ok: true, message: `Connection OK — ${d.vms?.length ?? 0} VMs` }); }
    else { const d = await res?.json().catch(() => ({})); setTestResult({ ok: false, message: d?.error || "Connection failed" }); }
    setTesting(false);
  };

  const addUser = () => {
    const u = newUser.trim();
    if (u && !form.allowedUsers.includes(u)) setForm((f) => ({ ...f, allowedUsers: [...f.allowedUsers, u] }));
    setNewUser("");
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
        {[
          { label: "vCenter URL", key: "vcenterUrl" as const, type: "url", ph: "https://vcenter.example.com" },
          { label: "Username", key: "username" as const, type: "text", ph: "administrator@vsphere.local" },
        ].map(({ label, key, type, ph }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
            <input type={type} className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder={ph} value={form[key] as string} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Password {form.passwordSet && !form.password && <span className="text-green-600">(set)</span>}</label>
          <div className="relative">
            <input type={showPwd ? "text" : "password"} className="w-full px-3 py-1.5 pr-9 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder={form.passwordSet ? "Leave blank to keep current" : "Enter password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary" onClick={() => setShowPwd((v) => !v)}>
              {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
          <input type="checkbox" checked={form.ignoreSslErrors} onChange={(e) => setForm((f) => ({ ...f, ignoreSslErrors: e.target.checked }))} className="rounded border-border" />
          Ignore SSL errors (self-signed certs)
        </label>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Allowed Users</label>
          <p className="text-xs text-text-muted mb-2">Admins always have access. Others must be listed here.</p>
          <div className="flex gap-2 mb-2">
            <input type="text" className="flex-1 px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" placeholder="username" value={newUser} onChange={(e) => setNewUser(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addUser(); }} />
            <button onClick={addUser} className="px-2 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/90"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1">
            {form.allowedUsers.map((u) => (
              <div key={u} className="flex items-center justify-between px-2 py-1 rounded bg-surface-alt text-sm text-text-primary">
                <span>{u}</span>
                <button onClick={() => setForm((f) => ({ ...f, allowedUsers: f.allowedUsers.filter((x) => x !== u) }))} className="text-text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        {testResult && <div className={`text-xs px-3 py-2 rounded-lg border ${testResult.ok ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}`}>{testResult.message}</div>}
        {saveError && <div className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-800">{saveError}</div>}
      </div>
      <div className="flex-shrink-0 px-4 py-3 border-t border-border flex gap-2">
        <button onClick={handleTest} disabled={testing} className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary disabled:opacity-50">{testing ? "Testing…" : "Test Connection"}</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-1.5">{saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Save</>}</button>
      </div>
    </div>
  );
}

// ── Export to Enhanced Table Modal ────────────────────────────────────────────

function ExportTableModal({ vms, onClose }: { vms: VmRecord[]; onClose: () => void }) {
  const router = useRouter();
  const [spaces, setSpaces] = useState<{ slug: string; name: string }[]>([]);
  const [spaceSlug, setSpaceSlug] = useState("");
  const [tableTitle, setTableTitle] = useState(() => {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return `VMware Inventory ${date} ${time}`;
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/spaces").then((r) => r.json()).then((data: { slug: string; name: string }[]) => {
      setSpaces(Array.isArray(data) ? data : []);
      if (data.length > 0) setSpaceSlug(data[0].slug);
    }).catch(() => {});
  }, []);

  const handleExport = async () => {
    if (!spaceSlug || !tableTitle.trim()) return;
    setExporting(true); setError("");
    try {
      // Step 1: create table with column definitions
      const columns = [
        { name: "VM Name", type: "text", width: 220 },
        { name: "Host", type: "text", width: 160 },
        { name: "Status", type: "select", options: ["POWERED_ON", "POWERED_OFF", "SUSPENDED"], width: 120 },
        { name: "OS", type: "text", width: 180 },
        { name: "OS Full Name", type: "text", width: 200 },
        { name: "Tools Version", type: "text", width: 120 },
        { name: "Memory (MB)", type: "number", width: 120 },
        { name: "CPU (vCPUs)", type: "number", width: 100 },
        { name: "Storage Provisioned", type: "text", width: 140 },
        { name: "VM ID", type: "text", width: 140 },
      ];
      const createRes = await fetch(`/api/spaces/${spaceSlug}/enhanced-tables`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tableTitle.trim(), columns }),
      });
      if (!createRes.ok) { const d = await createRes.json(); setError(d.error || `HTTP ${createRes.status}`); setExporting(false); return; }

      const db = await createRes.json();
      const dbId: string = db.id;
      const colMap: Record<string, string> = {};
      for (const col of db.columns as { id: string; name: string }[]) colMap[col.name] = col.id;

      // Step 2: populate rows via PUT (replaces the 3 empty placeholder rows)
      const rows = vms.map((vm) => ({
        id: uuid(),
        cells: {
          [colMap["VM Name"]]: vm.name,
          [colMap["Host"]]: vm.host,
          [colMap["Status"]]: vm.powerState,
          [colMap["OS"]]: vm.guestOSDisplay,
          [colMap["OS Full Name"]]: vm.guestOSFullName || vm.guestOSDisplay,
          [colMap["Tools Version"]]: vm.toolsVersion || "—",
          [colMap["Memory (MB)"]]: vm.memoryMiB,
          [colMap["CPU (vCPUs)"]]: vm.cpuCount,
          [colMap["Storage Provisioned"]]: fmtBytes(vm.storageBytesProvisioned),
          [colMap["VM ID"]]: vm.vmId,
        },
        createdAt: new Date().toISOString(),
      }));
      const updateRes = await fetch(`/api/spaces/${spaceSlug}/enhanced-tables/${dbId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      if (!updateRes.ok) { const d = await updateRes.json(); setError(d.error || "Failed to populate table"); setExporting(false); return; }

      onClose();
      router.push("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); setExporting(false); }
  };

  const colNames = ["VM Name", "Host", "Status", "OS", "OS Full Name", "Tools Version", "Memory (MB)", "CPU (vCPUs)", "Storage Provisioned", "VM ID"];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Database className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Export to Enhanced Table</span></div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-text-muted">
            Creates a new enhanced table in the selected space with{" "}
            <span className="font-semibold text-text-primary">{vms.length} VM{vms.length !== 1 ? "s" : ""}</span>{" "}
            (current filtered results). Embed it in any document.
          </p>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Space</label>
            <select className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" value={spaceSlug} onChange={(e) => setSpaceSlug(e.target.value)}>
              {spaces.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              {spaces.length === 0 && <option value="">No spaces available</option>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Table Name</label>
            <input type="text" className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" value={tableTitle} onChange={(e) => setTableTitle(e.target.value)} placeholder="VMware Inventory" />
          </div>
          <div className="bg-surface-alt border border-border rounded-lg px-3 py-2">
            <p className="text-xs font-medium text-text-secondary mb-1.5">Columns:</p>
            <div className="flex flex-wrap gap-1">
              {colNames.map((col) => <span key={col} className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded">{col}</span>)}
            </div>
          </div>
          {error && <div className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-800">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary">Cancel</button>
          <button onClick={handleExport} disabled={exporting || !spaceSlug || !tableTitle.trim()} className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5">
            {exporting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><Database className="w-3.5 h-3.5" /> Create Table</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── VM Row ────────────────────────────────────────────────────────────────────

function VmRow({ vm, onFilterHost, onFilterOS }: {
  vm: VmRecord;
  onFilterHost: (h: string) => void;
  onFilterOS: (os: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="cl-tr cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="cl-td font-medium text-text-primary">
          <div className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />{vm.name}</div>
        </td>
        <td className="cl-td">
          {vm.host && vm.host !== "Unknown" ? (
            <button className="text-text-secondary hover:text-accent text-xs" onClick={(e) => { e.stopPropagation(); onFilterHost(vm.host); }} title={`Filter: ${vm.host}`}>{vm.host}</button>
          ) : <span className="text-text-muted text-xs">—</span>}
        </td>
        <td className="cl-td"><PowerBadge state={vm.powerState} /></td>
        <td className="cl-td">
          <button className="text-text-secondary hover:text-accent text-xs text-left" onClick={(e) => { e.stopPropagation(); onFilterOS(vm.guestOSDisplay); }} title={`Filter: ${vm.guestOSDisplay}`}>
            {vm.guestOSDisplay || "—"}
          </button>
        </td>
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
      {expanded && (
        <tr className="bg-surface-alt border-b border-border">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
              {[
                ["VM ID", vm.vmId],
                ["Power State", vm.powerState],
                ["Host", vm.host || "—"],
                ["OS (category)", vm.guestOSDisplay || "—"],
                ["OS (full name)", vm.guestOSFullName || "—"],
                ["OS (enum)", vm.guestOS || "—"],
                ["Tools Version", vm.toolsVersion || "Not installed"],
                ["Tools Status", vm.toolsStatus || "—"],
                ["Memory Assigned", `${vm.memoryMiB} MiB (${fmtMiB(vm.memoryMiB)})`],
                ["Memory In Use", vm.memoryUsedMiB !== null ? `${vm.memoryUsedMiB} MiB (${fmtMiB(vm.memoryUsedMiB)})` : "— (Tools required)"],
                ["CPUs", `${vm.cpuCount} vCPU`],
                ["CPU Usage", vm.cpuUsageMhz !== null ? `${vm.cpuUsageMhz} MHz` : "— (Tools required)"],
                ["Storage Provisioned", fmtBytes(vm.storageBytesProvisioned)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-text-muted uppercase tracking-wide text-[10px] mb-0.5">{label}</div>
                  <div className="text-text-primary font-medium break-all">{value}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VmwarePage() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [vms, setVms] = useState<VmRecord[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Filters
  const [searchQ, setSearchQ] = useState("");
  const [filterPower, setFilterPower] = useState("all");
  const [filterHost, setFilterHost] = useState("all");
  const [filterOS, setFilterOS] = useState("all");

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const savedMenuRef = useRef<HTMLDivElement>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Panels
  const [showConfig, setShowConfig] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user?.isAdmin) setIsAdmin(true); }).catch(() => {});
  }, []);

  useEffect(() => { setSavedFilters(loadSavedFilters()); }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) setShowSavedMenu(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const fetchVMs = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await fetch("/api/vmware/vms").catch(() => null);
    if (!res) { setError("Network error"); setLoading(false); return; }
    if (res.status === 403) { setAccessDenied(true); setLoading(false); return; }
    if (!res.ok) { const d = await res.json(); setError(d.error || `HTTP ${res.status}`); setLoading(false); return; }
    const data = await res.json();
    setVms(data.vms ?? []);
    setFetchedAt(data.fetchedAt ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchVMs(); }, [fetchVMs]);

  const allHosts = useMemo(() => {
    const s = Array.from(new Set(vms.map((v) => v.host).filter((h) => h && h !== "Unknown"))).sort();
    if (vms.some((v) => !v.host || v.host === "Unknown")) s.push("Unknown");
    return s;
  }, [vms]);

  const allOS = useMemo(() =>
    Array.from(new Set(vms.map((v) => v.guestOSDisplay).filter(Boolean))).sort()
  , [vms]);

  const filtered = useMemo(() => {
    let list = vms;
    if (filterPower !== "all") list = list.filter((v) => v.powerState === filterPower);
    if (filterHost !== "all") list = list.filter((v) => v.host === filterHost);
    if (filterOS !== "all") list = list.filter((v) => v.guestOSDisplay === filterOS);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((v) =>
        v.name.toLowerCase().includes(q) || v.host.toLowerCase().includes(q) ||
        v.guestOSDisplay.toLowerCase().includes(q) || v.guestOSFullName.toLowerCase().includes(q) ||
        v.toolsVersion.toLowerCase().includes(q) || v.vmId.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "host") cmp = a.host.localeCompare(b.host);
      else if (sortKey === "powerState") cmp = a.powerState.localeCompare(b.powerState);
      else if (sortKey === "guestOSDisplay") cmp = a.guestOSDisplay.localeCompare(b.guestOSDisplay);
      else if (sortKey === "toolsVersion") cmp = a.toolsVersion.localeCompare(b.toolsVersion);
      else if (sortKey === "memoryMiB") cmp = a.memoryMiB - b.memoryMiB;
      else if (sortKey === "cpuCount") cmp = a.cpuCount - b.cpuCount;
      else if (sortKey === "storageBytesProvisioned") cmp = a.storageBytesProvisioned - b.storageBytesProvisioned;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [vms, filterPower, filterHost, filterOS, searchQ, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasActiveFilters = filterPower !== "all" || filterHost !== "all" || filterOS !== "all" || !!searchQ.trim();
  const clearFilters = () => { setFilterPower("all"); setFilterHost("all"); setFilterOS("all"); setSearchQ(""); };

  // Sidebar summary with proper aggregation
  const stats = useMemo(() => {
    const hostCounts: Record<string, number> = {};
    const osCounts: Record<string, number> = {};
    for (const vm of vms) {
      const h = vm.host || "Unknown";
      hostCounts[h] = (hostCounts[h] || 0) + 1;
      const os = vm.guestOSDisplay || "Unknown";
      osCounts[os] = (osCounts[os] || 0) + 1;
    }
    return {
      total: vms.length,
      on: vms.filter((v) => v.powerState === "POWERED_ON").length,
      off: vms.filter((v) => v.powerState === "POWERED_OFF").length,
      suspended: vms.filter((v) => v.powerState === "SUSPENDED").length,
      byHost: Object.entries(hostCounts).sort((a, b) => b[1] - a[1]),
      byOS: Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  }, [vms]);

  // Saved filter management
  const handleSaveFilter = () => {
    const name = saveFilterName.trim();
    if (!name) return;
    const f: SavedFilter = { id: Date.now().toString(), name, powerState: filterPower, host: filterHost, os: filterOS, q: searchQ };
    const updated = [...savedFilters, f];
    setSavedFilters(updated);
    persistSavedFilters(updated);
    setSaveFilterName(""); setShowSaveFilter(false);
  };

  const deleteSavedFilter = (id: string) => {
    const updated = savedFilters.filter((f) => f.id !== id);
    setSavedFilters(updated);
    persistSavedFilters(updated);
  };

  const applySavedFilter = (f: SavedFilter) => {
    setFilterPower(f.powerState); setFilterHost(f.host); setFilterOS(f.os); setSearchQ(f.q);
    setShowSavedMenu(false);
  };

  // Exports
  const exportCSV = useCallback(() => {
    setExporting("csv");
    const header = ["Name", "Host", "Status", "OS", "OS Full Name", "Tools Version", "Memory (MB)", "Memory Used (MB)", "CPU (vCPUs)", "CPU Usage (MHz)", "Storage"];
    const rows = filtered.map((v) => [v.name, v.host, v.powerState, v.guestOSDisplay, v.guestOSFullName || "—", v.toolsVersion || "—", v.memoryMiB, v.memoryUsedMiB ?? "—", v.cpuCount, v.cpuUsageMhz ?? "—", fmtBytes(v.storageBytesProvisioned)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `vmware-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }, [filtered]);

  const exportXLSX = useCallback(() => {
    setExporting("xlsx");
    const data = filtered.map((v) => ({
      "Name": v.name, "Host": v.host, "Status": v.powerState,
      "OS": v.guestOSDisplay, "OS Full Name": v.guestOSFullName || "—",
      "Tools Version": v.toolsVersion || "—", "Memory (MB)": v.memoryMiB,
      "Memory Used (MB)": v.memoryUsedMiB ?? "—", "CPU (vCPUs)": v.cpuCount,
      "CPU Usage (MHz)": v.cpuUsageMhz ?? "—", "Storage": fmtBytes(v.storageBytesProvisioned),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "VMs");
    XLSX.writeFile(wb, `vmware-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(null);
  }, [filtered]);

  // ── Access denied ──────────────────────────────────────────────────────────

  if (accessDenied) {
    return (
      <div className="jp-root">
        <header className="jp-header">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Server className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary ml-2">VMware Inventory</h1>
        </header>
        <div className="jp-empty">
          <Server className="w-10 h-10 text-text-muted opacity-40 mb-3" />
          <p className="text-text-muted">You do not have access to the VMware Inventory module.</p>
          <p className="text-xs text-text-muted mt-1">Contact an administrator to be added to the allowed users list.</p>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@media print{body>*{display:none!important}.vmware-print-target{display:block!important;position:fixed;top:0;left:0;width:100%;z-index:9999;background:white;}}`}</style>

      {showExportModal && <ExportTableModal vms={filtered} onClose={() => setShowExportModal(false)} />}

      <div className="jp-root" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Header */}
        <header className="jp-header flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
            <Server className="w-5 h-5 text-accent flex-shrink-0" />
            <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">VMware Inventory</h1>
            {fetchedAt && <span className="text-xs text-text-muted hidden sm:block">Updated: {fmtTime(fetchedAt)}</span>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input type="text" className="oc-search" placeholder="Search VMs…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            </div>

            {/* Power state filter */}
            <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary" value={filterPower} onChange={(e) => setFilterPower(e.target.value)}>
              <option value="all">All States</option>
              <option value="POWERED_ON">On</option>
              <option value="POWERED_OFF">Off</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            {/* Host filter */}
            {allHosts.length > 0 && (
              <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[160px]" value={filterHost} onChange={(e) => setFilterHost(e.target.value)}>
                <option value="all">All Hosts</option>
                {allHosts.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            )}

            {/* OS filter */}
            {allOS.length > 0 && (
              <select className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[180px]" value={filterOS} onChange={(e) => setFilterOS(e.target.value)}>
                <option value="all">All OS</option>
                {allOS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="jp-action-btn" title="Clear all filters"><X className="w-3.5 h-3.5" /> Clear</button>
            )}

            {/* Saved filters */}
            <div className="relative" ref={savedMenuRef}>
              <button className={`jp-action-btn ${showSavedMenu ? "jp-action-btn--primary" : ""}`} onClick={() => setShowSavedMenu((v) => !v)} title="Saved filter presets">
                <Bookmark className="w-3.5 h-3.5" />
                {savedFilters.length > 0 && <span className="text-xs">{savedFilters.length}</span>}
              </button>
              {showSavedMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[230px]">
                  <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Saved Filters</div>
                  {savedFilters.length === 0 && <div className="px-3 py-2 text-xs text-text-muted">No saved filters yet</div>}
                  {savedFilters.map((f) => (
                    <div key={f.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted group">
                      <button className="flex-1 text-left text-sm text-text-primary truncate" onClick={() => applySavedFilter(f)}>{f.name}</button>
                      <button onClick={() => deleteSavedFilter(f.id)} className="p-1 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
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
                      <button onClick={() => setShowSaveFilter(true)} disabled={!hasActiveFilters} className="w-full text-left text-xs text-accent hover:underline flex items-center gap-1 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed">
                        <BookmarkCheck className="w-3.5 h-3.5" /> Save current filter…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Refresh */}
            <button className="jp-action-btn" onClick={fetchVMs} disabled={loading} title="Refresh from vCenter">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {!loading && "Refresh"}
            </button>

            {/* Export buttons */}
            <div className="flex items-center gap-1">
              <button className="jp-action-btn" onClick={exportCSV} disabled={!!exporting || filtered.length === 0} title="Export CSV"><Download className="w-3.5 h-3.5" /> CSV</button>
              <button className="jp-action-btn" onClick={exportXLSX} disabled={!!exporting || filtered.length === 0} title="Export XLS"><Download className="w-3.5 h-3.5" /> XLS</button>
              <button className="jp-action-btn" onClick={() => { setExporting("pdf"); window.print(); setExporting(null); }} disabled={!!exporting || filtered.length === 0} title="Print / PDF"><Download className="w-3.5 h-3.5" /> PDF</button>
              <button className="jp-action-btn" onClick={() => setShowExportModal(true)} disabled={filtered.length === 0} title="Save as enhanced table in a space"><Database className="w-3.5 h-3.5" /> Save as Table</button>
            </div>

            {/* Settings (admin only) */}
            {isAdmin && (
              <button className={`jp-action-btn ${showConfig ? "jp-action-btn--primary" : ""}`} onClick={() => setShowConfig((v) => !v)} title="vCenter settings"><Settings className="w-4 h-4" /></button>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="jp-main flex-1 overflow-hidden">
          {/* Left sidebar */}
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
                  </div>
                </div>

                {stats.byHost.length > 0 && (
                  <div className="jp-section">
                    <h3 className="jp-section-title">By Host</h3>
                    <div className="space-y-1">
                      {stats.byHost.map(([host, count]) => (
                        <div key={host} className="flex justify-between items-center text-xs text-text-muted">
                          <button className={`truncate pr-2 text-left hover:text-accent transition-colors ${filterHost === host ? "text-accent font-medium" : "text-text-secondary"}`} title={host} onClick={() => setFilterHost(filterHost === host ? "all" : host)}>
                            {filterHost === host && "▶ "}{host}
                          </button>
                          <span className="font-medium text-text-primary flex-shrink-0">{count}</span>
                        </div>
                      ))}
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

          {/* Main table */}
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
                <p className="text-text-muted">{vms.length === 0 ? "No VMs found" : "No VMs match the current filters"}</p>
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
                      <th onClick={() => toggleSort("toolsVersion")} className="cl-th cl-th--sort">Tools Ver. <SortIcon col="toolsVersion" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("memoryMiB")} className="cl-th cl-th--sort">Memory <SortIcon col="memoryMiB" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("cpuCount")} className="cl-th cl-th--sort">CPU <SortIcon col="cpuCount" sortKey={sortKey} sortDir={sortDir} /></th>
                      <th onClick={() => toggleSort("storageBytesProvisioned")} className="cl-th cl-th--sort">Storage <SortIcon col="storageBytesProvisioned" sortKey={sortKey} sortDir={sortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((vm) => (
                      <VmRow key={vm.vmId} vm={vm} onFilterHost={(h) => setFilterHost((prev) => prev === h ? "all" : h)} onFilterOS={(os) => setFilterOS((prev) => prev === os ? "all" : os)} />
                    ))}
                  </tbody>
                </table>
                <div className="cl-table-count">
                  {filtered.length} {filtered.length === 1 ? "VM" : "VMs"}
                  {filtered.length < vms.length && ` (filtered from ${vms.length})`}
                </div>
              </div>
            )}
          </main>

          {/* Config panel (right drawer) */}
          {showConfig && isAdmin && <ConfigPanel onClose={() => setShowConfig(false)} onSaved={() => fetchVMs()} />}
        </div>
      </div>
    </>
  );
}
