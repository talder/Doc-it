"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Check, Download, Loader2, Network, Pencil, Plus, RefreshCw,
  Search, Trash2, X,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DhcpScope { scopeId: string; name: string; description?: string; startRange?: string; endRange?: string; subnetMask?: string; state?: string }
interface DhcpReservation { ipAddress: string; macAddress: string; name: string; description?: string; scopeId?: string }
interface DhcpLease { ipAddress: string; macAddress: string; hostName?: string; leaseStart?: string; leaseExpiry?: string; addressState?: string }
interface ScopeStats { total: number; used: number; free: number; percentUsed: number }
interface ScopeOption { optionId: number; name: string; value: string }
interface ExclusionRange { startRange: string; endRange: string }

type SubTab = "reservations" | "leases" | "info";

// ── Component ────────────────────────────────────────────────────────────────

export default function DhcpTab() {
  const [scopes, setScopes] = useState<DhcpScope[]>([]);
  const [selectedScope, setSelectedScope] = useState("");
  const [subTab, setSubTab] = useState<SubTab>("reservations");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Data
  const [reservations, setReservations] = useState<DhcpReservation[]>([]);
  const [leases, setLeases] = useState<DhcpLease[]>([]);
  const [stats, setStats] = useState<ScopeStats | null>(null);
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [exclusions, setExclusions] = useState<ExclusionRange[]>([]);

  // Sort state
  const [resSortCol, setResSortCol] = useState<"ipAddress" | "macAddress" | "name" | "description">("ipAddress");
  const [resSortDir, setResSortDir] = useState<"asc" | "desc">("asc");
  const [leaseSortCol, setLeaseSortCol] = useState<"ipAddress" | "macAddress" | "hostName" | "leaseStart" | "leaseExpiry" | "addressState">("ipAddress");
  const [leaseSortDir, setLeaseSortDir] = useState<"asc" | "desc">("asc");

  // Inline description edit
  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Add reservation modal
  const [showAdd, setShowAdd] = useState(false);
  const [addIp, setAddIp] = useState("");
  const [addMac, setAddMac] = useState("");
  const [addHostname, setAddHostname] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Delete
  const [deleting, setDeleting] = useState<DhcpReservation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load scopes
  useEffect(() => {
    fetch("/api/provisioning/agent/dhcp/scopes")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.scopes) setScopes(d.scopes); })
      .catch(() => {});
  }, []);

  // Load data when scope/subtab changes
  const loadData = useCallback(async () => {
    if (!selectedScope) return;
    setLoading(true);
    try {
      if (subTab === "reservations") {
        const res = await fetch(`/api/provisioning/agent/dhcp/scopes/${encodeURIComponent(selectedScope)}/reservations`);
        if (res.ok) { const d = await res.json(); setReservations(d.reservations ?? []); }
      } else if (subTab === "leases") {
        const res = await fetch(`/api/provisioning/agent/dhcp/scopes/${encodeURIComponent(selectedScope)}/leases`);
        if (res.ok) { const d = await res.json(); setLeases(d.leases ?? []); }
      } else if (subTab === "info") {
        const [sRes, oRes, eRes] = await Promise.all([
          fetch(`/api/provisioning/agent/dhcp/scopes/${encodeURIComponent(selectedScope)}/stats`),
          fetch(`/api/provisioning/agent/dhcp/scopes/${encodeURIComponent(selectedScope)}/options`),
          fetch(`/api/provisioning/agent/dhcp/scopes/${encodeURIComponent(selectedScope)}/exclusions`),
        ]);
        if (sRes.ok) { const d = await sRes.json(); setStats(d); }
        if (oRes.ok) { const d = await oRes.json(); setOptions(d.options ?? []); }
        if (eRes.ok) { const d = await eRes.json(); setExclusions(d.exclusions ?? []); }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedScope, subTab]);

  useEffect(() => { loadData(); }, [loadData]);

  // CSV export
  const exportCsv = () => {
    let rows: string[][];
    if (subTab === "reservations") {
      rows = [["IP", "MAC", "Hostname", "Description"], ...reservations.map(r => [r.ipAddress, r.macAddress, r.name, r.description ?? ""])];
    } else {
      rows = [["IP", "MAC", "Hostname", "Lease Start", "Lease Expiry", "Status"],
        ...leases.map(l => [l.ipAddress, l.macAddress, l.hostName ?? "", l.leaseStart ?? "", l.leaseExpiry ?? "", l.addressState ?? ""])];
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dhcp-${selectedScope}-${subTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Add reservation
  const handleAdd = async () => {
    setAddSaving(true); setAddError("");
    try {
      const res = await fetch("/api/provisioning/dhcp/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: selectedScope, ipAddress: addIp, macAddress: addMac, hostName: addHostname, description: addDesc }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error || `HTTP ${res.status}`);
      } else {
        setShowAdd(false); setAddIp(""); setAddMac(""); setAddHostname(""); setAddDesc("");
        loadData();
      }
    } catch (e) { setAddError(e instanceof Error ? e.message : "Failed"); }
    setAddSaving(false);
  };

  // Delete reservation
  const [deleteError, setDeleteError] = useState("");
  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/provisioning/dhcp/reservations/${encodeURIComponent(deleting.ipAddress)}?scope=${encodeURIComponent(selectedScope)}`, { method: "DELETE" });
      if (res.ok) { setDeleting(null); setDeleteConfirm(""); loadData(); }
      else { const d = await res.json().catch(() => ({})); setDeleteError(d.error || `HTTP ${res.status}`); }
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "Failed to reach server"); }
    setDeleteLoading(false);
  };

  // Save description
  const handleSaveDesc = async (ip: string) => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/provisioning/dhcp/reservations/${encodeURIComponent(ip)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDesc, scope: selectedScope }),
      });
      if (res.ok) {
        setReservations(prev => prev.map(r => r.ipAddress === ip ? { ...r, description: editDesc } : r));
      }
    } catch { /* ignore */ }
    setEditSaving(false);
    setEditingIp(null);
  };

  const fmtTime = (s?: string) => { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } };

  // Sort helpers
  const toggleResSort = (col: typeof resSortCol) => {
    if (resSortCol === col) setResSortDir(d => d === "asc" ? "desc" : "asc");
    else { setResSortCol(col); setResSortDir("asc"); }
  };
  const toggleLeaseSort = (col: typeof leaseSortCol) => {
    if (leaseSortCol === col) setLeaseSortDir(d => d === "asc" ? "desc" : "asc");
    else { setLeaseSortCol(col); setLeaseSortDir("asc"); }
  };
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

  const filteredRes = reservations
    .filter(r => !search || r.ipAddress.includes(search) || r.macAddress.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = (a[resSortCol] ?? "").toString();
      const vb = (b[resSortCol] ?? "").toString();
      return resSortDir === "asc" ? cmp(va, vb) : cmp(vb, va);
    });
  const filteredLeases = leases
    .filter(l => !search || l.ipAddress.includes(search) || l.macAddress.toLowerCase().includes(search.toLowerCase()) || (l.hostName ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = ((a as unknown as Record<string, unknown>)[leaseSortCol] ?? "").toString();
      const vb = ((b as unknown as Record<string, unknown>)[leaseSortCol] ?? "").toString();
      return leaseSortDir === "asc" ? cmp(va, vb) : cmp(vb, va);
    });

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Scope selector + toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <Network className="w-5 h-5 text-accent" />
        <select value={selectedScope} onChange={e => setSelectedScope(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary min-w-[240px]">
          <option value="">Select DHCP scope…</option>
          {scopes.map(s => <option key={s.scopeId} value={s.scopeId}>{s.scopeId} — {s.name}</option>)}
        </select>
        {selectedScope && (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-lg bg-surface flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
                className="flex-1 text-sm bg-transparent text-text-primary outline-none" />
            </div>
            <button onClick={() => loadData()} className="p-2 rounded-lg border border-border hover:bg-muted text-text-muted">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {subTab === "reservations" && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90">
                <Plus className="w-3.5 h-3.5" /> Add Reservation
              </button>
            )}
            {subTab !== "info" && (
              <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            )}
          </>
        )}
      </div>

      {/* Sub-tabs */}
      {selectedScope && (
        <div className="flex gap-1 mb-4">
          {(["reservations", "leases", "info"] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${subTab === t ? "bg-accent text-white" : "text-text-muted hover:bg-muted"}`}>
              {t === "reservations" ? "Reservations" : t === "leases" ? "Active Leases" : "Scope Info"}
            </button>
          ))}
        </div>
      )}

      {/* No scope selected */}
      {!selectedScope && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Network className="w-12 h-12 mb-3 opacity-20" />
          <p className="font-medium">Select a DHCP scope to browse</p>
        </div>
      )}

      {/* Reservations table */}
      {selectedScope && subTab === "reservations" && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(["ipAddress", "macAddress", "name", "description"] as const).map(col => (
                  <th key={col} onClick={() => toggleResSort(col)}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase cursor-pointer hover:text-text-primary select-none">
                    {col === "ipAddress" ? "IP Address" : col === "macAddress" ? "MAC Address" : col === "name" ? "Hostname" : "Description"}
                    {resSortCol === col && <span className="ml-1">{resSortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</td></tr>
              ) : filteredRes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">No reservations</td></tr>
              ) : filteredRes.map(r => (
                <tr key={r.ipAddress} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-text-primary">{r.ipAddress}</td>
                  <td className="px-4 py-2 font-mono text-text-secondary">{r.macAddress}</td>
                  <td className="px-4 py-2 text-text-primary">{r.name}</td>
                  <td className="px-4 py-2 text-xs">
                    {editingIp === r.ipAddress ? (
                      <div className="flex items-center gap-1">
                        <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveDesc(r.ipAddress); if (e.key === "Escape") setEditingIp(null); }}
                          autoFocus className="flex-1 px-2 py-1 text-xs border border-accent rounded bg-surface text-text-primary outline-none" />
                        <button onClick={() => handleSaveDesc(r.ipAddress)} disabled={editSaving}
                          className="p-1 rounded hover:bg-green-50 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingIp(null)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <span className="group flex items-center gap-1 cursor-pointer text-text-muted hover:text-text-primary"
                        onClick={() => { setEditingIp(r.ipAddress); setEditDesc(r.description ?? ""); }}>
                        {r.description || <span className="italic text-text-muted/50">Add description…</span>}
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-text-muted" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <button onClick={() => { setDeleting(r); setDeleteConfirm(""); setDeleteError(""); }} className="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leases table */}
      {selectedScope && subTab === "leases" && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(["ipAddress", "macAddress", "hostName", "leaseStart", "leaseExpiry", "addressState"] as const).map(col => (
                  <th key={col} onClick={() => toggleLeaseSort(col)}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase cursor-pointer hover:text-text-primary select-none">
                    {col === "ipAddress" ? "IP" : col === "macAddress" ? "MAC" : col === "hostName" ? "Hostname" : col === "leaseStart" ? "Start" : col === "leaseExpiry" ? "Expiry" : "Status"}
                    {leaseSortCol === col && <span className="ml-1">{leaseSortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</td></tr>
              ) : filteredLeases.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No active leases</td></tr>
              ) : filteredLeases.map(l => (
                <tr key={l.ipAddress + l.macAddress} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-text-primary">{l.ipAddress}</td>
                  <td className="px-4 py-2 font-mono text-text-secondary">{l.macAddress}</td>
                  <td className="px-4 py-2 text-text-primary">{l.hostName ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{fmtTime(l.leaseStart)}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{fmtTime(l.leaseExpiry)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      l.addressState === "Active" || l.addressState === "ActiveReservation"
                        ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"
                    }`}>{l.addressState ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Scope info */}
      {selectedScope && subTab === "info" && (
        <div className="space-y-4 max-w-2xl">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <>
              {/* Utilization */}
              {stats && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Utilization</h3>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-2xl font-bold text-text-primary">{stats.percentUsed}%</span>
                    <div className="flex-1">
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          stats.percentUsed > 90 ? "bg-red-500" : stats.percentUsed > 70 ? "bg-amber-500" : "bg-green-500"
                        }`} style={{ width: `${stats.percentUsed}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-6 text-xs text-text-muted">
                    <span>Total: {stats.total}</span>
                    <span>Used: {stats.used}</span>
                    <span>Free: {stats.free}</span>
                  </div>
                </div>
              )}

              {/* Options */}
              {options.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Scope Options</h3>
                  <div className="space-y-1">
                    {options.map(o => (
                      <div key={o.optionId} className="flex items-center gap-3 text-sm">
                        <span className="text-text-muted w-32 text-xs">{o.name}</span>
                        <span className="font-mono text-text-primary">{o.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exclusions */}
              {exclusions.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Exclusion Ranges</h3>
                  <div className="space-y-1">
                    {exclusions.map((e, i) => (
                      <div key={i} className="text-sm font-mono text-text-primary">
                        {e.startRange} — {e.endRange}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add reservation modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-primary">Add DHCP Reservation</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">IP Address *</label>
                <input value={addIp} onChange={e => setAddIp(e.target.value)} placeholder="192.168.1.50"
                  className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">MAC Address *</label>
                <input value={addMac} onChange={e => setAddMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF"
                  className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Hostname</label>
                <input value={addHostname} onChange={e => setAddHostname(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
                <input value={addDesc} onChange={e => setAddDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              {addError && <div className="flex items-center gap-2 text-xs text-red-500"><AlertTriangle className="w-3.5 h-3.5" /> {addError}</div>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleAdd} disabled={!addIp || !addMac || addSaving}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleting(null)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-primary mb-2">Delete DHCP Reservation</h3>
            <p className="text-sm text-text-secondary mb-3">
              Delete reservation for <span className="font-mono font-medium text-text-primary">{deleting.ipAddress}</span>?
            </p>
            <p className="text-xs text-text-muted mb-2">Type the IP address to confirm:</p>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={deleting.ipAddress}
              className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary mb-4" />
            {deleteError && <div className="flex items-center gap-2 text-xs text-red-500 mb-3"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {deleteError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirm !== deleting.ipAddress || deleteLoading}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
