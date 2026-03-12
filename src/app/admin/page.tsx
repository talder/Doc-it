"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Shield, ShieldCheck, Users, Layout, Settings, Key, Copy, Check, ClipboardList, ChevronLeft, ChevronRight, Download, Lock, LockOpen, ChevronDown, ChevronUp, ShieldOff, HardDrive, RefreshCw, PlayCircle, XCircle, RotateCcw, Eye, EyeOff, UsersRound, X, Network } from "lucide-react";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { isPasswordValid } from "@/lib/password-policy";
import type { SanitizedUser, Space, SpaceRole, AuditConfig, AuditEntry, UserGroup, AdConfig, AdGroupMapping, DashboardAccessConfig } from "@/lib/types";
type Tab = "users" | "spaces" | "service-keys" | "groups" | "settings" | "audit" | "backup";

interface BackupEntry { filename: string; sizeBytes: number; createdAt: string; }
interface BackupTargetForm { id: string; type: "local" | "cifs" | "sftp"; label: string; path: string; host: string; port: number; share: string; remotePath: string; username: string; password: string; privateKey: string; }
const EMPTY_TARGET = (): BackupTargetForm => ({ id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2), type: "local", label: "", path: "", host: "", port: 22, share: "", remotePath: "", username: "", password: "", privateKey: "" });

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
  isLocked?: boolean;
  failedLoginAttempts?: number;
  lockedAt?: string;
  authSource?: "local" | "ad";
  adUsername?: string | null;
  fullName?: string | null;
  email?: string | null;
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

  // Per-user expanded space panel
  const [expandedUserSpaces, setExpandedUserSpaces] = useState<string | null>(null);
  const [userSpacePermUser, setUserSpacePermUser] = useState("");
  const [userSpacePermRole, setUserSpacePermRole] = useState<SpaceRole>("reader");

  // Audit auth gate
  const [auditConfirmed, setAuditConfirmed] = useState(false);
  const [auditPassword, setAuditPassword] = useState("");
  const [auditPasswordError, setAuditPasswordError] = useState("");
  const [auditPasswordLoading, setAuditPasswordLoading] = useState(false);

  // SMTP state
  const [smtp, setSmtp] = useState({ host: "", port: 587, secure: false, user: "", pass: "", from: "", adminEmail: "" });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);

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
  const [chainVerifying, setChainVerifying] = useState(false);
  const [chainResult, setChainResult] = useState<{ ok: boolean; totalEntries: number; brokenLinks: { file: string; lineNum: number; eventId: string; reason: string }[] } | null>(null);

  // Backup state
  const [backupConfig, setBackupConfig] = useState({ enabled: false, schedule: "manual" as "manual"|"daily"|"weekly", scheduleTime: "02:00", scheduleDayOfWeek: 1, retentionCount: 14, targets: [] as BackupTargetForm[] });
  const [backupLoaded, setBackupLoaded] = useState(false);
  const [backupList, setBackupList] = useState<BackupEntry[]>([]);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [newTarget, setNewTarget] = useState<BackupTargetForm>(EMPTY_TARGET());
  const [showNewTarget, setShowNewTarget] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  // Storage settings state
  const [storageConfig, setStorageConfig] = useState<{ storageRoot: string | null; effectiveRoot: string; paths: Record<string, string> }>({
    storageRoot: null, effectiveRoot: "", paths: {},
  });
  const [storageInput, setStorageInput] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);

  // Changelog settings state
  const [changelogSettings, setChangelogSettings] = useState({ retentionYears: 5 });
  const [changelogSettingsLoaded, setChangelogSettingsLoaded] = useState(false);

  // Active Directory settings state
  const defaultAdConfig: Omit<AdConfig, "bindPasswordEncrypted"> & { bindPasswordSet?: boolean; bindPassword?: string } = {
    enabled: false, host: "", port: 389, ssl: false, tlsRejectUnauthorized: true,
    bindDn: "", baseDn: "", userSearchBase: "",
    allowedGroups: [], allowedUsers: [], groupMappings: [],
  };
  const [adConfig, setAdConfig] = useState(defaultAdConfig);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adBindPassword, setAdBindPassword] = useState("");
  const [adTestResult, setAdTestResult] = useState<{ success: boolean; info?: string; error?: string } | null>(null);
  const [adTesting, setAdTesting] = useState(false);
  const [adSaving, setAdSaving] = useState(false);
  // AD form helpers
  const [newAllowedGroup, setNewAllowedGroup] = useState("");
  const [newAllowedUser, setNewAllowedUser] = useState("");
  const [newMappingGroupDn, setNewMappingGroupDn] = useState("");
  const [newMappingSpaceSlug, setNewMappingSpaceSlug] = useState("");
  const [newMappingRole, setNewMappingRole] = useState<SpaceRole>("reader");

  // AD domain (from public config, for display in user list)
  const [adDomainDisplay, setAdDomainDisplay] = useState("");
  useEffect(() => {
    fetch("/api/auth/config").then(r => r.json()).then(d => { if (d.adDomain) setAdDomainDisplay(d.adDomain); }).catch(() => {});
  }, []);

  // Encryption key state
  const [keyFingerprint, setKeyFingerprint] = useState("");
  const [keyRevealed, setKeyRevealed] = useState<string | null>(null);
  const [keyRotating, setKeyRotating] = useState(false);
  const [keyRotationResult, setKeyRotationResult] = useState<{ newKey: string; summary: string } | null>(null);

  // User groups state
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [groupMemberInput, setGroupMemberInput] = useState("");

  // Dashboard access state
  const [dashAccess, setDashAccess] = useState<DashboardAccessConfig>({ allowedUsers: [], allowedAdGroups: [] });
  const [dashAccessLoaded, setDashAccessLoaded] = useState(false);
  const [newDashUser, setNewDashUser] = useState("");
  const [newDashAdGroup, setNewDashAdGroup] = useState("");

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

  const fetchBackup = useCallback(async () => {
    const res = await fetch("/api/admin/backup");
    if (res.ok) {
      const data = await res.json();
      setBackupConfig(data.config);
      setBackupList(data.backups ?? []);
      setBackupLoaded(true);
    }
  }, []);

  const fetchKeyInfo = useCallback(async () => {
    const res = await fetch("/api/admin/security");
    if (res.ok) {
      const data = await res.json();
      setKeyFingerprint(data.fingerprint ?? "");
    }
  }, []);

  const fetchStorageConfig = useCallback(async () => {
    const res = await fetch("/api/settings/storage");
    if (res.ok) {
      const data = await res.json();
      setStorageConfig(data);
      setStorageInput(data.storageRoot ?? "");
      setStorageLoaded(true);
    }
  }, []);

  const fetchChangelogSettings = useCallback(async () => {
    const res = await fetch("/api/settings/changelog");
    if (res.ok) {
      setChangelogSettings(await res.json());
      setChangelogSettingsLoaded(true);
    }
  }, []);

  const fetchAdConfig = useCallback(async () => {
    const res = await fetch("/api/settings/ad");
    if (res.ok) {
      const data = await res.json();
      setAdConfig(data);
      setAdLoaded(true);
    }
  }, []);

  const fetchUserGroups = useCallback(async () => {
    const res = await fetch("/api/admin/user-groups");
    if (res.ok) {
      const data = await res.json();
      setUserGroups(data.groups ?? []);
      setGroupsLoaded(true);
    }
  }, []);

  const fetchDashboardAccess = useCallback(async () => {
    const res = await fetch("/api/admin/dashboard-access");
    if (res.ok) {
      setDashAccess(await res.json());
      setDashAccessLoaded(true);
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
      // Check if audit tab is already confirmed (e.g. from a previous visit)
      fetch("/api/auth/confirm-password")
        .then((r) => r.json())
        .then((d) => { if (d.confirmed) setAuditConfirmed(true); })
        .catch(() => {});
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

  const handleUnlockUser = async (username: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlock: true }),
    });
    if (res.ok) {
      flash(`${username} has been unlocked`, "success");
      await fetchUsers();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to unlock user", "error");
    }
  };

  const handleConfirmAuditPassword = async () => {
    setAuditPasswordLoading(true);
    setAuditPasswordError("");
    const res = await fetch("/api/auth/confirm-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: auditPassword }),
    });
    setAuditPasswordLoading(false);
    if (res.ok) {
      setAuditConfirmed(true);
      setAuditPassword("");
      fetchAuditConfig();
      fetchCalendar(calYear, calMonth);
      fetchAuditLogs(explorerFilters, 1);
    } else {
      const d = await res.json();
      setAuditPasswordError(d.error || "Incorrect password");
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
            onClick={() => { setTab("groups"); if (!groupsLoaded) fetchUserGroups(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "groups" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <UsersRound className="w-4 h-4" />
            Groups
          </button>
          <button
            onClick={() => { setTab("settings"); if (!smtpLoaded) fetchSmtp(); fetchKeyInfo(); if (!storageLoaded) fetchStorageConfig(); if (!changelogSettingsLoaded) fetchChangelogSettings(); if (!adLoaded) fetchAdConfig(); if (!dashAccessLoaded) fetchDashboardAccess(); }}
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
              if (auditConfirmed) {
                if (!auditConfigLoaded) fetchAuditConfig();
                fetchCalendar(calYear, calMonth);
                fetchAuditLogs(explorerFilters, 1);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "audit" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Audit
          </button>
          <button
            onClick={() => { setTab("backup"); if (!backupLoaded) fetchBackup(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "backup" ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Backup
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
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="username"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                {newUser.password && (
                  <div className="mb-3">
                    <PasswordStrengthMeter
                      password={newUser.password}
                      context={{ username: newUser.username }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                      className="rounded"
                    />
                    Admin
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={handleCreateUser}
                      disabled={!isPasswordValid(newUser.password, { username: newUser.username }) || !newUser.username}
                      className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
              </div>
            )}

            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-2.5 border-b border-border bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>User</span>
              <span className="w-48 text-left">Spaces</span>
              <span className="w-28 text-right">Actions</span>
            </div>

            <div className="divide-y divide-gray-100">
              {users.map((u) => {
                const isAd = u.authSource === "ad";
                const initials = (u.fullName || u.username).split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                const userSpaces = spaces.filter((s) => s.permissions[u.username]);
                return (
                <div key={u.username}>
                  <div className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-3">
                    {/* User info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full relative flex items-center justify-center text-xs font-semibold text-white overflow-hidden flex-shrink-0 ${isAd ? "bg-blue-500" : "bg-violet-500"}`}>
                        <span>{initials}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/auth/avatar/${encodeURIComponent(u.username)}`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover rounded-full"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text-primary">
                            {u.fullName || u.username}
                          </span>
                          {u.fullName && (
                            <span className="text-xs text-text-muted">{u.username}</span>
                          )}
                          {u.isSuperAdmin && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">Owner</span>
                          )}
                          {u.isAdmin && !u.isSuperAdmin && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-accent-light text-accent-text rounded">Admin</span>
                          )}
                          {isAd ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded flex items-center gap-0.5">
                              <Network className="w-2.5 h-2.5" />
                              {adDomainDisplay || "Domain"}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">Local</span>
                          )}
                          {u.isLocked && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {u.createdAt && (
                            <span className="text-xs text-text-muted">Created {new Date(u.createdAt).toLocaleDateString()}</span>
                          )}
                          {u.email && (
                            <span className="text-xs text-text-muted">{u.email}</span>
                          )}
                        </div>
                        {u.isLocked && u.lockedAt && (
                          <span className="text-xs text-red-500 block">Locked {new Date(u.lockedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    {/* Spaces column */}
                    <div className="w-48 flex flex-wrap gap-1">
                      {u.isAdmin ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-600 rounded-md">All spaces</span>
                      ) : userSpaces.length === 0 ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-50 text-red-500 rounded-md">No spaces</span>
                      ) : (
                        userSpaces.map((s) => (
                          <span key={s.slug} className={`px-2 py-0.5 text-xs font-medium rounded-md ${
                            s.permissions[u.username] === "admin" ? "bg-purple-50 text-purple-600" :
                            s.permissions[u.username] === "writer" ? "bg-green-50 text-green-600" :
                            "bg-blue-50 text-blue-600"
                          }`}>{s.name}</span>
                        ))
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-28 flex items-center justify-end gap-1">
                      {/* Space access toggle */}
                      <button
                        onClick={() => { setExpandedUserSpaces(expandedUserSpaces === u.username ? null : u.username); setUserSpacePermUser(""); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-gray-400 hover:text-gray-600 transition-colors"
                        title="Manage space access"
                      >
                        {expandedUserSpaces === u.username ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {u.isLocked && (
                        <button
                          onClick={() => handleUnlockUser(u.username)}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-red-400 hover:text-green-600 transition-colors"
                          title="Unlock account"
                        >
                          <LockOpen className="w-4 h-4" />
                        </button>
                      )}
                      {!u.isSuperAdmin && u.username !== currentUser?.username && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Reset MFA for "${u.username}"? They will be required to set up MFA again on next login.`)) return;
                            const res = await fetch(`/api/users/${encodeURIComponent(u.username)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resetMfa: true }) });
                            if (res.ok) { flash(`MFA reset for ${u.username}`, "success"); await fetchUsers(); }
                            else { const d = await res.json(); flash(d.error || "Failed to reset MFA", "error"); }
                          }}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                          title="Reset MFA (force re-enrollment)"
                        >
                          <ShieldOff className="w-4 h-4" />
                        </button>
                      )}
                      {!u.isSuperAdmin && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>

                  {/* Per-user space access panel */}
                  {expandedUserSpaces === u.username && (
                    <div className="mx-6 mb-3 border border-border rounded-lg bg-gray-50 overflow-hidden">
                      <div className="px-4 py-2 border-b border-border bg-gray-100">
                        <span className="text-xs font-medium text-gray-600">Space access for {u.username}</span>
                      </div>
                      {spaces.filter((s) => s.permissions[u.username]).length === 0 ? (
                        <p className="px-4 py-3 text-sm text-text-muted">Not a member of any space.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {spaces.filter((s) => s.permissions[u.username]).map((s) => (
                            <div key={s.slug} className="flex items-center justify-between px-4 py-2.5">
                              <span className="text-sm text-text-primary">{s.name}</span>
                              <div className="flex items-center gap-2">
                                <select
                                  value={s.permissions[u.username]}
                                  onChange={(e) => handleChangeRole(s.slug, u.username, e.target.value as SpaceRole)}
                                  className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface"
                                >
                                  <option value="reader">Reader</option>
                                  <option value="writer">Writer</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  onClick={() => handleRemovePermission(s.slug, u.username)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {spaces.filter((s) => !s.permissions[u.username]).length > 0 && (
                        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
                          <select
                            value={userSpacePermUser}
                            onChange={(e) => setUserSpacePermUser(e.target.value)}
                            className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-surface"
                          >
                            <option value="">Add to space…</option>
                            {spaces.filter((s) => !s.permissions[u.username]).map((s) => (
                              <option key={s.slug} value={s.slug}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            value={userSpacePermRole}
                            onChange={(e) => setUserSpacePermRole(e.target.value as SpaceRole)}
                            className="text-sm border border-border rounded-lg px-3 py-2 bg-surface"
                          >
                            <option value="reader">Reader</option>
                            <option value="writer">Writer</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            onClick={async () => {
                              if (!userSpacePermUser) return;
                              const space = spaces.find((s) => s.slug === userSpacePermUser);
                              if (!space) return;
                              const newPerms = { ...space.permissions, [u.username]: userSpacePermRole };
                              const res = await fetch(`/api/spaces/${userSpacePermUser}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ permissions: newPerms }),
                              });
                              if (res.ok) { flash(`Added ${u.username} to ${space.name}`, "success"); setUserSpacePermUser(""); await fetchSpaces(); }
                              else { const d = await res.json(); flash(d.error || "Failed", "error"); }
                            }}
                            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
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
            {/* Password re-confirmation gate */}
            {!auditConfirmed && (
              <div className="bg-surface rounded-xl shadow-sm border border-border">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                  <Lock className="w-4 h-4 text-text-muted" />
                  <h2 className="text-lg font-semibold text-text-primary">Confirm Your Identity</h2>
                </div>
                <div className="px-6 py-6 space-y-4 max-w-sm">
                  <p className="text-sm text-text-muted">
                    Audit logs are sensitive. Please re-enter your password to view them. Access expires after 15 minutes.
                  </p>
                  <input
                    type="password"
                    value={auditPassword}
                    onChange={(e) => setAuditPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmAuditPassword()}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-[var(--color-input-bg)] text-text-primary"
                    placeholder="Your password"
                    autoFocus
                  />
                  {auditPasswordError && (
                    <p className="text-sm text-red-600">{auditPasswordError}</p>
                  )}
                  <button
                    onClick={handleConfirmAuditPassword}
                    disabled={auditPasswordLoading || !auditPassword}
                    className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {auditPasswordLoading ? "Verifying…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}
            {auditConfirmed && (<>

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
                        <div className="grid grid-cols-2 gap-4">
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
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">App Name</label>
                            <input type="text" value={auditConfig.syslog.appName} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, appName: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="doc-it" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Hostname override (optional)</label>
                            <input type="text" value={auditConfig.syslog.hostname} onChange={(e) => setAuditConfig({ ...auditConfig, syslog: { ...auditConfig.syslog, hostname: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="auto-detected from OS" />
                          </div>
                        </div>
                        <p className="text-xs text-text-muted">Compatible with VictoriaLogs, Graylog, Splunk, rsyslog, syslog-ng, Elastic, Datadog, Papertrail and any RFC 5424 receiver.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
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
                    {auditConfig.syslog.enabled && auditConfig.syslog.host && (
                      <button
                        onClick={async () => {
                          flash("Sending test message…", "success");
                          try {
                            const res = await fetch("/api/settings/audit/test-syslog", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(auditConfig.syslog),
                            });
                            const data = await res.json();
                            if (data.ok) flash(data.message || "Test message sent successfully", "success");
                            else flash(`Syslog test failed: ${data.error}`, "error");
                          } catch (err) {
                            flash("Failed to send test message", "error");
                          }
                        }}
                        className="px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-muted transition-colors"
                      >
                        Test Syslog
                      </button>
                    )}
                  </div>
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
                      <button
                        disabled={chainVerifying}
                        onClick={async () => {
                          setChainVerifying(true);
                          setChainResult(null);
                          try {
                            const res = await fetch("/api/audit/verify-integrity", { method: "POST" });
                            if (res.ok) setChainResult(await res.json());
                            else flash("Failed to verify integrity", "error");
                          } catch { flash("Failed to verify integrity", "error"); }
                          setChainVerifying(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {chainVerifying ? "Verifying…" : "Verify Integrity"}
                      </button>
                      <a href={`/api/audit?export=csv&${new URLSearchParams(Object.fromEntries(Object.entries(explorerFilters).filter(([,v]) => v)))}`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" download>
                        <Download className="w-3.5 h-3.5" /> CSV
                      </a>
                      <a href={`/api/audit?export=json&${new URLSearchParams(Object.fromEntries(Object.entries(explorerFilters).filter(([,v]) => v)))}`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" download>
                        <Download className="w-3.5 h-3.5" /> JSON
                      </a>
                    </div>
                  </div>
                  {/* Chain verification result banner */}
                  {chainResult && (
                    <div className={`px-6 py-3 border-b border-border text-sm ${chainResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                      {chainResult.ok ? (
                        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Integrity verified — {chainResult.totalEntries} entries, hash chain intact.</span>
                      ) : (
                        <div>
                          <span className="flex items-center gap-2 font-semibold"><ShieldOff className="w-4 h-4" /> Integrity check failed — {chainResult.brokenLinks.length} broken link(s) in {chainResult.totalEntries} entries.</span>
                          <ul className="mt-1 ml-6 list-disc text-xs">
                            {chainResult.brokenLinks.slice(0, 10).map((b, i) => (
                              <li key={i}>{b.file}:{b.lineNum} ({b.eventId}) — {b.reason}</li>
                            ))}
                            {chainResult.brokenLinks.length > 10 && <li>… and {chainResult.brokenLinks.length - 10} more</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
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
            </>)}
          </div>
        )}

        {/* Backup Tab */}
        {tab === "backup" && (
          <div className="space-y-6">
            {/* Config card */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Backup Settings</h2>
                  <p className="text-xs text-text-muted mt-0.5">Backups include config/, docs/, logs/, archive/ and history/.</p>
                </div>
                <button
                  disabled={backupRunning}
                  onClick={async () => {
                    setBackupRunning(true); setBackupStatus("Running backup…");
                    const res = await fetch("/api/admin/backup", { method: "POST" });
                    const d = await res.json();
                    setBackupRunning(false);
                    if (res.ok) { setBackupStatus(`✅ ${d.filename}`); fetchBackup(); }
                    else setBackupStatus(`❌ ${d.error || "Backup failed"}`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  {backupRunning ? "Running…" : "Run Now"}
                </button>
              </div>
              {backupStatus && (
                <div className={`mx-6 mt-4 px-3 py-2 rounded-lg text-sm ${backupStatus.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{backupStatus}</div>
              )}
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="bk-enabled" checked={backupConfig.enabled} onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })} className="rounded" />
                  <label htmlFor="bk-enabled" className="text-sm font-medium text-text-primary">Enable scheduled backups</label>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Schedule</label>
                    <select value={backupConfig.schedule} onChange={(e) => setBackupConfig({ ...backupConfig, schedule: e.target.value as "manual"|"daily"|"weekly" })} className="w-full text-sm border border-border rounded-lg px-3 py-2 h-[34px]">
                      <option value="manual">Manual only</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  {backupConfig.schedule !== "manual" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Time (HH:MM)</label>
                      <input type="time" value={backupConfig.scheduleTime} onChange={(e) => setBackupConfig({ ...backupConfig, scheduleTime: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-1.5" />
                    </div>
                  )}
                  {backupConfig.schedule === "weekly" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Day of week</label>
                      <select value={backupConfig.scheduleDayOfWeek} onChange={(e) => setBackupConfig({ ...backupConfig, scheduleDayOfWeek: parseInt(e.target.value) })} className="w-full text-sm border border-border rounded-lg px-3 py-1.5">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Keep last N backups</label>
                    <input type="number" min={0} value={backupConfig.retentionCount} onChange={(e) => setBackupConfig({ ...backupConfig, retentionCount: parseInt(e.target.value) || 0 })} className="w-full text-sm border border-border rounded-lg px-3 py-1.5" />
                    <p className="text-xs text-text-muted mt-0.5">0 = unlimited</p>
                  </div>
                </div>

                {/* Targets */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-primary">Backup Targets</label>
                    <button onClick={() => { setNewTarget(EMPTY_TARGET()); setShowNewTarget(true); }} className="text-xs text-accent hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add target</button>
                  </div>
                  {backupConfig.targets.length === 0 && !showNewTarget && (
                    <p className="text-sm text-text-muted">No targets configured. Backups are saved to the local <code className="text-xs font-mono">backups/</code> directory only.</p>
                  )}
                  <div className="space-y-2">
                    {backupConfig.targets.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2 border border-border rounded-lg bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{t.label || "(unnamed)"}</p>
                          <p className="text-xs text-text-muted">{t.type === "local" ? `Local: ${t.path}` : t.type === "cifs" ? `CIFS: //${t.host}/${t.share}${t.remotePath}` : `SFTP: ${t.username}@${t.host}:${(t as BackupTargetForm).port ?? 22}${t.remotePath}`}</p>
                        </div>
                        <button onClick={() => setBackupConfig({ ...backupConfig, targets: backupConfig.targets.filter((x) => x.id !== t.id) })} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>

                  {showNewTarget && (
                    <div className="mt-3 p-4 border border-border rounded-lg bg-gray-50 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
<select value={newTarget.type} onChange={(e) => setNewTarget({ ...newTarget, type: e.target.value as "local"|"cifs"|"sftp" })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5 h-[34px]">
                            <option value="local">Local path (also NFS mount)</option>
                            <option value="cifs">CIFS / SMB share</option>
                            <option value="sftp">SFTP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                          <input type="text" value={newTarget.label} onChange={(e) => setNewTarget({ ...newTarget, label: e.target.value })} placeholder="e.g. NAS backup" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                        </div>
                      </div>
                      {newTarget.type === "local" ? (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Path</label>
                          <input type="text" value={newTarget.path} onChange={(e) => setNewTarget({ ...newTarget, path: e.target.value })} placeholder="/mnt/nas/docit-backups" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                          <p className="text-xs text-text-muted mt-0.5">For NFS: mount the share at the OS level first, then provide the mount path here.</p>
                        </div>
                      ) : newTarget.type === "cifs" ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Host</label>
                              <input type="text" value={newTarget.host} onChange={(e) => setNewTarget({ ...newTarget, host: e.target.value })} placeholder="192.168.1.10" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Share</label>
                              <input type="text" value={newTarget.share} onChange={(e) => setNewTarget({ ...newTarget, share: e.target.value })} placeholder="backups" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Remote path prefix</label>
                            <input type="text" value={newTarget.remotePath} onChange={(e) => setNewTarget({ ...newTarget, remotePath: e.target.value })} placeholder="docit/" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                              <input type="text" value={newTarget.username} onChange={(e) => setNewTarget({ ...newTarget, username: e.target.value })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                              <input type="password" value={newTarget.password} onChange={(e) => setNewTarget({ ...newTarget, password: e.target.value })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5" autoComplete="new-password" />
                            </div>
                          </div>
                          <p className="text-xs text-text-muted">Requires <code className="font-mono">smbclient</code> to be installed on the server. The password is stored encrypted.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Host</label>
                              <input type="text" value={newTarget.host} onChange={(e) => setNewTarget({ ...newTarget, host: e.target.value })} placeholder="sftp.example.com" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                              <input type="number" value={newTarget.port} onChange={(e) => setNewTarget({ ...newTarget, port: parseInt(e.target.value) || 22 })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                              <input type="text" value={newTarget.username} onChange={(e) => setNewTarget({ ...newTarget, username: e.target.value })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Remote path</label>
                              <input type="text" value={newTarget.remotePath} onChange={(e) => setNewTarget({ ...newTarget, remotePath: e.target.value })} placeholder="/backups/docit" className="w-full text-sm border border-border rounded-lg px-2 py-1.5" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Password <span className="font-normal text-text-muted">(leave blank if using private key)</span></label>
                            <input type="password" value={newTarget.password} onChange={(e) => setNewTarget({ ...newTarget, password: e.target.value })} className="w-full text-sm border border-border rounded-lg px-2 py-1.5" autoComplete="new-password" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Private key <span className="font-normal text-text-muted">(PEM, leave blank if using password)</span></label>
                            <textarea value={newTarget.privateKey} onChange={(e) => setNewTarget({ ...newTarget, privateKey: e.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows={4} className="w-full text-sm border border-border rounded-lg px-2 py-1.5 font-mono resize-y" />
                          </div>
                          <p className="text-xs text-text-muted">Password and private key are stored encrypted. Provide one or the other.</p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            if (!newTarget.label) return flash("Label is required", "error");
                            if (newTarget.type === "local" && !newTarget.path) return flash("Path is required", "error");
                            if (newTarget.type === "cifs" && (!newTarget.host || !newTarget.share)) return flash("Host and share are required", "error");
                            if (newTarget.type === "sftp" && (!newTarget.host || !newTarget.username)) return flash("Host and username are required", "error");
                            if (newTarget.type === "sftp" && !newTarget.password && !newTarget.privateKey) return flash("Password or private key is required", "error");
                            setBackupConfig({ ...backupConfig, targets: [...backupConfig.targets, newTarget] });
                            setShowNewTarget(false);
                            setNewTarget(EMPTY_TARGET());
                          }}
                          className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover"
                        >Add</button>
                        <button onClick={() => setShowNewTarget(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={async () => {
                    const res = await fetch("/api/admin/backup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backupConfig) });
                    if (res.ok) flash("Backup settings saved", "success");
                    else { const d = await res.json(); flash(d.error || "Failed to save", "error"); }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >Save Settings</button>
              </div>
            </div>

            {/* Backup list */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">Backup Archives</h2>
                <button onClick={fetchBackup} className="p-1.5 rounded hover:bg-muted text-text-muted" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
              </div>
              {backupList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-text-muted">No backups yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {backupList.map((b) => (
                    <div key={b.filename} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary font-mono">{b.filename}</p>
                        <p className="text-xs text-text-muted">{new Date(b.createdAt).toLocaleString()} · {(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button
                        disabled={restoringFile === b.filename}
                        onClick={async () => {
                          if (!confirm(`Restore from ${b.filename}?\n\nThis will OVERWRITE current config, docs, logs, archive, and history directories. This cannot be undone.`)) return;
                          setRestoringFile(b.filename);
                          try {
                            const res = await fetch(`/api/admin/backup/${encodeURIComponent(b.filename)}/restore`, { method: "POST" });
                            if (res.ok) { flash(`Restored from ${b.filename}`, "success"); }
                            else { const d = await res.json(); flash(d.error || "Restore failed", "error"); }
                          } catch { flash("Restore failed", "error"); }
                          finally { setRestoringFile(null); }
                        }}
                        className="p-1.5 rounded hover:bg-blue-50 text-text-muted hover:text-blue-600 disabled:opacity-50"
                        title="Restore this backup"
                      >
                        <RotateCcw className={`w-4 h-4 ${restoringFile === b.filename ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ${b.filename}?`)) return;
                          const res = await fetch(`/api/admin/backup/${encodeURIComponent(b.filename)}`, { method: "DELETE" });
                          if (res.ok) fetchBackup();
                          else flash("Failed to delete backup", "error");
                        }}
                        className="p-1.5 rounded hover:bg-red-50 text-text-muted hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User Groups Tab */}
        {tab === "groups" && (
          <div className="bg-surface rounded-xl shadow-sm border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">User Groups</h2>
                <p className="text-xs text-text-muted mt-0.5">Manage groups for dashboard link visibility</p>
              </div>
            </div>

            {/* Create group form */}
            <div className="px-6 py-4 bg-gray-50 border-b border-border">
              <p className="text-xs font-medium text-gray-600 mb-2">Create New Group</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={!newGroupName.trim()}
                  onClick={async () => {
                    const res = await fetch("/api/admin/user-groups", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() }),
                    });
                    if (res.ok) {
                      flash("Group created", "success");
                      setNewGroupName("");
                      setNewGroupDesc("");
                      fetchUserGroups();
                    } else {
                      const d = await res.json();
                      flash(d.error || "Failed to create group", "error");
                    }
                  }}
                  className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            {/* Groups list */}
            {userGroups.length === 0 ? (
              <p className="px-6 py-6 text-sm text-text-muted text-center">No user groups yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {userGroups.map((group) => (
                  <div key={group.id} className="px-6 py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        {editingGroup?.id === group.id ? (
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={editingGroup.name}
                              onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                              className="px-2 py-1 text-sm border border-border rounded-lg"
                            />
                            <input
                              type="text"
                              value={editingGroup.description}
                              onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value })}
                              placeholder="Description"
                              className="px-2 py-1 text-sm border border-border rounded-lg flex-1"
                            />
                            <button
                              onClick={async () => {
                                const res = await fetch("/api/admin/user-groups", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: editingGroup.id, name: editingGroup.name, description: editingGroup.description, members: editingGroup.members }),
                                });
                                if (res.ok) {
                                  flash("Group updated", "success");
                                  setEditingGroup(null);
                                  fetchUserGroups();
                                } else flash("Failed to update", "error");
                              }}
                              className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg"
                            >Save</button>
                            <button onClick={() => setEditingGroup(null)} className="px-2 py-1 text-xs text-text-muted">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <h3 className="text-sm font-semibold text-text-primary">{group.name}</h3>
                            {group.description && <p className="text-xs text-text-muted">{group.description}</p>}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingGroup({ ...group })}
                          className="p-1 rounded hover:bg-muted text-text-muted hover:text-text-secondary"
                          title="Edit group"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete group "${group.name}"?`)) return;
                            const res = await fetch("/api/admin/user-groups", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: group.id }),
                            });
                            if (res.ok) { flash("Group deleted", "success"); fetchUserGroups(); }
                            else flash("Failed to delete", "error");
                          }}
                          className="p-1 rounded hover:bg-red-100 text-text-muted hover:text-red-600"
                          title="Delete group"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Members */}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">Members ({group.members.length})</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {group.members.length === 0 && (
                          <span className="text-xs text-text-muted italic">No members</span>
                        )}
                        {group.members.map((m) => {
                          const memberUser = users.find(u => u.username === m);
                          const memberIsAd = memberUser?.authSource === "ad";
                          return (
                          <span key={m} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                            memberIsAd ? "bg-blue-100 text-blue-700" : "bg-accent/10 text-accent"
                          }`}>
                            {memberIsAd && <Network className="w-3 h-3 flex-shrink-0" />}
                            {memberUser?.fullName || m}
                            <button
                              onClick={async () => {
                                const updated = group.members.filter((u) => u !== m);
                                const res = await fetch("/api/admin/user-groups", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: group.id, members: updated }),
                                });
                                if (res.ok) fetchUserGroups();
                                else flash("Failed to remove member", "error");
                              }}
                              className="hover:text-red-600"
                              title={`Remove ${m}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={groupMemberInput}
                          onChange={(e) => setGroupMemberInput(e.target.value)}
                          className="text-sm border border-border rounded-lg px-2 py-1 h-[30px]"
                        >
                          <option value="">Add member…</option>
                          {users
                            .filter((u) => !group.members.includes(u.username))
                            .map((u) => (
                              <option key={u.username} value={u.username}>{u.username}</option>
                            ))}
                        </select>
                        <button
                          disabled={!groupMemberInput}
                          onClick={async () => {
                            if (!groupMemberInput) return;
                            const updated = [...group.members, groupMemberInput];
                            const res = await fetch("/api/admin/user-groups", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: group.id, members: updated }),
                            });
                            if (res.ok) {
                              setGroupMemberInput("");
                              fetchUserGroups();
                            } else flash("Failed to add member", "error");
                          }}
                          className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                        >Add</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (<>

          {/* Storage Settings */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Storage Location</h2>
              <p className="text-xs text-text-muted mt-1">Configure where documents, archive, history and trash are stored. Saved to <code className="font-mono">docit.config.json</code> in the application root.</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              {storageLoaded && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-gray-50 border border-border rounded-lg px-4 py-3">
                  {Object.entries(storageConfig.paths).map(([key, p]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-text-muted w-14 shrink-0">{key}/</span>
                      <span className="text-text-primary truncate">{p}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Storage root (absolute path)</label>
                <input
                  type="text"
                  value={storageInput}
                  onChange={(e) => setStorageInput(e.target.value)}
                  placeholder={storageConfig.effectiveRoot || process.cwd?.() || "/path/to/data"}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-muted mt-1">Leave empty to use the application directory. Must be an absolute path.</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                ⚠️ <strong>Files are NOT moved automatically.</strong> Move your existing <code className="font-mono">docs/</code>, <code className="font-mono">archive/</code>, <code className="font-mono">history/</code> and <code className="font-mono">trash/</code> directories to the new location before saving, otherwise documents will not be accessible.
              </div>
              <button
                onClick={async () => {
                  const root = storageInput.trim();
                  if (!root) { flash("Enter an absolute path", "error"); return; }
                  const res = await fetch("/api/settings/storage", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storageRoot: root }),
                  });
                  if (res.ok) { flash("Storage settings saved", "success"); fetchStorageConfig(); }
                  else { const d = await res.json(); flash(d.error || "Failed to save", "error"); }
                }}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Save Storage Path
              </button>
            </div>
          </div>

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
              <div className="pt-2 flex items-center gap-3">
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

              {/* Send test email */}
              <div className="border-t border-border pt-4 mt-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Send Test Email</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="recipient@example.com"
                  />
                  <button
                    disabled={testEmailSending || !testEmailTo}
                    onClick={async () => {
                      setTestEmailSending(true);
                      try {
                        const res = await fetch("/api/settings/smtp/test", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ to: testEmailTo }),
                        });
                        if (res.ok) flash("Test email sent successfully", "success");
                        else {
                          const d = await res.json();
                          flash(d.error || "Failed to send test email", "error");
                        }
                      } catch {
                        flash("Failed to send test email", "error");
                      } finally {
                        setTestEmailSending(false);
                      }
                    }}
                    className="px-4 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {testEmailSending ? "Sending…" : "Send Test"}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">Save your settings first, then send a test email to verify the configuration</p>
              </div>
            </div>
          </div>

          {/* Encryption Key card */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Encryption Key</h2>
              <p className="text-xs text-text-muted mt-1">Manages the AES-256 key used to encrypt TOTP secrets, CIFS passwords, and backup archives</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Fingerprint */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Key Fingerprint</label>
                <p className="text-sm font-mono text-text-primary">{keyFingerprint || "—"}</p>
                <p className="text-xs text-text-muted mt-0.5">First 16 hex characters of SHA-256 hash of the key</p>
              </div>

              {/* Export Key */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Export Key</label>
                {keyRevealed ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={keyRevealed}
                      className="flex-1 px-3 py-1.5 text-sm font-mono border border-border rounded-lg bg-gray-50 select-all"
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(keyRevealed); flash("Key copied to clipboard", "success"); }}
                      className="p-1.5 rounded hover:bg-muted text-text-muted" title="Copy"
                    ><Copy className="w-4 h-4" /></button>
                    <button
                      onClick={() => setKeyRevealed(null)}
                      className="p-1.5 rounded hover:bg-muted text-text-muted" title="Hide"
                    ><EyeOff className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/admin/security", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "export-key" }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setKeyRevealed(data.keyBase64);
                      } else flash("Failed to export key", "error");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Reveal Key
                  </button>
                )}
                <p className="text-xs text-text-muted mt-1">Store this key in a safe place (e.g. password vault). Without it, encrypted backups are unrecoverable.</p>
              </div>

              {/* Rotation result */}
              {keyRotationResult && (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-sm font-semibold text-amber-800">Key rotated successfully</p>
                  <p className="text-xs text-amber-700">{keyRotationResult.summary}</p>
                  <div>
                    <label className="block text-xs font-medium text-amber-800 mb-1">New Key (save this immediately!):</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly value={keyRotationResult.newKey} className="flex-1 px-3 py-1.5 text-sm font-mono border border-amber-300 rounded-lg bg-white select-all" />
                      <button
                        onClick={() => { navigator.clipboard.writeText(keyRotationResult.newKey); flash("New key copied", "success"); }}
                        className="p-1.5 rounded hover:bg-amber-100 text-amber-700" title="Copy"
                      ><Copy className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rotate Key */}
              <div className="border-t border-border pt-4">
                <button
                  disabled={keyRotating}
                  onClick={async () => {
                    if (!confirm("⚠️ ROTATE ENCRYPTION KEY?\n\nThis will:\n• Generate a new encryption key\n• Re-encrypt all TOTP secrets\n• Re-encrypt all CIFS passwords\n• Re-encrypt all backup archives\n\nYou MUST save the new key afterwards. Continue?")) return;
                    if (!confirm("Are you absolutely sure? This is irreversible if you lose the new key.")) return;
                    setKeyRotating(true);
                    try {
                      const res = await fetch("/api/admin/security", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "rotate-key" }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        const s = data.summary;
                        const summaryText = `Re-encrypted: ${s.totpSecretsRotated} TOTP secrets, ${s.cifsPasswordsRotated} CIFS passwords, ${s.backupFilesRotated} backup files.${s.errors.length ? ` Errors: ${s.errors.join("; ")}` : ""}`;
                        setKeyRotationResult({ newKey: s.newKeyBase64, summary: summaryText });
                        setKeyRevealed(null);
                        fetchKeyInfo();
                        flash("Key rotated — save the new key!", "success");
                      } else {
                        const d = await res.json();
                        flash(d.error || "Key rotation failed", "error");
                      }
                    } catch { flash("Key rotation failed", "error"); }
                    finally { setKeyRotating(false); }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${keyRotating ? "animate-spin" : ""}`} />
                  {keyRotating ? "Rotating…" : "Rotate Encryption Key"}
                </button>
                <p className="text-xs text-text-muted mt-1">Generates a new key and re-encrypts all data. Old key will no longer work.</p>
              </div>
            </div>
          </div>
          {/* Dashboard Access */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mt-6">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <Layout className="w-5 h-5 text-accent shrink-0" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary">Dashboard Access</h2>
                <p className="text-xs text-text-muted mt-0.5">Control who can see the dashboard. Admins always have full edit access.</p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-6">
              {/* Allowed users */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Users</h3>
                <p className="text-xs text-text-muted mb-3">These users can view the dashboard (read-only). Admins are always included automatically.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dashAccess.allowedUsers.map((u, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {u}
                      <button onClick={() => setDashAccess({ ...dashAccess, allowedUsers: dashAccess.allowedUsers.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {dashAccess.allowedUsers.length === 0 && <span className="text-xs text-text-muted italic">No users added — only admins can see the dashboard</span>}
                </div>
                <div className="flex gap-2">
                  <select
                    value={newDashUser}
                    onChange={(e) => setNewDashUser(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select user…</option>
                    {allUsers
                      .filter((u) => !u.isAdmin && !dashAccess.allowedUsers.includes(u.username))
                      .map((u) => (
                        <option key={u.username} value={u.username}>{u.username}{u.fullName ? ` (${u.fullName})` : ""}</option>
                      ))}
                  </select>
                  <button
                    disabled={!newDashUser}
                    onClick={() => {
                      if (newDashUser && !dashAccess.allowedUsers.includes(newDashUser)) {
                        setDashAccess({ ...dashAccess, allowedUsers: [...dashAccess.allowedUsers, newDashUser] });
                      }
                      setNewDashUser("");
                    }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* AD Groups */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">AD Groups (Dashboard Viewers)</h3>
                <p className="text-xs text-text-muted mb-3">Members of these AD groups can view the dashboard. Group membership is synced on AD login.</p>
                <div className="space-y-1.5 mb-2">
                  {dashAccess.allowedAdGroups.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 border border-border rounded-lg px-3 py-1.5">
                      <span className="font-mono text-xs flex-1 truncate">{g}</span>
                      <button onClick={() => setDashAccess({ ...dashAccess, allowedAdGroups: dashAccess.allowedAdGroups.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {dashAccess.allowedAdGroups.length === 0 && <span className="text-xs text-text-muted italic">No AD groups configured</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDashAdGroup}
                    onChange={(e) => setNewDashAdGroup(e.target.value)}
                    placeholder="CN=DashboardViewers,OU=Groups,DC=example,DC=com"
                    className="flex-1 px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newDashAdGroup.trim()) {
                        setDashAccess({ ...dashAccess, allowedAdGroups: [...dashAccess.allowedAdGroups, newDashAdGroup.trim()] });
                        setNewDashAdGroup("");
                      }
                    }}
                  />
                  <button
                    disabled={!newDashAdGroup.trim()}
                    onClick={() => {
                      setDashAccess({ ...dashAccess, allowedAdGroups: [...dashAccess.allowedAdGroups, newDashAdGroup.trim()] });
                      setNewDashAdGroup("");
                    }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Save */}
              <div className="pt-2">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/admin/dashboard-access", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(dashAccess),
                    });
                    if (res.ok) flash("Dashboard access saved", "success");
                    else flash("Failed to save dashboard access", "error");
                  }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Save Dashboard Access
                </button>
              </div>
            </div>
          </div>

          {/* Active Directory */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mt-6">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <Network className="w-5 h-5 text-accent shrink-0" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary">Active Directory</h2>
                <p className="text-xs text-text-muted mt-0.5">LDAP / LDAPS authentication with group-based space role mapping</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={adConfig.enabled}
                  onChange={(e) => setAdConfig({ ...adConfig, enabled: e.target.checked })}
                  className="rounded"
                />
                Enabled
              </label>
            </div>
            <div className="px-6 py-4 space-y-6">
              {/* Connection */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Connection</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Host / Domain Controller</label>
                    <input type="text" value={adConfig.host} onChange={(e) => setAdConfig({ ...adConfig, host: e.target.value })}
                      placeholder="dc01.example.com"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                    <input type="number" value={adConfig.port} onChange={(e) => setAdConfig({ ...adConfig, port: parseInt(e.target.value) || 389 })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 mt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={adConfig.ssl} onChange={(e) => setAdConfig({ ...adConfig, ssl: e.target.checked, port: e.target.checked ? 636 : 389 })} className="rounded" />
                    Use LDAPS (TLS, port 636)
                  </label>
                  {adConfig.ssl && (
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={!adConfig.tlsRejectUnauthorized} onChange={(e) => setAdConfig({ ...adConfig, tlsRejectUnauthorized: !e.target.checked })} className="rounded" />
                      Allow self-signed certificates
                    </label>
                  )}
                </div>
              </div>

              {/* Bind Account */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Service Account (Bind DN)</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bind DN</label>
                    <input type="text" value={adConfig.bindDn} onChange={(e) => setAdConfig({ ...adConfig, bindDn: e.target.value })}
                      placeholder="CN=svcDocIt,OU=Service Accounts,DC=example,DC=com"
                      className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Bind Password
                      {adConfig.bindPasswordSet && <span className="ml-1 text-green-600 font-normal">(set)</span>}
                    </label>
                    <input type="password" value={adBindPassword} onChange={(e) => setAdBindPassword(e.target.value)}
                      placeholder={adConfig.bindPasswordSet ? "Leave blank to keep current" : "Enter bind password"}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Directory search */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Directory Search</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Base DN</label>
                    <input type="text" value={adConfig.baseDn} onChange={(e) => setAdConfig({ ...adConfig, baseDn: e.target.value })}
                      placeholder="DC=example,DC=com"
                      className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">User Search Base <span className="font-normal text-text-muted">(optional, defaults to Base DN)</span></label>
                    <input type="text" value={adConfig.userSearchBase} onChange={(e) => setAdConfig({ ...adConfig, userSearchBase: e.target.value })}
                      placeholder="OU=Users,DC=example,DC=com"
                      className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    disabled={adTesting}
                    onClick={async () => {
                      setAdTesting(true); setAdTestResult(null);
                      const payload: Record<string, unknown> = { ...adConfig, action: "test" };
                      if (adBindPassword) payload.bindPassword = adBindPassword;
                      const res = await fetch("/api/settings/ad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                      setAdTestResult(await res.json());
                      setAdTesting(false);
                    }}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {adTesting ? "Testing…" : "Test Connection"}
                  </button>
                  {adTestResult && (
                    <span className={`text-sm ${adTestResult.success ? "text-green-600" : "text-red-600"}`}>
                      {adTestResult.success ? `✓ ${adTestResult.info}` : `✗ ${adTestResult.error}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Allowed Groups */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Groups</h3>
                <p className="text-xs text-text-muted mb-3">Members of these AD groups may log in. Leave empty to allow any authenticated AD user.</p>
                <div className="space-y-1.5 mb-2">
                  {adConfig.allowedGroups.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 border border-border rounded-lg px-3 py-1.5">
                      <span className="font-mono text-xs flex-1 truncate">{g}</span>
                      <button onClick={() => setAdConfig({ ...adConfig, allowedGroups: adConfig.allowedGroups.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newAllowedGroup} onChange={(e) => setNewAllowedGroup(e.target.value)}
                    placeholder="CN=DocIt-Users,OU=Groups,DC=example,DC=com"
                    className="flex-1 px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => { if (e.key === "Enter" && newAllowedGroup.trim()) { setAdConfig({ ...adConfig, allowedGroups: [...adConfig.allowedGroups, newAllowedGroup.trim()] }); setNewAllowedGroup(""); } }}
                  />
                  <button disabled={!newAllowedGroup.trim()} onClick={() => { setAdConfig({ ...adConfig, allowedGroups: [...adConfig.allowedGroups, newAllowedGroup.trim()] }); setNewAllowedGroup(""); }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                </div>
              </div>

              {/* Allowed Users */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Users</h3>
                <p className="text-xs text-text-muted mb-3">Individual sAMAccountNames allowed to log in regardless of group membership.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {adConfig.allowedUsers.map((u, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
                      {u}
                      <button onClick={() => setAdConfig({ ...adConfig, allowedUsers: adConfig.allowedUsers.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newAllowedUser} onChange={(e) => setNewAllowedUser(e.target.value)}
                    placeholder="jsmith"
                    className="w-48 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => { if (e.key === "Enter" && newAllowedUser.trim()) { setAdConfig({ ...adConfig, allowedUsers: [...adConfig.allowedUsers, newAllowedUser.trim()] }); setNewAllowedUser(""); } }}
                  />
                  <button disabled={!newAllowedUser.trim()} onClick={() => { setAdConfig({ ...adConfig, allowedUsers: [...adConfig.allowedUsers, newAllowedUser.trim()] }); setNewAllowedUser(""); }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                </div>
              </div>

              {/* Group Mappings */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Group → Space Role Mappings</h3>
                <p className="text-xs text-text-muted mb-3">Map AD groups to doc-it space roles. Use space slug <code className="font-mono">*</code> to grant global admin.</p>
                {adConfig.groupMappings.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden mb-3">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Group DN</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 w-36">Space</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Role</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adConfig.groupMappings.map((m, i) => (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono truncate max-w-0" style={{maxWidth: "1px", width: "60%"}}>{m.groupDn}</td>
                            <td className="px-3 py-2">{m.spaceSlug === "*" ? <span className="text-accent font-medium">global admin</span> : m.spaceSlug}</td>
                            <td className="px-3 py-2 capitalize">{m.role}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => setAdConfig({ ...adConfig, groupMappings: adConfig.groupMappings.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Add mapping row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group DN</label>
                    <input type="text" value={newMappingGroupDn} onChange={(e) => setNewMappingGroupDn(e.target.value)}
                      placeholder="CN=DocIt-Writers,OU=Groups,DC=example,DC=com"
                      className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Space</label>
                    <select value={newMappingSpaceSlug} onChange={(e) => setNewMappingSpaceSlug(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select…</option>
                      <option value="*">* (global admin)</option>
                      {spaces.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select value={newMappingRole} onChange={(e) => setNewMappingRole(e.target.value as SpaceRole)}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="reader">reader</option>
                      <option value="writer">writer</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <button
                    disabled={!newMappingGroupDn.trim() || !newMappingSpaceSlug}
                    onClick={() => {
                      const mapping: AdGroupMapping = { id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2), groupDn: newMappingGroupDn.trim(), spaceSlug: newMappingSpaceSlug, role: newMappingSpaceSlug === "*" ? "admin" : newMappingRole };
                      setAdConfig({ ...adConfig, groupMappings: [...adConfig.groupMappings, mapping] });
                      setNewMappingGroupDn(""); setNewMappingSpaceSlug(""); setNewMappingRole("reader");
                    }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 self-end"
                  ><Plus className="w-4 h-4" /></button>
                </div>
              </div>

              <button
                disabled={adSaving}
                onClick={async () => {
                  setAdSaving(true);
                  const payload: Record<string, unknown> = { ...adConfig };
                  if (adBindPassword) payload.bindPassword = adBindPassword;
                  const res = await fetch("/api/settings/ad", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  setAdSaving(false);
                  if (res.ok) {
                    const data = await res.json();
                    setAdConfig(data);
                    setAdBindPassword("");
                    flash("Active Directory settings saved", "success");
                  } else {
                    const d = await res.json();
                    flash(d.error || "Failed to save AD settings", "error");
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {adSaving ? "Saving…" : "Save AD Settings"}
              </button>
            </div>
          </div>

          {/* Change Log settings */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Change Log</h2>
              <p className="text-xs text-text-muted mt-1">Operational change log settings. Entries older than the retention window are pruned automatically when new entries are added.</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="max-w-xs">
                <label className="block text-xs font-medium text-gray-600 mb-1">Retention (years)</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={changelogSettings.retentionYears}
                  onChange={(e) => setChangelogSettings({ retentionYears: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-muted mt-1">Change entries older than this are removed. Default: 5 years.</p>
              </div>
              <button
                onClick={async () => {
                  const res = await fetch("/api/settings/changelog", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(changelogSettings),
                  });
                  if (res.ok) flash("Change log settings saved", "success");
                  else { const d = await res.json(); flash(d.error || "Failed to save", "error"); }
                }}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ── Audit Calendar Component

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
