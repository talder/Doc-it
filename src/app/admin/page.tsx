"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Shield, ShieldCheck, Users, Layout, Settings, Key, Copy, Check, ClipboardList, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { SanitizedUser, Space, SpaceRole, AuditConfig, AuditEntry } from "@/lib/types";

type Tab = "users" | "spaces" | "service-keys" | "settings" | "audit";

interface ServiceKeyRecord {
  id: string;
  name: string;
  prefix: string;
  permissions: Record<string, SpaceRole>;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

interface AdminUser {
  username: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  createdAt?: string;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-alt" />}>
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<SanitizedUser | null>(null);
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "users");

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", isAdmin: false });

  // Spaces state
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [editingSpace, setEditingSpace] = useState<string | null>(null);
  const [permUser, setPermUser] = useState("");
  const [permRole, setPermRole] = useState<SpaceRole>("reader");

  // Service keys state
  const [serviceKeys, setServiceKeys] = useState<ServiceKeyRecord[]>([]);
  const [svcKeysLoaded, setSvcKeysLoaded] = useState(false);
  const [newSvcKey, setNewSvcKey] = useState({ name: "", expiresAt: "", allSpaces: false, allSpacesRole: "reader" as SpaceRole });
  const [svcKeyPerms, setSvcKeyPerms] = useState<Record<string, SpaceRole>>({});
  const [revealedSvcSecret, setRevealedSvcSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copiedSvcId, setCopiedSvcId] = useState<string | null>(null);
  const [creatingSvc, setCreatingSvc] = useState(false);

  // SMTP state
  const [smtp, setSmtp] = useState({ host: "", port: 587, secure: false, user: "", pass: "", from: "", adminEmail: "" });
  const [smtpLoaded, setSmtpLoaded] = useState(false);

  // Audit state
  const defaultAuditConfig: AuditConfig = {
    enabled: true,
    localFile: { retentionDays: 365 },
    syslog: { enabled: false, host: "", port: 514, protocol: "udp", facility: "local0", appName: "doc-it", hostname: "" },
  };
  const [auditConfig, setAuditConfig] = useState<AuditConfig>(defaultAuditConfig);
  const [auditConfigLoaded, setAuditConfigLoaded] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calData, setCalData] = useState<Record<string, number>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [explorerFilters, setExplorerFilters] = useState({ dateFrom: "", dateTo: "", event: "", actor: "", outcome: "", spaceSlug: "", text: "" });
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerEntries, setExplorerEntries] = useState<AuditEntry[]>([]);
  const [explorerTotal, setExplorerTotal] = useState(0);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [auditTabSection, setAuditTabSection] = useState<"explorer" | "settings">("explorer");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user?.isAdmin) {
          router.replace("/");
          return;
        }
        setCurrentUser(data.user);
      });
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  const fetchSpaces = useCallback(async () => {
    const res = await fetch("/api/spaces");
    if (res.ok) setSpaces(await res.json());
  }, []);

  const fetchSmtp = useCallback(async () => {
    const res = await fetch("/api/settings/smtp");
    if (res.ok) {
      setSmtp(await res.json());
      setSmtpLoaded(true);
    }
  }, []);

  const fetchServiceKeys = useCallback(async () => {
    const res = await fetch("/api/admin/service-keys");
    if (res.ok) {
      const data = await res.json();
      setServiceKeys(data.keys ?? []);
      setSvcKeysLoaded(true);
    }
  }, []);

  const fetchAuditConfig = useCallback(async () => {
    const res = await fetch("/api/settings/audit");
    if (res.ok) {
      setAuditConfig(await res.json());
      setAuditConfigLoaded(true);
    }
  }, []);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    const res = await fetch(`/api/audit/calendar?year=${year}&month=${month}`);
    if (res.ok) {
      const data = await res.json();
      setCalData(data.counts ?? {});
    }
    setCalLoading(false);
  }, []);

  const fetchAuditLogs = useCallback(async (filters: typeof explorerFilters, page: number) => {
    setExplorerLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.event) params.set("event", filters.event);
    if (filters.actor) params.set("actor", filters.actor);
    if (filters.outcome) params.set("outcome", filters.outcome);
    if (filters.spaceSlug) params.set("spaceSlug", filters.spaceSlug);
    if (filters.text) params.set("text", filters.text);
    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const data = await res.json();
      setExplorerEntries(data.entries ?? []);
      setExplorerTotal(data.total ?? 0);
    }
    setExplorerLoading(false);
  }, [explorerFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateServiceKey = async () => {
    const name = newSvcKey.name.trim();
    if (!name) { flash("Key name is required", "error"); return; }
    const permissions: Record<string, SpaceRole> = newSvcKey.allSpaces
      ? { "*": newSvcKey.allSpacesRole }
      : { ...svcKeyPerms };
    if (Object.keys(permissions).length === 0) { flash("Assign at least one space", "error"); return; }
    setCreatingSvc(true);
    const body: Record<string, unknown> = { name, permissions };
    if (newSvcKey.expiresAt) body.expiresAt = new Date(newSvcKey.expiresAt).toISOString();
    const res = await fetch("/api/admin/service-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setCreatingSvc(false);
    if (res.ok) {
      const data = await res.json();
      setRevealedSvcSecret({ id: data.key.id, secret: data.secret });
      setNewSvcKey({ name: "", expiresAt: "", allSpaces: false, allSpacesRole: "reader" });
      setSvcKeyPerms({});
      fetchServiceKeys();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to create service key", "error");
    }
  };

  const handleRevokeServiceKey = async (id: string) => {
    if (!confirm("Revoke this service key? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/service-keys/${id}`, { method: "DELETE" });
    if (res.ok) { fetchServiceKeys(); if (revealedSvcSecret?.id === id) setRevealedSvcSecret(null); }
    else flash("Failed to revoke service key", "error");
  };

  const copySvcSecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSvcId(id);
    setTimeout(() => setCopiedSvcId(null), 2000);
  };

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
      fetchSpaces();
    }
  }, [currentUser, fetchUsers, fetchSpaces]);

  useEffect(() => {
    setAllUsers(users);
  }, [users]);

  const flash = (msg: string, type: "error" | "success") => {
    if (type === "error") { setError(msg); setSuccess(""); }
    else { setSuccess(msg); setError(""); }
    setTimeout(() => { setError(""); setSuccess(""); }, 3000);
  };

  // === User actions ===

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) return;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      flash(`User "${newUser.username}" created`, "success");
      setNewUser({ username: "", password: "", isAdmin: false });
      setShowCreateUser(false);
      await fetchUsers();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to create user", "error");
    }
  };

  const handleToggleAdmin = async (username: string, currentlyAdmin: boolean) => {
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: !currentlyAdmin }),
    });
    if (res.ok) {
      flash(`${username} is now ${!currentlyAdmin ? "an admin" : "a regular user"}`, "success");
      await fetchUsers();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to update user", "error");
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    if (res.ok) {
      flash(`User "${username}" deleted`, "success");
      await fetchUsers();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to delete user", "error");
    }
  };

  // === Space actions ===

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSpaceName.trim() }),
    });
    if (res.ok) {
      flash(`Space "${newSpaceName}" created`, "success");
      setNewSpaceName("");
      setShowCreateSpace(false);
      await fetchSpaces();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to create space", "error");
    }
  };

  const handleDeleteSpace = async (slug: string, name: string) => {
    if (!confirm(`Delete space "${name}"? Documents will remain on disk but the space config will be removed.`)) return;
    const res = await fetch(`/api/spaces/${slug}`, { method: "DELETE" });
    if (res.ok) {
      flash(`Space "${name}" deleted`, "success");
      await fetchSpaces();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to delete space", "error");
    }
  };

  const handleAddPermission = async (spaceSlug: string) => {
    if (!permUser.trim()) return;
    const space = spaces.find((s) => s.slug === spaceSlug);
    if (!space) return;

    const newPerms = { ...space.permissions, [permUser.trim()]: permRole };
    const res = await fetch(`/api/spaces/${spaceSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    if (res.ok) {
      flash(`Added ${permUser} as ${permRole}`, "success");
      setPermUser("");
      await fetchSpaces();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to update permissions", "error");
    }
  };

  const handleRemovePermission = async (spaceSlug: string, username: string) => {
    const space = spaces.find((s) => s.slug === spaceSlug);
    if (!space) return;
    const newPerms = { ...space.permissions };
    delete newPerms[username];
    const res = await fetch(`/api/spaces/${spaceSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    if (res.ok) {
      flash(`Removed ${username} from space`, "success");
      await fetchSpaces();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to remove permission", "error");
    }
  };

  const handleChangeRole = async (spaceSlug: string, username: string, role: SpaceRole) => {
    const space = spaces.find((s) => s.slug === spaceSlug);
    if (!space) return;
    const newPerms = { ...space.permissions, [username]: role };
    const res = await fetch(`/api/spaces/${spaceSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    if (res.ok) {
      await fetchSpaces();
    } else {
      const data = await res.json().catch(() => ({}));
      flash(data.error || `Failed to change role for ${username}`, "error");
    }
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-muted-hover text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-text-primary">Administration</h1>
        </div>

        {/* Feedback */}
        {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
        {success && <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{success}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "users" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setTab("spaces")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "spaces" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <Layout className="w-4 h-4" />
            Spaces
          </button>
          <button
            onClick={() => { setTab("service-keys"); if (!svcKeysLoaded) fetchServiceKeys(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "service-keys" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <Key className="w-4 h-4" />
            Service Keys
          </button>
          <button
            onClick={() => { setTab("settings"); if (!smtpLoaded) fetchSmtp(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "settings" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => {
              setTab("audit");
              if (!auditConfigLoaded) fetchAuditConfig();
              fetchCalendar(calYear, calMonth);
              fetchAuditLogs(explorerFilters, 1);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "audit" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Audit
          </button>
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="bg-surface rounded-xl shadow-sm border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Users</h2>
              <button
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>

            {showCreateUser && (
              <div className="px-6 py-4 bg-gray-50 border-b border-border">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="username"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 pb-1">
                    <input
                      type="checkbox"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                      className="rounded"
                    />
                    Admin
                  </label>
                  <button
                    onClick={handleCreateUser}
                    className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-blue-700"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreateUser(false)}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.username} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-sm font-medium">
                      {u.username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{u.username}</span>
                        {u.isSuperAdmin && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">Owner</span>
                        )}
                        {u.isAdmin && !u.isSuperAdmin && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-accent-light text-accent-text rounded">Admin</span>
                        )}
                      </div>
                      {u.createdAt && (
                        <span className="text-xs text-text-muted">Created {new Date(u.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {!u.isSuperAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAdmin(u.username, u.isAdmin)}
                        className="p-1.5 rounded-lg hover:bg-muted text-gray-400 hover:text-gray-600 transition-colors"
                        title={u.isAdmin ? "Remove admin" : "Make admin"}
                      >
                        {u.isAdmin ? <ShieldCheck className="w-4 h-4 text-blue-500" /> : <Shield className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.username)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spaces Tab */}
        {tab === "spaces" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Spaces</h2>
              <button
                onClick={() => setShowCreateSpace(!showCreateSpace)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Space
              </button>
            </div>

            {showCreateSpace && (
              <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Space Name</label>
                    <input
                      type="text"
                      value={newSpaceName}
                      onChange={(e) => setNewSpaceName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateSpace()}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="My Space"
                      autoFocus
                    />
                  </div>
                  <button onClick={handleCreateSpace} className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-blue-700">
                    Create
                  </button>
                  <button onClick={() => setShowCreateSpace(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-text-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {spaces.map((space) => (
              <div key={space.slug} className="bg-surface rounded-xl shadow-sm border border-border">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h3 className="font-semibold text-text-primary">{space.name}</h3>
                    <span className="text-xs text-text-muted">/{space.slug}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingSpace(editingSpace === space.slug ? null : space.slug)}
                      className="px-3 py-1.5 text-sm text-accent hover:bg-accent-light rounded-lg transition-colors"
                    >
                      {editingSpace === space.slug ? "Done" : "Permissions"}
                    </button>
                    <button
                      onClick={() => handleDeleteSpace(space.slug, space.name)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete space"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Permission list (always shown) */}
                <div className="divide-y divide-gray-50">
                  {Object.entries(space.permissions).map(([username, role]) => (
                    <div key={username} className="flex items-center justify-between px-6 py-2.5">
                      <span className="text-sm text-text-secondary">{username}</span>
                      <div className="flex items-center gap-2">
                        {editingSpace === space.slug ? (
                          <>
                            <select
                              value={role}
                              onChange={(e) => handleChangeRole(space.slug, username, e.target.value as SpaceRole)}
                              className="text-xs border border-gray-200 rounded px-2 py-1"
                            >
                              <option value="admin">Admin</option>
                              <option value="writer">Writer</option>
                              <option value="reader">Reader</option>
                            </select>
                            <button
                              onClick={() => handleRemovePermission(space.slug, username)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                            role === "admin" ? "bg-accent-light text-blue-700" :
                            role === "writer" ? "bg-green-100 text-green-700" :
                            "bg-gray-100 text-text-secondary"
                          }`}>
                            {role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add permission form */}
                {editingSpace === space.slug && (
                  <div className="px-6 py-3 bg-gray-50 border-t border-border">
                    <div className="flex gap-2 items-center">
                      <select
                        value={permUser}
                        onChange={(e) => setPermUser(e.target.value)}
                        className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5"
                      >
                        <option value="">Select user...</option>
                        {allUsers
                          .filter((u) => !space.permissions[u.username])
                          .map((u) => (
                            <option key={u.username} value={u.username}>{u.username}</option>
                          ))}
                      </select>
                      <select
                        value={permRole}
                        onChange={(e) => setPermRole(e.target.value as SpaceRole)}
                        className="text-sm border border-border rounded-lg px-3 py-1.5"
                      >
                        <option value="reader">Reader</option>
                        <option value="writer">Writer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => handleAddPermission(space.slug)}
                        className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Service Keys Tab */}
        {tab === "service-keys" && (
          <div className="space-y-6">
            {/* Revealed secret banner */}
            {revealedSvcSecret && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-1">
                <p className="text-xs font-semibold text-green-800">Copy the service key now — it won&apos;t be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-green-900 break-all flex-1">{revealedSvcSecret.secret}</code>
                  <button
                    onClick={() => copySvcSecret(revealedSvcSecret.id, revealedSvcSecret.secret)}
                    className="shrink-0 p-1.5 rounded hover:bg-green-100 text-green-700 transition-colors"
                    title="Copy"
                  >
                    {copiedSvcId === revealedSvcSecret.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button onClick={() => setRevealedSvcSecret(null)} className="text-xs text-green-700 underline hover:no-underline">Dismiss</button>
              </div>
            )}

            {/* Existing keys list */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-text-primary">Service Keys</h2>
                <p className="text-xs text-text-muted mt-0.5">Machine-to-machine keys with explicit space permissions. Not tied to any user account.</p>
              </div>
              {serviceKeys.length === 0 ? (
                <p className="px-6 py-4 text-sm text-text-muted">No service keys yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {serviceKeys.map((k) => (
                    <div key={k.id} className="flex items-start gap-3 px-6 py-4">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium text-text-primary">{k.name}</p>
                        <p className="text-xs text-text-muted font-mono">{k.prefix}…</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(k.permissions).map(([slug, role]) => (
                            <span key={slug} className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              role === "admin" ? "bg-accent-light text-blue-700" :
                              role === "writer" ? "bg-green-100 text-green-700" :
                              "bg-gray-100 text-text-secondary"
                            }`}>
                              {slug === "*" ? "All spaces" : slug}: {role}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-text-muted">
                          Created {new Date(k.createdAt).toLocaleDateString()} by {k.createdBy}
                          {k.expiresAt && <> · Expires {new Date(k.expiresAt).toLocaleDateString()}</>}
                          {k.lastUsedAt && <> · Last used {new Date(k.lastUsedAt).toLocaleDateString()}</>}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokeServiceKey(k.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-text-muted hover:text-red-600 transition-colors"
                        title="Revoke"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create form */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-base font-semibold text-text-primary">Create Service Key</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={newSvcKey.name}
                      onChange={(e) => setNewSvcKey({ ...newSvcKey, name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                      placeholder="e.g. Deploy bot"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Expiry (optional)</label>
                    <input
                      type="date"
                      value={newSvcKey.expiresAt}
                      onChange={(e) => setNewSvcKey({ ...newSvcKey, expiresAt: e.target.value })}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-36 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                </div>

                {/* Space assignment */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Space Permissions</label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <input
                      type="checkbox"
                      checked={newSvcKey.allSpaces}
                      onChange={(e) => setNewSvcKey({ ...newSvcKey, allSpaces: e.target.checked })}
                      className="rounded"
                    />
                    All spaces (wildcard)
                    {newSvcKey.allSpaces && (
                      <select
                        value={newSvcKey.allSpacesRole}
                        onChange={(e) => setNewSvcKey({ ...newSvcKey, allSpacesRole: e.target.value as SpaceRole })}
                        className="ml-2 text-xs border border-border rounded px-2 py-1"
                      >
                        <option value="reader">Reader</option>
                        <option value="writer">Writer</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </label>

                  {!newSvcKey.allSpaces && (
                    <div className="space-y-2">
                      {spaces.map((s) => (
                        <div key={s.slug} className="flex items-center gap-3">
                          <span className="text-sm text-text-primary w-32 truncate">{s.name}</span>
                          <select
                            value={svcKeyPerms[s.slug] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSvcKeyPerms((p) => {
                                const next = { ...p };
                                if (v) next[s.slug] = v as SpaceRole;
                                else delete next[s.slug];
                                return next;
                              });
                            }}
                            className="text-xs border border-border rounded px-2 py-1"
                          >
                            <option value="">No access</option>
                            <option value="reader">Reader</option>
                            <option value="writer">Writer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      ))}
                      {spaces.length === 0 && <p className="text-xs text-text-muted">No spaces available.</p>}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleCreateServiceKey}
                  disabled={creatingSvc}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {creatingSvc ? "Creating…" : "Create service key"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {tab === "audit" && (
          <div className="space-y-6">

            {/* Sub-section toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setAuditTabSection("explorer")}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  auditTabSection === "explorer" ? "bg-accent text-white" : "bg-surface border border-border text-text-secondary hover:bg-muted"
                }`}
              >Event Explorer</button>
              <button
                onClick={() => { setAuditTabSection("settings"); if (!auditConfigLoaded) fetchAuditConfig(); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  auditTabSection === "settings" ? "bg-accent text-white" : "bg-surface border border-border text-text-secondary hover:bg-muted"
                }`}
              >Settings</button>
            </div>

            {auditTabSection === "settings" && (
              <div className="bg-surface rounded-xl shadow-sm border border-border">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-lg font-semibold text-text-primary">Audit Logging</h2>
                  <p className="text-xs text-text-muted mt-1">Local JSONL logging is always active. Syslog is an optional additional forward target.</p>
                </div>
                <div className="px-6 py-4 space-y-5">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={auditConfig.enabled} onChange={(e) => setAuditConfig({ ...auditConfig, enabled: e.target.checked })} className="rounded" />
                    <span className="text-sm font-medium text-text-primary">Enable audit logging (master switch)</span>
                  </label>
                  <div className="max-w-xs">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Log retention (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={auditConfig.localFile.retentionDays}
                      onChange={(e) => setAuditConfig({ ...auditConfig, localFile: { retentionDays: parseInt(e.target.value) || 365 } })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-text-muted mt-1">Local log files older than this are automatically deleted.</p>
                  </div>

                  {/* Syslog */}
                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={auditConfig.syslog.enabled} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, enabled: e.target.checked } })} className="rounded" />
                      <span className="text-sm font-medium text-text-primary">Forward to syslog server (additional transport)</span>
                    </label>
                    {auditConfig.syslog.enabled && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Syslog Host</label>
                            <input type="text" value={auditConfig.syslog.host} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, host: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="syslog.example.com" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                            <input type="number" value={auditConfig.syslog.port} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, port: parseInt(e.target.value) || 514 } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Protocol</label>
                            <select value={auditConfig.syslog.protocol} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, protocol: e.target.value as "udp" | "tcp" } })} className="w-full text-sm border border-border rounded-lg px-3 py-1.5">
                              <option value="udp">UDP</option>
                              <option value="tcp">TCP</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                            <select value={auditConfig.syslog.facility} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, facility: e.target.value } })} className="w-full text-sm border border-border rounded-lg px-3 py-1.5">
                              {["kern","user","mail","daemon","auth","syslog","local0","local1","local2","local3","local4","local5","local6","local7"].map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">App Name</label>
                            <input type="text" value={auditConfig.syslog.appName} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, appName: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="doc-it" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Hostname override (optional)</label>
                          <input type="text" value={auditConfig.syslog.hostname} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, hostname: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="auto-detected from OS" />
                        </div>
                        <p className="text-xs text-text-muted">Compatible with VictoriaLogs, Graylog, Splunk, rsyslog, syslog-ng, Elastic, Datadog, Papertrail and any RFC 5424 receiver.</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      const res = await fetch("/api/settings/audit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auditConfig) });
                      if (res.ok) flash("Audit settings saved", "success");
                      else { const d = await res.json(); flash(d.error || "Failed to save audit settings", "error"); }
                    }}
                    className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                  >
                    Save Audit Settings
                  </button>
                </div>
              </div>
            )}

            {auditTabSection === "explorer" && (
              <>
                {/* Calendar */}
                <div className="bg-surface rounded-xl shadow-sm border border-border">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-text-primary">Activity Calendar</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { const d = new Date(calYear, calMonth - 2); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); fetchCalendar(d.getFullYear(), d.getMonth() + 1); }} className="p-1 rounded hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
                      <span className="text-sm font-medium w-28 text-center">{new Date(calYear, calMonth - 1).toLocaleString("default", { month: "long", year: "numeric" })}</span>
                      <button onClick={() => { const d = new Date(calYear, calMonth); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); fetchCalendar(d.getFullYear(), d.getMonth() + 1); }} className="p-1 rounded hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    {calLoading ? (
                      <p className="text-sm text-text-muted">Loading…</p>
                    ) : (
                      <AuditCalendar year={calYear} month={calMonth} counts={calData} onDayClick={(d) => {
                        const newF = { ...explorerFilters, dateFrom: d, dateTo: d };
                        setExplorerFilters(newF);
                        setExplorerPage(1);
                        fetchAuditLogs(newF, 1);
                      }} />
                    )}
                  </div>
                </div>

                {/* Explorer */}
                <div className="bg-surface rounded-xl shadow-sm border border-border">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-text-primary">Event Explorer</h2>
                    <div className="flex items-center gap-2">
                      <a href={`/api/audit?export=csv&${new URLSearchParams(Object.fromEntries(Object.entries(explorerFilters).filter(([,v]) => v)))}`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" download>
                        <Download className="w-3.5 h-3.5" /> CSV
                      </a>
                      <a href={`/api/audit?export=json&${new URLSearchParams(Object.fromEntries(Object.entries(explorerFilters).filter(([,v]) => v)))}`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" download>
                        <Download className="w-3.5 h-3.5" /> JSON
                      </a>
                    </div>
                  </div>
                  {/* Filters */}
                  <div className="px-6 py-3 border-b border-border bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      <input type="date" value={explorerFilters.dateFrom} onChange={(e) => setExplorerFilters({ ...explorerFilters, dateFrom: e.target.value })} className="px-2 py-1 text-xs border border-border rounded-lg" placeholder="From" />
                      <input type="date" value={explorerFilters.dateTo} onChange={(e) => setExplorerFilters({ ...explorerFilters, dateTo: e.target.value })} className="px-2 py-1 text-xs border border-border rounded-lg" />
                      <select value={explorerFilters.event} onChange={(e) => setExplorerFilters({ ...explorerFilters, event: e.target.value })} className="px-2 py-1 text-xs border border-border rounded-lg">
                        <option value="">All events</option>
                        <optgroup label="Auth">
                          {["auth.login","auth.login.failed","auth.logout","auth.register","auth.setup"].map(e => <option key={e} value={e}>{e}</option>)}
                        </optgroup>
                        <optgroup label="Users">
                          {["user.create","user.update","user.delete"].map(e => <option key={e} value={e}>{e}</option>)}
                        </optgroup>
                        <optgroup label="Spaces">
                          {["space.create","space.update","space.delete"].map(e => <option key={e} value={e}>{e}</option>)}
                        </optgroup>
                        <optgroup label="Documents">
                          {["document.read","document.create","document.update","document.delete","document.archive","document.unarchive","document.move","document.rename","document.status.change","document.history.restore"].map(e => <option key={e} value={e}>{e}</option>)}
                        </optgroup>
                        <optgroup label="Keys &amp; Settings">
                          {["api_key.create","api_key.revoke","service_key.create","service_key.revoke","settings.update","access.denied"].map(e => <option key={e} value={e}>{e}</option>)}
                        </optgroup>
                      </select>
                      <select value={explorerFilters.outcome} onChange={(e) => setExplorerFilters({ ...explorerFilters, outcome: e.target.value })} className="px-2 py-1 text-xs border border-border rounded-lg">
                        <option value="">All outcomes</option>
                        <option value="success">Success</option>
                        <option value="failure">Failure</option>
                      </select>
                      <input type="text" value={explorerFilters.actor} onChange={(e) => setExplorerFilters({ ...explorerFilters, actor: e.target.value })} placeholder="Actor…" className="px-2 py-1 text-xs border border-border rounded-lg w-28" />
                      <input type="text" value={explorerFilters.text} onChange={(e) => setExplorerFilters({ ...explorerFilters, text: e.target.value })} placeholder="Search…" className="px-2 py-1 text-xs border border-border rounded-lg w-32" />
                      <button onClick={() => { setExplorerPage(1); fetchAuditLogs(explorerFilters, 1); }} className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover">Search</button>
                      <button onClick={() => { const f = { dateFrom: "", dateTo: "", event: "", actor: "", outcome: "", spaceSlug: "", text: "" }; setExplorerFilters(f); setExplorerPage(1); fetchAuditLogs(f, 1); }} className="px-3 py-1 text-xs text-text-muted hover:text-text-secondary">Clear</button>
                    </div>
                  </div>
                  {/* Results */}
                  <div className="overflow-x-auto">
                    {explorerLoading ? (
                      <p className="px-6 py-4 text-sm text-text-muted">Loading…</p>
                    ) : explorerEntries.length === 0 ? (
                      <p className="px-6 py-4 text-sm text-text-muted">No events found.</p>
                    ) : (
                      <table className="audit-explorer-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Event</th>
                            <th>Outcome</th>
                            <th>Actor</th>
                            <th>Space</th>
                            <th>Resource</th>
                          </tr>
                        </thead>
                        <tbody>
                          {explorerEntries.map((e) => (
                            <tr key={e.eventId}>
                              <td className="text-text-muted whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                              <td><span className="font-mono text-xs">{e.event}</span></td>
                              <td><span className={`audit-outcome-badge ${e.outcome === "success" ? "audit-outcome-success" : "audit-outcome-failure"}`}>{e.outcome}</span></td>
                              <td className="font-medium">{e.actor}</td>
                              <td className="text-text-muted">{e.spaceSlug ?? "—"}</td>
                              <td className="text-text-muted truncate max-w-[200px]">{e.resource ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Pagination */}
                  {explorerTotal > 50 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                      <p className="text-xs text-text-muted">{explorerTotal} total events</p>
                      <div className="flex items-center gap-2">
                        <button disabled={explorerPage <= 1} onClick={() => { const p = explorerPage - 1; setExplorerPage(p); fetchAuditLogs(explorerFilters, p); }} className="px-3 py-1 text-xs border border-border rounded disabled:opacity-40">Previous</button>
                        <span className="text-xs text-text-muted">Page {explorerPage} of {Math.ceil(explorerTotal / 50)}</span>
                        <button disabled={explorerPage >= Math.ceil(explorerTotal / 50)} onClick={() => { const p = explorerPage + 1; setExplorerPage(p); fetchAuditLogs(explorerFilters, p); }} className="px-3 py-1 text-xs border border-border rounded disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (
          <div className="bg-surface rounded-xl shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">SMTP / Email Settings</h2>
              <p className="text-xs text-text-muted mt-1">Configure email delivery for notifications</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                  <input
                    type="number"
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: parseInt(e.target.value) || 587 })}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={smtp.secure}
                  onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
                  className="rounded"
                />
                Use TLS/SSL (port 465)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    value={smtp.user}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <input
                    type="password"
                    value={smtp.pass}
                    onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Address</label>
                <input
                  type="text"
                  value={smtp.from}
                  onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Doc-it <noreply@example.com>"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Admin Notification Email</label>
                <input
                  type="email"
                  value={smtp.adminEmail}
                  onChange={(e) => setSmtp({ ...smtp, adminEmail: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@example.com"
                />
                <p className="text-xs text-text-muted mt-1">Receives notifications when new users register</p>
              </div>
              <div className="pt-2">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/settings/smtp", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(smtp),
                    });
    if (res.ok) flash("SMTP settings saved", "success");
                    else flash("Failed to save SMTP settings", "error");
                  }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Audit Calendar Component ─────────────────────────────────────────────────

function AuditCalendar({
  year, month, counts, onDayClick,
}: {
  year: number;
  month: number;
  counts: Record<string, number>;
  onDayClick: (dateStr: string) => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  // JS: 0=Sun, 1=Mon ... shift so Mon=0
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function densityClass(count: number): string {
    if (count === 0) return "audit-cal-day-zero";
    if (count <= 5) return "audit-cal-day-low";
    if (count <= 20) return "audit-cal-day-mid";
    return "audit-cal-day-high";
  }

  return (
    <div>
      <div className="audit-cal-grid">
        {dayLabels.map((d) => (
          <div key={d} className="audit-cal-header">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="audit-cal-empty" />;
          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const count = counts[dateStr] ?? 0;
          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              title={count > 0 ? `${count} events` : "No events"}
              className={`audit-cal-day ${densityClass(count)}`}
            >
              <span className="audit-cal-day-num">{day}</span>
              {count > 0 && <span className="audit-cal-day-count">{count}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm audit-cal-day-zero inline-block" /> 0</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm audit-cal-day-low inline-block" /> 1–5</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm audit-cal-day-mid inline-block" /> 6–20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm audit-cal-day-high inline-block" /> 21+</span>
      </div>
    </div>
  );
}
