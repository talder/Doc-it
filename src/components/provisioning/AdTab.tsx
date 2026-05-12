"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle, Key, Loader2, Lock,
  Search, Trash2, Unlock, Users, X,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface AdUser {
  sAMAccountName: string; displayName: string; email: string;
  enabled: boolean; lastLogon?: string; groupCount: number; locked?: boolean;
  dn?: string; groups?: string[];
}
interface AdGroup { dn: string; name: string; description?: string; memberCount: number }
interface AdGroupMember { dn: string; sAMAccountName: string; displayName?: string; type: string }
interface AdComputer {
  dn: string; name: string; os?: string; lastLogon?: string;
  enabled: boolean; ou?: string; stale?: boolean;
}

type SubTab = "users" | "groups" | "computers";

// ── Component ────────────────────────────────────────────────────────────────

export default function AdTab() {
  const [subTab, setSubTab] = useState<SubTab>("users");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Users
  const [users, setUsers] = useState<AdUser[]>([]);
  const [, setSelectedUser] = useState<AdUser | null>(null);
  const [actionLoading, setActionLoading] = useState("");

  // Groups
  const [groups, setGroups] = useState<AdGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AdGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<AdGroupMember[]>([]);

  // Computers
  const [computers, setComputers] = useState<AdComputer[]>([]);

  // Password reset result
  const [resetPassword, setResetPassword] = useState("");

  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setLoading(true); setError("");
    try {
      if (subTab === "users") {
        const res = await fetch(`/api/provisioning/ad/users?q=${encodeURIComponent(search)}`);
        if (!res.ok) { setError("Failed to search users"); setUsers([]); }
        else { const d = await res.json(); setUsers(d.users ?? []); }
      } else if (subTab === "groups") {
        const res = await fetch(`/api/provisioning/ad/groups?q=${encodeURIComponent(search)}`);
        if (!res.ok) { setError("Failed to search groups"); setGroups([]); }
        else { const d = await res.json(); setGroups(d.groups ?? []); }
      } else {
        const res = await fetch(`/api/provisioning/ad/computers?q=${encodeURIComponent(search)}`);
        if (!res.ok) { setError("Failed to search computers"); setComputers([]); }
        else { const d = await res.json(); setComputers(d.computers ?? []); }
      }
    } catch { setError("Connection failed"); }
    setLoading(false);
  }, [search, subTab]);

  // Load group members
  const loadGroupMembers = useCallback(async (group: AdGroup) => {
    setSelectedGroup(group);
    try {
      const res = await fetch(`/api/provisioning/ad/groups/${encodeURIComponent(group.dn)}`);
      if (res.ok) { const d = await res.json(); setGroupMembers(d.members ?? []); }
    } catch { /* ignore */ }
  }, []);

  // User actions
  const userAction = async (sam: string, action: string) => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/provisioning/ad/users/${encodeURIComponent(sam)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const d = await res.json();
        if (action === "resetPassword" && d.password) setResetPassword(d.password);
        doSearch(); // refresh
      }
    } catch { /* ignore */ }
    setActionLoading("");
  };

  // Computer actions
  const computerAction = async (dn: string, action: string) => {
    setActionLoading(action + dn);
    try {
      const method = action === "delete" ? "DELETE" : "POST";
      const url = `/api/provisioning/ad/computers/${encodeURIComponent(dn)}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ action }) : undefined,
      });
      if (res.ok) doSearch();
    } catch { /* ignore */ }
    setActionLoading("");
  };

  const fmtTime = (s?: string) => { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } };

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-3 mb-4">
        <Users className="w-5 h-5 text-accent" />
        <div className="flex gap-1">
          {(["users", "groups", "computers"] as const).map(t => (
            <button key={t} onClick={() => { setSubTab(t); setSearch(""); setSelectedUser(null); setSelectedGroup(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${subTab === t ? "bg-accent text-white" : "text-text-muted hover:bg-muted"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-lg bg-surface flex-1 max-w-sm ml-2">
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder={`Search ${subTab}… (Enter to search)`}
            className="flex-1 text-sm bg-transparent text-text-primary outline-none" />
        </div>
        <button onClick={doSearch} disabled={loading || !search.trim()}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Search
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Users results */}
      {subTab === "users" && users.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Username</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Display Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Enabled</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Last Logon</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.sAMAccountName} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-text-primary">{u.sAMAccountName}</td>
                  <td className="px-4 py-2 text-text-primary">{u.displayName}</td>
                  <td className="px-4 py-2 text-text-secondary text-xs">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${u.enabled ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {u.enabled ? "Yes" : "No"}
                    </span>
                    {u.locked && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-700 ml-1">Locked</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-text-muted">{fmtTime(u.lastLogon)}</td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => userAction(u.sAMAccountName, "resetPassword")}
                      disabled={actionLoading === "resetPassword"}
                      className="p-1 rounded hover:bg-blue-50 text-text-muted hover:text-blue-600" title="Reset Password">
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => userAction(u.sAMAccountName, u.enabled ? "disable" : "enable")}
                      disabled={!!actionLoading}
                      className="p-1 rounded hover:bg-amber-50 text-text-muted hover:text-amber-600" title={u.enabled ? "Disable" : "Enable"}>
                      {u.enabled ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    {u.locked && (
                      <button onClick={() => userAction(u.sAMAccountName, "unlock")}
                        disabled={!!actionLoading}
                        className="p-1 rounded hover:bg-green-50 text-text-muted hover:text-green-600" title="Unlock">
                        <Unlock className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Groups results */}
      {subTab === "groups" && groups.length > 0 && (
        <div className="flex gap-4">
          <div className="flex-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Group Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Description</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map(g => (
                  <tr key={g.dn} onClick={() => loadGroupMembers(g)}
                    className={`hover:bg-muted/30 cursor-pointer ${selectedGroup?.dn === g.dn ? "bg-accent/5" : ""}`}>
                    <td className="px-4 py-2 text-text-primary font-medium">{g.name}</td>
                    <td className="px-4 py-2 text-text-muted text-xs">{g.description}</td>
                    <td className="px-4 py-2 text-text-secondary">{g.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Group member panel */}
          {selectedGroup && (
            <div className="w-[360px] border border-border rounded-xl p-4 bg-surface">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text-primary">{selectedGroup.name}</h3>
                <button onClick={() => setSelectedGroup(null)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-1">
                {groupMembers.length === 0 ? (
                  <p className="text-xs text-text-muted py-4 text-center">No members</p>
                ) : groupMembers.map(m => (
                  <div key={m.dn} className="flex items-center gap-2 text-sm py-1">
                    <span className="flex-1 text-text-primary">{m.displayName || m.sAMAccountName}</span>
                    <span className="text-[10px] text-text-muted">{m.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Computers results */}
      {subTab === "computers" && computers.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">OS</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Last Logon</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Enabled</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">OU</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {computers.map(c => (
                <tr key={c.dn} className={`hover:bg-muted/30 ${c.stale ? "bg-amber-50/30" : ""}`}>
                  <td className="px-4 py-2 font-mono text-text-primary">
                    {c.name}
                    {c.stale && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">STALE</span>}
                  </td>
                  <td className="px-4 py-2 text-text-secondary text-xs">{c.os ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{fmtTime(c.lastLogon)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${c.enabled ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {c.enabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-muted truncate max-w-[200px]">{c.ou}</td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => computerAction(c.dn, c.enabled ? "disable" : "enable")}
                      disabled={!!actionLoading}
                      className="p-1 rounded hover:bg-amber-50 text-text-muted hover:text-amber-600" title={c.enabled ? "Disable" : "Enable"}>
                      {c.enabled ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    {c.stale && (
                      <button onClick={() => computerAction(c.dn, "delete")}
                        disabled={!!actionLoading}
                        className="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500" title="Delete stale computer">
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

      {/* Empty state */}
      {!loading && ((subTab === "users" && users.length === 0) || (subTab === "groups" && groups.length === 0) || (subTab === "computers" && computers.length === 0)) && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Users className="w-12 h-12 mb-3 opacity-20" />
          <p className="font-medium">Search Active Directory</p>
          <p className="text-xs mt-1">Type a name, username or email and press Enter</p>
        </div>
      )}

      {/* Password reset modal */}
      {resetPassword && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setResetPassword("")}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-primary mb-2">Password Reset</h3>
            <p className="text-xs text-text-muted mb-3">New temporary password (shown only once):</p>
            <div className="px-3 py-2 bg-muted rounded-lg font-mono text-sm text-text-primary select-all mb-4">{resetPassword}</div>
            <p className="text-xs text-amber-600 mb-4">The user must change this password at next logon.</p>
            <button onClick={() => setResetPassword("")} className="w-full px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
