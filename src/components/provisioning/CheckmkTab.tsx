"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle, Loader2, Monitor, Plus, RefreshCw,
  Search, Server, Trash2, XCircle,
} from "lucide-react";
import type { CheckmkServerPublic, CheckmkHostInfo } from "@/lib/provisioning-shared";

// ── CheckmkTab ───────────────────────────────────────────────────────────────

export default function CheckmkTab() {
  // Server config
  const [servers, setServers] = useState<CheckmkServerPublic[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);

  // Host search
  const [hostQuery, setHostQuery] = useState("");
  const [hosts, setHosts] = useState<CheckmkHostInfo[]>([]);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [selectedHost, setSelectedHost] = useState<CheckmkHostInfo | null>(null);

  // Server config form
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: "", url: "", username: "", secret: "", ignoreSslErrors: true });
  const [savingServer, setSavingServer] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Init
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user?.isAdmin) setIsAdmin(true); })
      .catch(() => {});
    refreshServers();
  }, []);

  const refreshServers = useCallback(() => {
    setLoadingServers(true);
    fetch("/api/checkmk/servers")
      .then(r => r.ok ? r.json() : null)
      .then(d => setServers(d?.servers ?? []))
      .catch(() => {})
      .finally(() => setLoadingServers(false));
  }, []);

  const searchHosts = useCallback(async (query?: string) => {
    setLoadingHosts(true);
    setSelectedHost(null);
    try {
      const qs = query ? `?query=${encodeURIComponent(query)}` : "";
      const r = await fetch(`/api/checkmk/hosts${qs}`);
      const d = await r.json();
      setHosts(d?.hosts ?? []);
    } catch { setHosts([]); }
    setLoadingHosts(false);
  }, []);

  const addServer = async () => {
    setSavingServer(true);
    try {
      const r = await fetch("/api/checkmk/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newServer),
      });
      if (r.ok) {
        setShowAddServer(false);
        setNewServer({ name: "", url: "", username: "", secret: "", ignoreSslErrors: true });
        refreshServers();
      }
    } catch { /* ignore */ }
    setSavingServer(false);
  };

  const testConnection = async (id: string) => {
    setTestResult(null);
    const r = await fetch("/api/checkmk/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    setTestResult(d);
  };

  const deleteServer = async (id: string) => {
    if (!confirm("Delete this CheckMK server?")) return;
    await fetch("/api/checkmk/servers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refreshServers();
  };

  const hasServer = servers.some(s => s.enabled);

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
      {/* Server config section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Server className="w-4 h-4" /> CheckMK Servers
          </h2>
          <div className="flex gap-2">
            <button onClick={refreshServers} className="p-1.5 text-text-muted hover:text-text-primary"><RefreshCw className="w-4 h-4" /></button>
            {isAdmin && (
              <button onClick={() => setShowAddServer(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90">
                <Plus className="w-3.5 h-3.5" /> Add Server
              </button>
            )}
          </div>
        </div>

        {loadingServers ? (
          <div className="text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : servers.length === 0 ? (
          <div className="text-sm text-text-muted bg-surface border border-border rounded-lg p-4">
            No CheckMK servers configured. {isAdmin ? "Click \"Add Server\" to connect." : "Ask an admin to configure a server."}
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full ${s.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-primary">{s.name}</span>
                  <span className="text-xs text-text-muted ml-2">{s.url}</span>
                  <span className="text-xs text-text-muted ml-2">({s.username})</span>
                </div>
                <button onClick={() => testConnection(s.id)} className="text-xs text-accent hover:underline">Test</button>
                {isAdmin && (
                  <button onClick={() => deleteServer(s.id)} className="text-text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
            {testResult && (
              <div className={`text-xs px-3 py-1.5 rounded ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {testResult.ok ? <CheckCircle className="w-3.5 h-3.5 inline mr-1" /> : <XCircle className="w-3.5 h-3.5 inline mr-1" />}
                {testResult.ok ? testResult.message : testResult.error}
              </div>
            )}
          </div>
        )}

        {/* Add server form */}
        {showAddServer && isAdmin && (
          <div className="mt-3 border border-accent/30 rounded-lg bg-accent/5 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={newServer.name} onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="Display name *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              <input value={newServer.url} onChange={e => setNewServer({ ...newServer, url: e.target.value })}
                placeholder="https://checkmk.local/mysite *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              <input value={newServer.username} onChange={e => setNewServer({ ...newServer, username: e.target.value })}
                placeholder="Automation user *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              <input value={newServer.secret} onChange={e => setNewServer({ ...newServer, secret: e.target.value })}
                type="password" placeholder="Automation secret" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
            </div>
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={newServer.ignoreSslErrors}
                onChange={e => setNewServer({ ...newServer, ignoreSslErrors: e.target.checked })} />
              Ignore SSL certificate errors (self-signed)
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddServer(false)} className="px-3 py-1.5 text-xs text-text-muted hover:bg-muted rounded-md">Cancel</button>
              <button onClick={addServer} disabled={!newServer.name || !newServer.url || !newServer.username || savingServer}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                {savingServer ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Save
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Host Search */}
      {hasServer && (
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Monitor className="w-4 h-4" /> Host Search
          </h2>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={hostQuery} onChange={e => setHostQuery(e.target.value)}
                placeholder="Search by hostname, alias or IP…"
                onKeyDown={e => e.key === "Enter" && searchHosts(hostQuery || undefined)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
            </div>
            <button onClick={() => searchHosts(hostQuery || undefined)} disabled={loadingHosts}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
              {loadingHosts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          {loadingHosts ? (
            <div className="text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>
          ) : hosts.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              {hosts.map(h => (
                <button key={h.hostName} onClick={() => setSelectedHost(h)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-left hover:bg-muted/30 ${selectedHost?.hostName === h.hostName ? "bg-accent/5" : ""}`}>
                  <Monitor className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">{h.hostName}</span>
                    {h.alias && <span className="text-xs text-text-muted ml-2">{h.alias}</span>}
                  </div>
                  {h.ipAddress && <span className="text-xs font-mono text-text-muted">{h.ipAddress}</span>}
                  <span className="text-[10px] text-text-muted bg-muted px-1.5 py-0.5 rounded">{h.folder || "/"}</span>
                </button>
              ))}
            </div>
          ) : hosts.length === 0 && !loadingHosts && hostQuery ? (
            <div className="text-sm text-text-muted">No hosts found.</div>
          ) : null}

          {/* Host detail */}
          {selectedHost && (
            <div className="mt-3 bg-surface border border-border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text-primary">{selectedHost.hostName}</span>
                {selectedHost.isCluster && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Cluster</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div><span className="text-text-muted">IP:</span> <span className="font-mono">{selectedHost.ipAddress || "—"}</span></div>
                <div><span className="text-text-muted">Folder:</span> {selectedHost.folder || "/"}</div>
                <div><span className="text-text-muted">Alias:</span> {selectedHost.alias || "—"}</div>
              </div>
              {Object.keys(selectedHost.labels).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <span className="text-text-muted text-xs font-medium">Labels:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(selectedHost.labels).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded">{k}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
