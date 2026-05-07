"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Server,
  RefreshCw,
  Search,
  Download,
  Settings,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import * as XLSX from "xlsx";

// ── Types (matching lib/vmware.ts) ────────────────────────────────────────────

type VmPowerState = "POWERED_ON" | "POWERED_OFF" | "SUSPENDED";

interface VmRecord {
  vmId: string;
  name: string;
  powerState: VmPowerState;
  host: string;
  guestOS: string;
  guestOSDisplay: string;
  toolsVersion: string;
  toolsStatus: string;
  memoryMiB: number;
  memoryUsedMiB: number | null;
  cpuCount: number;
  cpuUsageMhz: number | null;
  storageBytesProvisioned: number;
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
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Power state badge ─────────────────────────────────────────────────────────

function PowerBadge({ state }: { state: VmPowerState }) {
  const styles: Record<VmPowerState, string> = {
    POWERED_ON: "bg-green-100 text-green-800 border-green-300",
    POWERED_OFF: "bg-red-100 text-red-800 border-red-300",
    SUSPENDED: "bg-amber-100 text-amber-800 border-amber-300",
  };
  const labels: Record<VmPowerState, string> = {
    POWERED_ON: "On",
    POWERED_OFF: "Off",
    SUSPENDED: "Suspended",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${styles[state] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${state === "POWERED_ON" ? "bg-green-500" : state === "SUSPENDED" ? "bg-amber-500" : "bg-red-500"}`} />
      {labels[state] ?? state}
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

interface VmwareConfigForm {
  enabled: boolean;
  vcenterUrl: string;
  username: string;
  password: string;
  passwordSet: boolean;
  ignoreSslErrors: boolean;
  allowedUsers: string[];
}

const EMPTY_CONFIG: VmwareConfigForm = {
  enabled: false,
  vcenterUrl: "",
  username: "",
  password: "",
  passwordSet: false,
  ignoreSslErrors: false,
  allowedUsers: [],
};

function ConfigPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<VmwareConfigForm>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newUser, setNewUser] = useState("");

  useEffect(() => {
    fetch("/api/vmware/config")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setForm({
            enabled: !!d.enabled,
            vcenterUrl: d.vcenterUrl || "",
            username: d.username || "",
            password: "",
            passwordSet: !!d.passwordSet,
            ignoreSslErrors: !!d.ignoreSslErrors,
            allowedUsers: Array.isArray(d.allowedUsers) ? d.allowedUsers : [],
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, unknown> = {
        enabled: form.enabled,
        vcenterUrl: form.vcenterUrl.trim(),
        username: form.username.trim(),
        ignoreSslErrors: form.ignoreSslErrors,
        allowedUsers: form.allowedUsers,
      };
      if (form.password) body.password = form.password;
      const res = await fetch("/api/vmware/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const d = await res.json();
        setSaveError(d.error || "Failed to save");
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/vmware/vms");
      if (res.ok) {
        const d = await res.json();
        setTestResult({ ok: true, message: `Connection successful — ${d.vms?.length ?? 0} VM(s) found` });
      } else {
        const d = await res.json();
        setTestResult({ ok: false, message: d.error || `HTTP ${res.status}` });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const addUser = () => {
    const u = newUser.trim();
    if (u && !form.allowedUsers.includes(u)) {
      setForm((f) => ({ ...f, allowedUsers: [...f.allowedUsers, u] }));
    }
    setNewUser("");
  };

  if (loading) {
    return (
      <div className="w-80 border-l border-border bg-surface flex items-center justify-center">
        <span className="text-text-muted text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-surface flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-text-primary">vCenter Settings</h2>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-text-muted">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${form.enabled ? "bg-accent" : "bg-[var(--color-muted)]"}`}
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.enabled ? "translate-x-5" : ""}`} />
          </div>
          <span className="text-sm font-medium text-text-primary">Enable VMware Inventory</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">vCenter URL</label>
          <input
            type="url"
            className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            placeholder="https://vcenter.example.com"
            value={form.vcenterUrl}
            onChange={(e) => setForm((f) => ({ ...f, vcenterUrl: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Username</label>
          <input
            type="text"
            className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            placeholder="administrator@vsphere.local"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Password {form.passwordSet && !form.password && <span className="text-green-600">(set)</span>}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="w-full px-3 py-1.5 pr-9 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              placeholder={form.passwordSet ? "Leave blank to keep current" : "Enter password"}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.ignoreSslErrors}
            onChange={(e) => setForm((f) => ({ ...f, ignoreSslErrors: e.target.checked }))}
            className="rounded border-border"
          />
          <span className="text-sm text-text-primary">Ignore SSL certificate errors</span>
        </label>
        <p className="text-xs text-text-muted -mt-2">Enable for self-signed vCenter certificates</p>

        {/* Allowed Users */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Allowed Users</label>
          <p className="text-xs text-text-muted mb-2">Admins always have access. Non-admin users must be listed here.</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="flex-1 px-3 py-1.5 text-sm bg-surface-alt border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              placeholder="username"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addUser(); }}
            />
            <button
              onClick={addUser}
              className="px-2 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {form.allowedUsers.length > 0 && (
            <div className="space-y-1">
              {form.allowedUsers.map((u) => (
                <div key={u} className="flex items-center justify-between px-2 py-1 rounded bg-surface-alt text-sm text-text-primary">
                  <span>{u}</span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, allowedUsers: f.allowedUsers.filter((x) => x !== u) }))}
                    className="text-text-muted hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`text-xs px-3 py-2 rounded-lg border ${testResult.ok ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}`}>
            {testResult.message}
          </div>
        )}

        {saveError && (
          <div className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-800">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Save</>}
        </button>
      </div>
    </div>
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
  const [filterPower, setFilterPower] = useState<string>("all");
  const [filterHost, setFilterHost] = useState<string>("all");
  const [filterOS, setFilterOS] = useState<string>("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Config panel
  const [showConfig, setShowConfig] = useState(false);

  // Export loading
  const [exporting, setExporting] = useState<"csv" | "pdf" | "xlsx" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Check admin
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user?.isAdmin) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  const fetchVMs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vmware/vms");
      if (res.status === 403) { setAccessDenied(true); setLoading(false); return; }
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setVms(data.vms ?? []);
      setFetchedAt(data.fetchedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVMs(); }, [fetchVMs]);

  // Unique values for filter dropdowns
  const allHosts = useMemo(() => Array.from(new Set(vms.map((v) => v.host))).sort(), [vms]);
  const allOS = useMemo(() => Array.from(new Set(vms.map((v) => v.guestOSDisplay))).sort(), [vms]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = vms;
    if (filterPower !== "all") list = list.filter((v) => v.powerState === filterPower);
    if (filterHost !== "all") list = list.filter((v) => v.host === filterHost);
    if (filterOS !== "all") list = list.filter((v) => v.guestOSDisplay === filterOS);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        v.host.toLowerCase().includes(q) ||
        v.guestOSDisplay.toLowerCase().includes(q) ||
        v.toolsVersion.toLowerCase().includes(q),
      );
    }
    const arr = [...list];
    arr.sort((a, b) => {
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
    return arr;
  }, [vms, filterPower, filterHost, filterOS, searchQ, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Summary stats
  const stats = useMemo(() => ({
    total: vms.length,
    on: vms.filter((v) => v.powerState === "POWERED_ON").length,
    off: vms.filter((v) => v.powerState === "POWERED_OFF").length,
    suspended: vms.filter((v) => v.powerState === "SUSPENDED").length,
    byHost: allHosts.map((h) => ({ host: h, count: vms.filter((v) => v.host === h).length })),
    byOS: allOS.slice(0, 8).map((os) => ({ os, count: vms.filter((v) => v.guestOSDisplay === os).length })),
  }), [vms, allHosts, allOS]);

  // Export helpers
  const exportCSV = useCallback(() => {
    setExporting("csv");
    const header = ["Name", "Host", "Status", "OS", "Tools Version", "Memory (MB)", "Memory Used (MB)", "CPU (vCPUs)", "CPU Usage (MHz)", "Storage Provisioned"];
    const rows = filtered.map((v) => [
      v.name,
      v.host,
      v.powerState,
      v.guestOSDisplay,
      v.toolsVersion || "—",
      v.memoryMiB,
      v.memoryUsedMiB ?? "—",
      v.cpuCount,
      v.cpuUsageMhz ?? "—",
      fmtBytes(v.storageBytesProvisioned),
    ]);
    const csv = [header, ...rows].map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vmware-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }, [filtered]);

  const exportXLSX = useCallback(() => {
    setExporting("xlsx");
    const data = filtered.map((v) => ({
      "Name": v.name,
      "Host": v.host,
      "Status": v.powerState,
      "OS": v.guestOSDisplay,
      "Tools Version": v.toolsVersion || "—",
      "Memory (MB)": v.memoryMiB,
      "Memory Used (MB)": v.memoryUsedMiB ?? "—",
      "CPU (vCPUs)": v.cpuCount,
      "CPU Usage (MHz)": v.cpuUsageMhz ?? "—",
      "Storage Provisioned": fmtBytes(v.storageBytesProvisioned),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "VMs");
    XLSX.writeFile(wb, `vmware-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(null);
  }, [filtered]);

  const exportPDF = useCallback(() => {
    setExporting("pdf");
    window.print();
    setExporting(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

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

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .vmware-print-target { display: block !important; }
          .vmware-print-target { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; background: white; }
        }
      `}</style>

      <div className="jp-root" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Header */}
        <header className="jp-header flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
            <Server className="w-5 h-5 text-accent flex-shrink-0" />
            <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">VMware Inventory</h1>
            {fetchedAt && (
              <span className="text-xs text-text-muted hidden sm:block">
                Last updated: {fmtTime(fetchedAt)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                className="oc-search"
                placeholder="Search VMs…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>

            {/* Filters */}
            <select
              className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary"
              value={filterPower}
              onChange={(e) => setFilterPower(e.target.value)}
            >
              <option value="all">All States</option>
              <option value="POWERED_ON">On</option>
              <option value="POWERED_OFF">Off</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            {allHosts.length > 1 && (
              <select
                className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[160px]"
                value={filterHost}
                onChange={(e) => setFilterHost(e.target.value)}
              >
                <option value="all">All Hosts</option>
                {allHosts.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            )}

            {allOS.length > 1 && (
              <select
                className="px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-secondary max-w-[180px]"
                value={filterOS}
                onChange={(e) => setFilterOS(e.target.value)}
              >
                <option value="all">All OS</option>
                {allOS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}

            {/* Refresh */}
            <button
              className="jp-action-btn"
              onClick={fetchVMs}
              disabled={loading}
              title="Refresh inventory"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {!loading && "Refresh"}
            </button>

            {/* Export */}
            <div className="flex items-center gap-1">
              <button
                className="jp-action-btn"
                onClick={exportCSV}
                disabled={!!exporting || filtered.length === 0}
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                className="jp-action-btn"
                onClick={exportXLSX}
                disabled={!!exporting || filtered.length === 0}
                title="Export XLSX"
              >
                <Download className="w-3.5 h-3.5" /> XLS
              </button>
              <button
                className="jp-action-btn"
                onClick={exportPDF}
                disabled={!!exporting || filtered.length === 0}
                title="Print / Export PDF"
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            </div>

            {/* Settings (admin only) */}
            {isAdmin && (
              <button
                className={`jp-action-btn ${showConfig ? "jp-action-btn--primary" : ""}`}
                onClick={() => setShowConfig((v) => !v)}
                title="vCenter settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="jp-main flex-1 overflow-hidden">
          {/* Sidebar — summary stats */}
          <aside className="jp-sidebar overflow-y-auto">
            {!loading && vms.length > 0 && (
              <>
                <div className="jp-section">
                  <h3 className="jp-section-title">Summary</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-text-muted">
                      <span>Total VMs</span>
                      <span className="font-medium text-text-primary">{stats.total}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">Powered On</span>
                      <span className="font-medium text-green-700">{stats.on}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-red-600">Powered Off</span>
                      <span className="font-medium text-red-700">{stats.off}</span>
                    </div>
                    {stats.suspended > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-amber-600">Suspended</span>
                        <span className="font-medium text-amber-700">{stats.suspended}</span>
                      </div>
                    )}
                  </div>
                </div>

                {stats.byHost.length > 0 && (
                  <div className="jp-section">
                    <h3 className="jp-section-title">By Host</h3>
                    <div className="space-y-1">
                      {stats.byHost.map(({ host, count }) => (
                        <div key={host} className="flex justify-between text-xs text-text-muted">
                          <span className="truncate pr-2 text-text-secondary" title={host}>{host}</span>
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
                      {stats.byOS.map(({ os, count }) => (
                        <div key={os} className="flex justify-between text-xs text-text-muted">
                          <span className="truncate pr-2 text-text-secondary" title={os}>{os}</span>
                          <span className="font-medium text-text-primary flex-shrink-0">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>

          {/* Main content */}
          <main className="jp-content overflow-auto">
            {loading ? (
              <div className="jp-empty">
                <RefreshCw className="w-8 h-8 text-text-muted animate-spin mb-3" />
                <p className="text-text-muted">Connecting to vCenter…</p>
              </div>
            ) : error ? (
              <div className="jp-empty">
                <Server className="w-10 h-10 text-text-muted opacity-40 mb-3" />
                <p className="text-text-muted font-medium mb-1">Could not load inventory</p>
                <p className="text-xs text-text-muted max-w-xs text-center">{error}</p>
                {isAdmin && (
                  <button
                    className="jp-action-btn jp-action-btn--primary mt-3"
                    onClick={() => setShowConfig(true)}
                  >
                    <Settings className="w-4 h-4" /> Configure vCenter
                  </button>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="jp-empty">
                <Server className="w-10 h-10 text-text-muted opacity-40 mb-3" />
                <p className="text-text-muted">{vms.length === 0 ? "No VMs found" : "No VMs match the current filters"}</p>
              </div>
            ) : (
              <div className="cl-table-wrap vmware-print-target" ref={printRef}>
                <table className="cl-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("name")} className="cl-th cl-th--sort">
                        Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("host")} className="cl-th cl-th--sort">
                        Host <SortIcon col="host" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("powerState")} className="cl-th cl-th--sort">
                        Status <SortIcon col="powerState" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("guestOSDisplay")} className="cl-th cl-th--sort">
                        OS <SortIcon col="guestOSDisplay" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("toolsVersion")} className="cl-th cl-th--sort">
                        Tools Ver. <SortIcon col="toolsVersion" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("memoryMiB")} className="cl-th cl-th--sort">
                        Memory <SortIcon col="memoryMiB" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("cpuCount")} className="cl-th cl-th--sort">
                        CPU <SortIcon col="cpuCount" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th onClick={() => toggleSort("storageBytesProvisioned")} className="cl-th cl-th--sort">
                        Storage <SortIcon col="storageBytesProvisioned" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((vm) => (
                      <VmRow key={vm.vmId} vm={vm} />
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

          {/* Config panel */}
          {showConfig && isAdmin && (
            <ConfigPanel
              onClose={() => setShowConfig(false)}
              onSaved={() => fetchVMs()}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── VM Row with expand ────────────────────────────────────────────────────────

function VmRow({ vm }: { vm: VmRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="cl-tr cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="cl-td font-medium text-text-primary">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            {vm.name}
          </div>
        </td>
        <td className="cl-td text-text-secondary">{vm.host || "—"}</td>
        <td className="cl-td"><PowerBadge state={vm.powerState} /></td>
        <td className="cl-td text-text-secondary">{vm.guestOSDisplay || "—"}</td>
        <td className="cl-td text-text-secondary text-xs">{vm.toolsVersion || "—"}</td>
        <td className="cl-td">
          <span className="text-text-primary font-medium">{fmtMiB(vm.memoryMiB)}</span>
          {vm.memoryUsedMiB !== null && (
            <span className="text-xs text-text-muted ml-1">/ {fmtMiB(vm.memoryUsedMiB)} used</span>
          )}
        </td>
        <td className="cl-td">
          <span className="text-text-primary font-medium">{vm.cpuCount} vCPU</span>
          {vm.cpuUsageMhz !== null && (
            <span className="text-xs text-text-muted ml-1">/ {vm.cpuUsageMhz} MHz</span>
          )}
        </td>
        <td className="cl-td text-text-secondary">{fmtBytes(vm.storageBytesProvisioned)}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface-alt border-b border-border">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
              <Detail label="VM ID" value={vm.vmId} />
              <Detail label="Power State" value={vm.powerState} />
              <Detail label="Host" value={vm.host || "—"} />
              <Detail label="OS (raw)" value={vm.guestOS || "—"} />
              <Detail label="OS (display)" value={vm.guestOSDisplay} />
              <Detail label="Tools Version" value={vm.toolsVersion || "Not installed"} />
              <Detail label="Tools Status" value={vm.toolsStatus || "—"} />
              <Detail label="Memory Assigned" value={`${vm.memoryMiB} MiB (${fmtMiB(vm.memoryMiB)})`} />
              <Detail label="Memory In Use" value={vm.memoryUsedMiB !== null ? `${vm.memoryUsedMiB} MiB (${fmtMiB(vm.memoryUsedMiB)})` : "— (Tools required)"} />
              <Detail label="CPUs" value={`${vm.cpuCount} vCPU`} />
              <Detail label="CPU Usage" value={vm.cpuUsageMhz !== null ? `${vm.cpuUsageMhz} MHz` : "— (Tools required)"} />
              <Detail label="Storage Provisioned" value={fmtBytes(vm.storageBytesProvisioned)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-muted uppercase tracking-wide text-[10px] mb-0.5">{label}</div>
      <div className="text-text-primary font-medium">{value}</div>
    </div>
  );
}
