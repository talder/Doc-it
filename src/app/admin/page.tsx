"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Shield, ShieldCheck, Users, Layout, Settings } from "lucide-react";
import type { SanitizedUser, Space, SpaceRole } from "@/lib/types";

type Tab = "users" | "spaces" | "settings";

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

  // SMTP state
  const [smtp, setSmtp] = useState({ host: "", port: 587, secure: false, user: "", pass: "", from: "", adminEmail: "" });
  const [smtpLoaded, setSmtpLoaded] = useState(false);

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
    if (res.ok) await fetchSpaces();
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
            onClick={() => { setTab("settings"); if (!smtpLoaded) fetchSmtp(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "settings" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
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
