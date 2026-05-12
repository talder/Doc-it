"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Check, Download, Globe, Loader2, Plus, RefreshCw, Search,
  Trash2, Wind, X, XCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DnsZone { name: string; type?: string; isReverse?: boolean }
interface FlushResult { host: string; success: boolean; detail?: string }
interface DnsRecord { name: string; type: string; data: string; ttl: number }
interface ZoneStats { total: number; byType: Record<string, number> }

// ── Component ────────────────────────────────────────────────────────────────

export default function DnsTab() {
  const [zones, setZones] = useState<DnsZone[]>([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [stats, setStats] = useState<ZoneStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"name" | "type" | "data" | "ttl">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Flush cache
  const [showFlush, setShowFlush] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [flushResults, setFlushResults] = useState<FlushResult[] | null>(null);
  const [flushError, setFlushError] = useState("");

  // Add record modal
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"A" | "CNAME" | "TXT" | "MX" | "SRV" | "PTR">("A");
  const [addName, setAddName] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addTtl, setAddTtl] = useState("3600");
  const [addPriority, setAddPriority] = useState("10");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Delete confirmation
  const [deleting, setDeleting] = useState<DnsRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load zones
  useEffect(() => {
    fetch("/api/provisioning/agent/dns/zones")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.zones) setZones(d.zones); })
      .catch(() => {});
  }, []);

  // Load records when zone changes
  const loadRecords = useCallback(async () => {
    if (!selectedZone) return;
    setLoading(true);
    try {
      const [recRes, statRes] = await Promise.all([
        fetch(`/api/provisioning/agent/dns/zones/${encodeURIComponent(selectedZone)}/records`),
        fetch(`/api/provisioning/agent/dns/zones/${encodeURIComponent(selectedZone)}/stats`),
      ]);
      if (recRes.ok) {
        const d = await recRes.json();
        setRecords(d.records ?? []);
      }
      if (statRes.ok) {
        const d = await statRes.json();
        setStats(d);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedZone]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // Filter + sort
  const filtered = records
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.data.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = a[sortCol] ?? "";
      const vb = b[sortCol] ?? "";
      const cmp = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // CSV export
  const exportCsv = () => {
    const rows = [["Name", "Type", "Data", "TTL"], ...filtered.map(r => [r.name, r.type, r.data, String(r.ttl)])];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dns-${selectedZone}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Flush DNS cache
  const handleFlush = async () => {
    setFlushing(true);
    setFlushResults(null);
    setFlushError("");
    try {
      const res = await fetch("/api/provisioning/dns/flush-cache", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFlushError(d.error || `HTTP ${res.status}`);
      } else {
        const d = await res.json();
        setFlushResults(d.results ?? []);
      }
    } catch (e) {
      setFlushError(e instanceof Error ? e.message : "Failed");
    }
    setFlushing(false);
  };

  // Add record
  const handleAdd = async () => {
    setAddSaving(true);
    setAddError("");
    try {
      const body: Record<string, unknown> = { type: addType, name: addName, zone: selectedZone, ttl: Number(addTtl) || 3600 };
      if (addType === "A") body.ipAddress = addValue;
      else if (addType === "CNAME") body.target = addValue;
      else if (addType === "TXT") body.text = addValue;
      else if (addType === "MX") { body.target = addValue; body.priority = Number(addPriority) || 10; }
      else if (addType === "SRV") { body.target = addValue; body.priority = Number(addPriority) || 0; }
      else if (addType === "PTR") body.target = addValue;

      const res = await fetch("/api/provisioning/dns/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error || `HTTP ${res.status}`);
      } else {
        setShowAdd(false);
        setAddName(""); setAddValue(""); setAddTtl("3600"); setAddPriority("10");
        loadRecords();
      }
    } catch (e) { setAddError(e instanceof Error ? e.message : "Failed"); }
    setAddSaving(false);
  };

  // Delete record
  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/provisioning/dns/records/${encodeURIComponent(deleting.name)}?zone=${encodeURIComponent(selectedZone)}&type=${encodeURIComponent(deleting.type)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleting(null);
        setDeleteConfirm("");
        loadRecords();
      }
    } catch { /* ignore */ }
    setDeleteLoading(false);
  };

  const PROTECTED_TYPES = new Set(["SOA", "NS"]);

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Zone selector + toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <Globe className="w-5 h-5 text-accent" />
        <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent min-w-[240px]">
          <option value="">Select DNS zone…</option>
          {zones.filter(z => !z.isReverse).map(z => <option key={z.name} value={z.name}>{z.name}</option>)}
          {zones.some(z => z.isReverse) && <option disabled>── Reverse Zones ──</option>}
          {zones.filter(z => z.isReverse).map(z => <option key={z.name} value={z.name}>{z.name} (Reverse)</option>)}
        </select>
        {selectedZone && (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-lg bg-surface flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter records…"
                className="flex-1 text-sm bg-transparent text-text-primary outline-none" />
            </div>
            <button onClick={() => loadRecords()} className="p-2 rounded-lg border border-border hover:bg-muted text-text-muted" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90">
              <Plus className="w-3.5 h-3.5" /> Add Record
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => { setShowFlush(true); setFlushResults(null); setFlushError(""); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100">
              <Wind className="w-3.5 h-3.5" /> Flush Cache
            </button>
          </>
        )}
      </div>

      {/* Zone stats */}
      {stats && selectedZone && (
        <div className="flex items-center gap-4 mb-4 text-xs text-text-muted">
          <span className="font-medium text-text-primary">{stats.total} records</span>
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type}>{type}: {count}</span>
          ))}
        </div>
      )}

      {/* No zone selected */}
      {!selectedZone && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Globe className="w-12 h-12 mb-3 opacity-20" />
          <p className="font-medium">Select a DNS zone to browse records</p>
          <p className="text-xs mt-1">Zones are loaded from the DNS agent</p>
        </div>
      )}

      {/* Records table */}
      {selectedZone && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(["name", "type", "data", "ttl"] as const).map(col => (
                  <th key={col} onClick={() => toggleSort(col)}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase cursor-pointer hover:text-text-primary select-none">
                    {col === "ttl" ? "TTL" : col.charAt(0).toUpperCase() + col.slice(1)}
                    {sortCol === col && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading records…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  {search ? "No records match the filter" : "No records in this zone"}
                </td></tr>
              ) : filtered.map((r, i) => (
                <tr key={`${r.name}-${r.type}-${r.data}-${i}`} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-text-primary">{r.name}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                      r.type === "A" ? "bg-blue-50 text-blue-700" :
                      r.type === "CNAME" ? "bg-purple-50 text-purple-700" :
                      r.type === "MX" ? "bg-amber-50 text-amber-700" :
                      r.type === "TXT" ? "bg-green-50 text-green-700" :
                      r.type === "SRV" ? "bg-cyan-50 text-cyan-700" :
                      "bg-gray-50 text-gray-600"
                    }`}>{r.type}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary truncate max-w-[400px]">{r.data}</td>
                  <td className="px-4 py-2 text-text-muted">{r.ttl}s</td>
                  <td className="px-4 py-2">
                    {!PROTECTED_TYPES.has(r.type) && (
                      <button onClick={() => { setDeleting(r); setDeleteConfirm(""); }}
                        className="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add record modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-primary">Add DNS Record</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
                <select value={addType} onChange={e => setAddType(e.target.value as typeof addType)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary">
                  <option value="A">A</option>
                  <option value="CNAME">CNAME</option>
                  <option value="TXT">TXT</option>
                  <option value="MX">MX</option>
                  <option value="SRV">SRV</option>
                  <option value="PTR">PTR</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. server01"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {addType === "A" ? "IP Address" : addType === "TXT" ? "Text Value" : addType === "PTR" ? "Target FQDN" : "Target"}
                </label>
                <input value={addValue} onChange={e => setAddValue(e.target.value)}
                  placeholder={addType === "A" ? "192.168.1.10" : addType === "TXT" ? "v=spf1 ..." : addType === "PTR" ? "server01.example.com" : "target.example.com"}
                  className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              {(addType === "MX" || addType === "SRV") && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Priority</label>
                  <input value={addPriority} onChange={e => setAddPriority(e.target.value)} type="number"
                    className="w-32 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">TTL (seconds)</label>
                <input value={addTtl} onChange={e => setAddTtl(e.target.value)} type="number"
                  className="w-32 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              </div>
              {addError && (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <AlertTriangle className="w-3.5 h-3.5" /> {addError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleAdd} disabled={!addName || !addValue || addSaving}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flush DNS cache modal */}
      {showFlush && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowFlush(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-primary">Flush DNS Cache</h3>
              <button onClick={() => setShowFlush(false)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            {!flushResults && !flushError && !flushing && (
              <>
                <p className="text-sm text-text-secondary mb-4">
                  This will clear the DNS server cache on the local agent host and any configured remote forwarders.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowFlush(false)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
                  <button onClick={handleFlush}
                    className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    Flush Cache
                  </button>
                </div>
              </>
            )}
            {flushing && (
              <div className="flex items-center justify-center py-8 text-text-muted">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Flushing DNS cache…
              </div>
            )}
            {flushError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3">
                <AlertTriangle className="w-4 h-4 inline mr-1.5" />{flushError}
              </div>
            )}
            {flushResults && (
              <>
                <div className="space-y-2 mb-4">
                  {flushResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
                      r.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
                    }`}>
                      {r.success ? <Check className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="font-medium">{r.host}</span>
                      <span className="text-xs opacity-70">{r.detail}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setShowFlush(false)} className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleting(null)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-primary mb-2">Delete DNS Record</h3>
            <p className="text-sm text-text-secondary mb-3">
              Delete <span className="font-mono font-medium text-text-primary">{deleting.name}</span> ({deleting.type}) from <span className="font-medium">{selectedZone}</span>?
            </p>
            <p className="text-xs text-text-muted mb-2">Type the record name to confirm:</p>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={deleting.name}
              className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-text-primary mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirm !== deleting.name || deleteLoading}
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
