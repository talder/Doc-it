"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle, Loader2, Network, Plus, RefreshCw,
  Search, Server, Shield, Trash2, XCircle,
} from "lucide-react";
import type { XiqseServerPublic, NacGroupInfo, NacEndSystemLookup } from "@/lib/provisioning-shared";
import { isValidMac, normalizeMac } from "@/lib/provisioning-shared";

// ── NacTab ───────────────────────────────────────────────────────────────────

export default function NacTab() {
  // Server config
  const [servers, setServers] = useState<XiqseServerPublic[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);

  // NAC groups
  const [groups, setGroups] = useState<NacGroupInfo[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");

  // MAC lookup
  const [lookupMac, setLookupMac] = useState("");
  const [lookupResult, setLookupResult] = useState<NacEndSystemLookup | null | undefined>(undefined);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Manual push
  const [pushMac, setPushMac] = useState("");
  const [pushGroup, setPushGroup] = useState("");
  const [pushDesc, setPushDesc] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  // Server config form
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: "", url: "", username: "", password: "", ignoreSslErrors: true });
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
    fetch("/api/xiqse/servers")
      .then(r => r.ok ? r.json() : null)
      .then(d => setServers(d?.servers ?? []))
      .catch(() => {})
      .finally(() => setLoadingServers(false));
  }, []);

  // Load groups when servers are available
  useEffect(() => {
    if (servers.some(s => s.enabled)) refreshGroups();
  }, [servers]);

  const refreshGroups = useCallback(() => {
    setLoadingGroups(true);
    fetch("/api/xiqse/nac?action=groups")
      .then(r => r.ok ? r.json() : null)
      .then(d => setGroups(d?.groups ?? []))
      .catch(() => {})
      .finally(() => setLoadingGroups(false));
  }, []);

  const doLookup = async () => {
    if (!isValidMac(lookupMac)) return;
    setLookupLoading(true);
    setLookupResult(undefined);
    try {
      const r = await fetch(`/api/xiqse/nac?action=lookup&mac=${encodeURIComponent(normalizeMac(lookupMac))}`);
      const d = await r.json();
      setLookupResult(d.endSystem ?? null);
    } catch { setLookupResult(null); }
    setLookupLoading(false);
  };

  const doPush = async () => {
    if (!pushMac || !pushGroup) return;
    setPushLoading(true);
    setPushResult(null);
    try {
      const r = await fetch("/api/xiqse/nac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", mac: normalizeMac(pushMac), group: pushGroup, description: pushDesc }),
      });
      const d = await r.json();
      setPushResult(d);
    } catch { setPushResult({ success: false, message: "Request failed" }); }
    setPushLoading(false);
  };

  const doRemove = async (mac: string, group: string) => {
    if (!confirm(`Remove ${mac} from ${group}?`)) return;
    try {
      await fetch("/api/xiqse/nac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", mac, group }),
      });
      if (lookupResult?.macAddress === mac) doLookup();
    } catch { /* best effort */ }
  };

  const addServer = async () => {
    setSavingServer(true);
    try {
      const r = await fetch("/api/xiqse/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newServer),
      });
      if (r.ok) {
        setShowAddServer(false);
        setNewServer({ name: "", url: "", username: "", password: "", ignoreSslErrors: true });
        refreshServers();
      }
    } catch { /* ignore */ }
    setSavingServer(false);
  };

  const testConnection = async (id: string) => {
    setTestResult(null);
    const r = await fetch("/api/xiqse/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    setTestResult(d);
  };

  const deleteServer = async (id: string) => {
    if (!confirm("Delete this XIQ-SE server?")) return;
    await fetch("/api/xiqse/servers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refreshServers();
  };

  const filteredGroups = groups.filter(g =>
    !groupFilter || g.name.toLowerCase().includes(groupFilter.toLowerCase()) ||
    g.description.toLowerCase().includes(groupFilter.toLowerCase()),
  );

  const hasServer = servers.some(s => s.enabled);

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
      {/* Server config section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Server className="w-4 h-4" /> XIQ-SE Servers
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
            No XIQ-SE servers configured. {isAdmin ? "Click \"Add Server\" to connect." : "Ask an admin to configure a server."}
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full ${s.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-primary">{s.name}</span>
                  <span className="text-xs text-text-muted ml-2">{s.url}</span>
                </div>
                <button onClick={() => testConnection(s.id)} className="text-xs text-accent hover:underline">Test</button>
                {isAdmin && (
                  <button onClick={() => deleteServer(s.id)} className="text-text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
            {testResult && (
              <div className={`text-xs px-3 py-1.5 rounded ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
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
                placeholder="https://xiqse-host:8443 *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              <input value={newServer.username} onChange={e => setNewServer({ ...newServer, username: e.target.value })}
                placeholder="Username *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
              <input value={newServer.password} onChange={e => setNewServer({ ...newServer, password: e.target.value })}
                type="password" placeholder="Password" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
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

      {/* NAC Groups */}
      {hasServer && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Shield className="w-4 h-4" /> NAC End-System Groups
            </h2>
            <button onClick={refreshGroups} disabled={loadingGroups} className="p-1.5 text-text-muted hover:text-text-primary">
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
              placeholder="Filter groups…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
          </div>

          {loadingGroups ? (
            <div className="text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading groups…</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-sm text-text-muted">No groups found.</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {filteredGroups.map(g => (
                <div key={g.name} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/30">
                  <Network className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">{g.name}</span>
                    {g.description && <span className="text-xs text-text-muted ml-2">{g.description}</span>}
                  </div>
                  <span className="text-[10px] text-text-muted bg-muted px-1.5 py-0.5 rounded">{g.type}</span>
                  {isAdmin && (
                    <button onClick={() => { setPushGroup(g.name); }}
                      className="text-[10px] text-accent hover:underline">Use</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MAC Lookup */}
      {hasServer && (
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" /> MAC Lookup
          </h2>
          <div className="flex gap-2 mb-3">
            <input value={lookupMac} onChange={e => setLookupMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              onKeyDown={e => e.key === "Enter" && doLookup()}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary font-mono focus:outline-none focus:border-accent" />
            <button onClick={doLookup} disabled={lookupLoading || !isValidMac(lookupMac)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
              {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Lookup
            </button>
          </div>

          {lookupResult === null && !lookupLoading && (
            <div className="text-sm text-text-muted bg-surface border border-border rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> MAC not found in XIQ-SE.
            </div>
          )}
          {lookupResult && (
            <div className="bg-surface border border-border rounded-lg p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div><span className="text-text-muted">MAC:</span> <span className="font-mono">{lookupResult.macAddress}</span></div>
                <div><span className="text-text-muted">IP:</span> <span className="font-mono">{lookupResult.ipAddress || "—"}</span></div>
                <div><span className="text-text-muted">State:</span> {lookupResult.state || "—"}</div>
                <div><span className="text-text-muted">Policy:</span> {lookupResult.policy || "—"}</div>
                <div><span className="text-text-muted">Switch:</span> {lookupResult.switchIP || "—"}:{lookupResult.switchPort || "—"}</div>
                <div><span className="text-text-muted">NAC Profile:</span> {lookupResult.nacProfileName || "—"}</div>
              </div>
              {lookupResult.groups.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <span className="text-text-muted text-xs font-medium">Groups:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lookupResult.groups.map(g => (
                      <span key={g} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded">
                        {g}
                        {isAdmin && (
                          <button onClick={() => doRemove(lookupResult.macAddress, g)} className="text-red-400 hover:text-red-600">
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Manual Push */}
      {hasServer && isAdmin && (
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Manual NAC Push
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input value={pushMac} onChange={e => setPushMac(e.target.value)}
              placeholder="MAC address *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary font-mono" />
            <input value={pushGroup} onChange={e => setPushGroup(e.target.value)}
              placeholder="End-system group *" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
            <input value={pushDesc} onChange={e => setPushDesc(e.target.value)}
              placeholder="Description (optional)" className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary" />
          </div>
          <button onClick={doPush} disabled={pushLoading || !pushMac || !pushGroup}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
            {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Push MAC to Group
          </button>
          {pushResult && (
            <div className={`mt-2 text-xs px-3 py-1.5 rounded flex items-center gap-1.5 ${pushResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {pushResult.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {pushResult.message}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
