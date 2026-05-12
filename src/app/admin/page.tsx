"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Shield, ShieldCheck, Users, Layout, Settings, Key, Copy, Check, ClipboardList, ChevronLeft, ChevronRight, Download, Lock, LockOpen, ChevronDown, ChevronUp, ShieldOff, HardDrive, RefreshCw, PlayCircle, RotateCcw, Eye, EyeOff, UsersRound, X, Network, AlertTriangle, GitBranch, Wifi, Mail, Server, Monitor, Laptop, Printer, Box, Database, Cpu, Smartphone, Cloud, Globe } from "lucide-react";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { isPasswordValid } from "@/lib/password-policy";
import type { SanitizedUser, Space, SpaceRole, AuditConfig, AuditEntry, UserGroup, AdConfig, AdGroupMapping, DashboardAccessConfig, CrashEntry, SnapshotEntry } from "@/lib/types";
import { copyToClipboard } from "@/lib/clipboard";
type Tab = "users" | "spaces" | "service-keys" | "groups" | "settings" | "audit" | "backup" | "crash-logs" | "vmware" | "mirth" | "provisioning";

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

const PROFILE_ICON_OPTIONS = [
  { value: "server", label: "Server", icon: Server },
  { value: "monitor", label: "Monitor", icon: Monitor },
  { value: "laptop", label: "Laptop", icon: Laptop },
  { value: "printer", label: "Printer", icon: Printer },
  { value: "hard-drive", label: "Storage", icon: HardDrive },
  { value: "database", label: "Database", icon: Database },
  { value: "network", label: "Network", icon: Network },
  { value: "wifi", label: "Wireless", icon: Wifi },
  { value: "shield", label: "Security", icon: Shield },
  { value: "cloud", label: "Cloud", icon: Cloud },
  { value: "cpu", label: "Compute", icon: Cpu },
  { value: "smartphone", label: "Mobile", icon: Smartphone },
  { value: "box", label: "Appliance", icon: Box },
  { value: "globe", label: "Web", icon: Globe },
];

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

  // Snapshot state
  const [snapshotList, setSnapshotList] = useState<SnapshotEntry[]>([]);
  const [snapshotCreating, setSnapshotCreating] = useState(false);
  const [snapshotRestoring, setSnapshotRestoring] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState("");

  // Storage settings state
  const [storageConfig, setStorageConfig] = useState<{ storageRoot: string | null; effectiveRoot: string; paths: Record<string, string> }>({
    storageRoot: null, effectiveRoot: "", paths: {},
  });
  const [storageInput, setStorageInput] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);

  // Changelog settings state
  const [changelogSettings, setChangelogSettings] = useState({ retentionYears: 5, categories: ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"] as string[] });
  const [changelogSettingsLoaded, setChangelogSettingsLoaded] = useState(false);
  const [newChangelogCategory, setNewChangelogCategory] = useState("");

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

  // On-Call settings state
  const [onCallSettings, setOnCallSettings] = useState({ allowedUsers: [] as string[], emailEnabled: false, emailRecipients: [] as string[], emailSendTime: "08:00" });
  const [onCallSettingsLoaded, setOnCallSettingsLoaded] = useState(false);
  const [newOnCallUser, setNewOnCallUser] = useState("");
  const [newOnCallRecipient, setNewOnCallRecipient] = useState("");

  // Provisioning state
  interface ProvCfgForm {
    netbox: { url: string; token: string; tokenSet: boolean; siteId: number | null; defaultRoleId: number | null; ignoreSslErrors: boolean };
    dns: { type: string; endpoint: string; token: string; tokenSet: boolean; defaultZone: string; ignoreSslErrors: boolean };
    dhcp: { type: string; endpoint: string; token: string; tokenSet: boolean; defaultScope: string; ignoreSslErrors: boolean };
    allowedUsers: string[]; allowedDnsZones: string[]; dnsFlushTargets: string[]; adManagementEnabled: boolean; adManagementAdminOnly: boolean;
  }
  const emptyProvCfg = (): ProvCfgForm => ({
    netbox: { url: "", token: "", tokenSet: false, siteId: null, defaultRoleId: null, ignoreSslErrors: false },
    dns: { type: "microsoft", endpoint: "", token: "", tokenSet: false, defaultZone: "", ignoreSslErrors: false },
    dhcp: { type: "microsoft", endpoint: "", token: "", tokenSet: false, defaultScope: "", ignoreSslErrors: false },
    allowedUsers: [], allowedDnsZones: [], dnsFlushTargets: [], adManagementEnabled: false, adManagementAdminOnly: true,
  });
  const [provCfg, setProvCfg] = useState<ProvCfgForm>(emptyProvCfg());
  const [provCfgLoaded, setProvCfgLoaded] = useState(false);
  const [provSaving, setProvSaving] = useState(false);
  const [newProvUser, setNewProvUser] = useState("");
  const [newProvDnsZone, setNewProvDnsZone] = useState("");
  const [newFlushTarget, setNewFlushTarget] = useState("");
  const [provTestResult, setProvTestResult] = useState<{ target: string; ok: boolean; message: string } | null>(null);
  const [provTesting, setProvTesting] = useState<string | null>(null);

  // Device profiles state
  interface DeviceProfileItem { id: string; name: string; icon: string; netboxRoleId: number | null; defaultVlanId: number | null; defaultPrefixId: number | null; defaultDnsZone: string; defaultDhcpScope: string; manufacturerFilter: number[]; requiresAssetTag: boolean; autoCreateCmdb: boolean; sortOrder: number; }
  const emptyProfile = (): DeviceProfileItem => ({ id: "", name: "", icon: "server", netboxRoleId: null, defaultVlanId: null, defaultPrefixId: null, defaultDnsZone: "", defaultDhcpScope: "", manufacturerFilter: [], requiresAssetTag: false, autoCreateCmdb: true, sortOrder: 0 });
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfileItem[]>([]);
  const [deviceProfilesLoaded, setDeviceProfilesLoaded] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<DeviceProfileItem>(emptyProfile());
  const [profileSaving, setProfileSaving] = useState(false);

  // Netbox reference data for profile form dropdowns
  const [nbRoles, setNbRoles] = useState<{ id: number; name: string }[]>([]);
  const [nbVlans, setNbVlans] = useState<{ id: number; vid: number; name: string }[]>([]);
  const [nbPrefixes, setNbPrefixes] = useState<{ id: number; prefix: string; description: string }[]>([]);
  const [nbManufacturers, setNbManufacturers] = useState<{ id: number; name: string }[]>([]);
  const [nbRefLoaded, setNbRefLoaded] = useState(false);

  // Mirth servers state (admin)
  interface MirthServerAdmin { id: string; name: string; url: string; username: string; passwordSet: boolean; ignoreSslErrors: boolean; enabled: boolean; sortOrder: number; createdAt: string; }
  const [mirthServers, setMirthServers] = useState<MirthServerAdmin[]>([]);
  const [mirthTestResults, setMirthTestResults] = useState<Record<string, { ok: boolean; version?: string; error?: string }>>({});
  const [mirthTesting, setMirthTesting] = useState<string | null>(null);
  const [mirthDeleting, setMirthDeleting] = useState<string | null>(null);
  const [mirthSaving, setMirthSaving] = useState(false);
  const [showMirthForm, setShowMirthForm] = useState(false);
  const [editingMirthId, setEditingMirthId] = useState<string | null>(null);
  const emptyMirthForm = () => ({ name: "", url: "", username: "", password: "", ignoreSslErrors: true, enabled: true, sortOrder: 0 });
  const [mirthForm, setMirthForm] = useState(emptyMirthForm());
  const emptyMirthNotif = () => ({ recipients: [] as string[], alertError: true, alertStuck: true, alertDown: true, alertPaused: false });
  const [mirthNotif, setMirthNotif] = useState(emptyMirthNotif());
  const [mirthNotifLoaded, setMirthNotifLoaded] = useState(false);
  const [mirthNotifEmail, setMirthNotifEmail] = useState("");
  const [mirthNotifSaving, setMirthNotifSaving] = useState(false);

  const loadMirthNotifConfig = async (id: string) => {
    const r = await fetch(`/api/mirth/servers/${id}/notifications`).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      if (d.config) setMirthNotif({
        recipients: d.config.recipients ?? [],
        alertError:  d.config.alertError  !== false,
        alertStuck:  d.config.alertStuck  !== false,
        alertDown:   d.config.alertDown   !== false,
        alertPaused: d.config.alertPaused === true,
      });
    }
    setMirthNotifLoaded(true);
  };

  const fetchMirthServers = useCallback(async () => {
    const r = await fetch("/api/mirth/servers").catch(() => null);
    if (r?.ok) { const d = await r.json(); setMirthServers(d.servers ?? []); }
  }, []);

  const testMirthServer = async (id: string) => {
    setMirthTesting(id);
    const r = await fetch(`/api/mirth/servers/${id}/test`).catch(() => null);
    const d = r ? await r.json() : { ok: false, error: "Network error" };
    setMirthTestResults(prev => ({ ...prev, [id]: d }));
    setMirthTesting(null);
  };

  const deleteMirthServer = async (id: string) => {
    if (!confirm("Delete this Mirth server?")) return;
    setMirthDeleting(id);
    await fetch(`/api/mirth/servers/${id}`, { method: "DELETE" }).catch(() => {});
    setMirthDeleting(null);
    fetchMirthServers();
  };

  // VMware settings state
  const [vmwareCfg, setVmwareCfg] = useState({
    enabled: false, vcenterUrl: "", username: "", password: "", passwordSet: false,
    ignoreSslErrors: false, allowedUsers: [] as string[],
    cacheTtlMinutes: 15,
    weeklyReportEnabled: false, weeklyReportRecipients: [] as string[],
    weeklyReportDay: 1, weeklyReportTime: "08:00",
  });
  const [vmwareCfgLoaded, setVmwareCfgLoaded] = useState(false);
  const [vmwareSaving, setVmwareSaving] = useState(false);
  const [vmwareTesting, setVmwareTesting] = useState(false);
  const [vmwareTestResult, setVmwareTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [newVmwareUser, setNewVmwareUser] = useState("");
  const [showVmwarePassword, setShowVmwarePassword] = useState(false);
  const [newVmwareRecipient, setNewVmwareRecipient] = useState("");

  // Crash logs state
  const [crashEntries, setCrashEntries] = useState<CrashEntry[]>([]);
  const [crashTotal, setCrashTotal] = useState(0);
  const [crashPage, setCrashPage] = useState(1);
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashLoaded, setCrashLoaded] = useState(false);
  const [crashFilters, setCrashFilters] = useState({ dateFrom: "", dateTo: "", source: "", level: "", text: "" });
  const [crashExpandedId, setCrashExpandedId] = useState<string | null>(null);

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

  const fetchSnapshots = useCallback(async () => {
    const res = await fetch("/api/admin/snapshots");
    if (res.ok) {
      const data = await res.json();
      setSnapshotList(data.snapshots ?? []);
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
      const data = await res.json();
      setChangelogSettings({
        retentionYears: data.retentionYears ?? 5,
        categories: data.categories ?? ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"],
      });
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

  const fetchOnCallSettings = useCallback(async () => {
    const res = await fetch("/api/oncall/settings");
    if (res.ok) {
      const data = await res.json();
      setOnCallSettings({
        allowedUsers: data.allowedUsers ?? [],
        emailEnabled: data.emailEnabled ?? false,
        emailRecipients: data.emailRecipients ?? [],
        emailSendTime: data.emailSendTime ?? "08:00",
      });
      setOnCallSettingsLoaded(true);
    }
  }, []);

  const fetchVmwareConfig = useCallback(async () => {
    const res = await fetch("/api/vmware/config");
    if (res.ok) {
      const data = await res.json();
      setVmwareCfg({
        enabled: !!data.enabled,
        vcenterUrl: data.vcenterUrl || "",
        username: data.username || "",
        password: "",
        passwordSet: !!data.passwordSet,
        ignoreSslErrors: !!data.ignoreSslErrors,
        allowedUsers: Array.isArray(data.allowedUsers) ? data.allowedUsers : [],
        cacheTtlMinutes: data.cacheTtlMinutes ?? 15,
        weeklyReportEnabled: !!data.weeklyReportEnabled,
        weeklyReportRecipients: Array.isArray(data.weeklyReportRecipients) ? data.weeklyReportRecipients : [],
        weeklyReportDay: data.weeklyReportDay ?? 1,
        weeklyReportTime: data.weeklyReportTime || "08:00",
      });
      setVmwareCfgLoaded(true);
    }
  }, []);

  const fetchProvisioningConfig = useCallback(async () => {
    const res = await fetch("/api/provisioning/config");
    if (res.ok) {
      const data = await res.json();
      setProvCfg({
        netbox: { url: data.netbox?.url || "", token: "", tokenSet: !!data.netbox?.tokenSet, siteId: data.netbox?.siteId ?? null, defaultRoleId: data.netbox?.defaultRoleId ?? null, ignoreSslErrors: !!data.netbox?.ignoreSslErrors },
        dns: { type: data.dns?.type || "microsoft", endpoint: data.dns?.endpoint || "", token: "", tokenSet: !!data.dns?.tokenSet, defaultZone: data.dns?.defaultZone || "", ignoreSslErrors: !!data.dns?.ignoreSslErrors },
        dhcp: { type: data.dhcp?.type || "microsoft", endpoint: data.dhcp?.endpoint || "", token: "", tokenSet: !!data.dhcp?.tokenSet, defaultScope: data.dhcp?.defaultScope || "", ignoreSslErrors: !!data.dhcp?.ignoreSslErrors },
        allowedUsers: Array.isArray(data.allowedUsers) ? data.allowedUsers : [],
        allowedDnsZones: Array.isArray(data.allowedDnsZones) ? data.allowedDnsZones : [],
        dnsFlushTargets: Array.isArray(data.dnsFlushTargets) ? data.dnsFlushTargets : [],
        adManagementEnabled: !!data.adManagementEnabled,
        adManagementAdminOnly: data.adManagementAdminOnly !== false,
      });
      setProvCfgLoaded(true);
    }
  }, []);

  const fetchDeviceProfiles = useCallback(async () => {
    const res = await fetch("/api/provisioning/device-profiles");
    if (res.ok) {
      const data = await res.json();
      setDeviceProfiles(data.profiles ?? []);
      setDeviceProfilesLoaded(true);
    }
  }, []);

  const fetchNetboxRefData = useCallback(async () => {
    const fetcher = (path: string) =>
      fetch(`/api/provisioning/netbox${path}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.results ?? [])
        .catch(() => []);
    const [roles, vlans, prefixes, manufacturers] = await Promise.all([
      fetcher("/dcim/device-roles/?limit=1000"),
      fetcher("/ipam/vlans/?limit=1000"),
      fetcher("/ipam/prefixes/?limit=1000"),
      fetcher("/dcim/manufacturers/?limit=1000"),
    ]);
    setNbRoles(roles);
    setNbVlans(vlans);
    setNbPrefixes(prefixes);
    setNbManufacturers(manufacturers);
    if (roles.length || vlans.length || prefixes.length || manufacturers.length) setNbRefLoaded(true);
  }, []);

  const fetchCrashLogs = useCallback(async (filters: typeof crashFilters, page: number) => {
    setCrashLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.source) params.set("source", filters.source);
    if (filters.level) params.set("level", filters.level);
    if (filters.text) params.set("text", filters.text);
    const res = await fetch(`/api/crash-logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCrashEntries(data.entries ?? []);
      setCrashTotal(data.total ?? 0);
    }
    setCrashLoading(false);
    setCrashLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const copySvcSecret = async (id: string, secret: string) => {
    await copyToClipboard(secret);
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
    <div className="min-h-screen bg-surface-alt flex">
      {/* Sidebar Navigation */}
      <aside className="w-60 shrink-0 bg-surface border-r border-border sticky top-0 h-screen overflow-y-auto">
        <div className="p-5">
          <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-lg font-bold text-text-primary mt-5 mb-6">Administration</h1>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 mb-1.5">General</p>
          <nav className="space-y-0.5 mb-5">
            <button onClick={() => setTab("users")} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "users" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Users className="w-4 h-4 shrink-0" /> Users
            </button>
            <button onClick={() => setTab("spaces")} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "spaces" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Layout className="w-4 h-4 shrink-0" /> Spaces
            </button>
            <button onClick={() => { setTab("groups"); if (!groupsLoaded) fetchUserGroups(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "groups" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <UsersRound className="w-4 h-4 shrink-0" /> Groups
            </button>
          </nav>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 mb-1.5">Security</p>
          <nav className="space-y-0.5 mb-5">
            <button onClick={() => { setTab("service-keys"); if (!svcKeysLoaded) fetchServiceKeys(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "service-keys" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Key className="w-4 h-4 shrink-0" /> Service Keys
            </button>
            <button onClick={() => { setTab("audit"); if (auditConfirmed) { if (!auditConfigLoaded) fetchAuditConfig(); fetchCalendar(calYear, calMonth); fetchAuditLogs(explorerFilters, 1); } }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "audit" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <ClipboardList className="w-4 h-4 shrink-0" /> Audit
            </button>
          </nav>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 mb-1.5">System</p>
          <nav className="space-y-0.5 mb-5">
            <button onClick={() => { setTab("settings"); if (!smtpLoaded) fetchSmtp(); fetchKeyInfo(); if (!storageLoaded) fetchStorageConfig(); if (!changelogSettingsLoaded) fetchChangelogSettings(); if (!adLoaded) fetchAdConfig(); if (!dashAccessLoaded) fetchDashboardAccess(); if (!onCallSettingsLoaded) fetchOnCallSettings(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "settings" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Settings className="w-4 h-4 shrink-0" /> Settings
            </button>
            <button onClick={() => { setTab("backup"); if (!backupLoaded) fetchBackup(); fetchSnapshots(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "backup" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <HardDrive className="w-4 h-4 shrink-0" /> Backup
            </button>
            <button onClick={() => { setTab("crash-logs"); if (!crashLoaded) fetchCrashLogs(crashFilters, 1); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "crash-logs" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <AlertTriangle className="w-4 h-4 shrink-0" /> Crash Logs
            </button>
          </nav>

          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 mb-1.5">Integrations</p>
          <nav className="space-y-0.5">
            <button onClick={() => { setTab("vmware"); if (!vmwareCfgLoaded) fetchVmwareConfig(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "vmware" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Network className="w-4 h-4 shrink-0" /> VMware
            </button>
            <button onClick={() => { setTab("mirth"); fetchMirthServers(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "mirth" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <GitBranch className="w-4 h-4 shrink-0" /> Mirth
            </button>
            <button onClick={() => { setTab("provisioning"); if (!provCfgLoaded) { fetchProvisioningConfig(); fetchDeviceProfiles(); } if (!nbRefLoaded) fetchNetboxRefData(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${tab === "provisioning" ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-muted hover:text-text-primary"}`}>
              <Server className="w-4 h-4 shrink-0" /> Provisioning
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 py-8 px-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Toast notifications */}
          {(error || success) && (
            <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-[slideUp_0.2s_ease-out]">
              {error && <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg shadow-lg">{error}</div>}
              {success && <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg shadow-lg">{success}</div>}
            </div>
          )}
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
                          } catch {
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

            {/* Snapshots card */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Data Snapshots</h2>
                  <p className="text-xs text-text-muted mt-0.5">Lightweight local snapshots for fast rollback. Created automatically before upgrades.</p>
                </div>
                <button
                  disabled={snapshotCreating}
                  onClick={async () => {
                    setSnapshotCreating(true); setSnapshotStatus("");
                    try {
                      const res = await fetch("/api/admin/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "manual" }) });
                      const d = await res.json();
                      if (res.ok) { setSnapshotStatus(`✅ Snapshot created: ${d.snapshot?.id}`); fetchSnapshots(); }
                      else setSnapshotStatus(`❌ ${d.error || "Failed"}`);
                    } catch { setSnapshotStatus("❌ Snapshot creation failed"); }
                    finally { setSnapshotCreating(false); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  {snapshotCreating ? "Creating…" : "Create Snapshot"}
                </button>
              </div>
              {snapshotStatus && (
                <div className={`mx-6 mt-4 px-3 py-2 rounded-lg text-sm ${snapshotStatus.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{snapshotStatus}</div>
              )}
              {snapshotList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-text-muted">No snapshots yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {snapshotList.map((s) => (
                    <div key={s.id} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary font-mono">{s.id}</p>
                        <p className="text-xs text-text-muted">{new Date(s.createdAt).toLocaleString()} · {s.label}</p>
                      </div>
                      <button
                        disabled={snapshotRestoring === s.id}
                        onClick={async () => {
                          if (!confirm(`Restore snapshot "${s.id}"?\n\nThis will OVERWRITE current config, docs, logs, archive, and history directories.\n\nA pre-restore snapshot will be created automatically as a safety net.`)) return;
                          setSnapshotRestoring(s.id);
                          try {
                            const res = await fetch(`/api/admin/snapshots/${encodeURIComponent(s.id)}/restore`, { method: "POST" });
                            if (res.ok) { flash(`Restored from snapshot ${s.id}`, "success"); fetchSnapshots(); }
                            else { const d = await res.json(); flash(d.error || "Restore failed", "error"); }
                          } catch { flash("Restore failed", "error"); }
                          finally { setSnapshotRestoring(null); }
                        }}
                        className="p-1.5 rounded hover:bg-blue-50 text-text-muted hover:text-blue-600 disabled:opacity-50"
                        title="Restore this snapshot"
                      >
                        <RotateCcw className={`w-4 h-4 ${snapshotRestoring === s.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete snapshot "${s.id}"?`)) return;
                          const res = await fetch(`/api/admin/snapshots/${encodeURIComponent(s.id)}`, { method: "DELETE" });
                          if (res.ok) fetchSnapshots();
                          else flash("Failed to delete snapshot", "error");
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
                      onClick={async () => { await copyToClipboard(keyRevealed); flash("Key copied to clipboard", "success"); }}
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
                        onClick={async () => { await copyToClipboard(keyRotationResult.newKey); flash("New key copied", "success"); }}
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

          {/* On-Call settings */}
          <div className="bg-surface rounded-xl shadow-sm border border-border mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">On-Call Reports</h2>
              <p className="text-xs text-text-muted mt-1">Configure access and weekly email digest for the On-Call Reports module.</p>
            </div>
            <div className="px-6 py-4 space-y-6">
              {/* Allowed users */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Users</h3>
                <p className="text-xs text-text-muted mb-3">Users who can access and create on-call reports. Admins always have access.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {onCallSettings.allowedUsers.map((u, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
                      {u}
                      <button onClick={() => setOnCallSettings({ ...onCallSettings, allowedUsers: onCallSettings.allowedUsers.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {onCallSettings.allowedUsers.length === 0 && <span className="text-xs text-text-muted">No users configured (admins only)</span>}
                </div>
                <div className="flex gap-2 max-w-xs">
                  <input type="text" value={newOnCallUser} onChange={(e) => setNewOnCallUser(e.target.value)} placeholder="username" className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === "Enter" && newOnCallUser.trim()) { setOnCallSettings({ ...onCallSettings, allowedUsers: [...onCallSettings.allowedUsers, newOnCallUser.trim()] }); setNewOnCallUser(""); } }} />
                  <button disabled={!newOnCallUser.trim()} onClick={() => { setOnCallSettings({ ...onCallSettings, allowedUsers: [...onCallSettings.allowedUsers, newOnCallUser.trim()] }); setNewOnCallUser(""); }} className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                </div>
              </div>

              {/* Email digest */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Weekly Email Digest</h3>
                <p className="text-xs text-text-muted mb-3">Send a summary of last week's calls every Monday morning. Requires SMTP to be configured.</p>
                <label className="flex items-center gap-2 text-sm text-text-secondary mb-3">
                  <input type="checkbox" checked={onCallSettings.emailEnabled} onChange={(e) => setOnCallSettings({ ...onCallSettings, emailEnabled: e.target.checked })} className="rounded" />
                  Enable weekly email digest
                </label>
                <div className="max-w-xs mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send time (Monday)</label>
                  <input type="time" value={onCallSettings.emailSendTime} onChange={(e) => setOnCallSettings({ ...onCallSettings, emailSendTime: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Recipients</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {onCallSettings.emailRecipients.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full border border-border">
                        {r}
                        <button onClick={() => setOnCallSettings({ ...onCallSettings, emailRecipients: onCallSettings.emailRecipients.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <input type="email" value={newOnCallRecipient} onChange={(e) => setNewOnCallRecipient(e.target.value)} placeholder="email@example.com" className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === "Enter" && newOnCallRecipient.trim()) { setOnCallSettings({ ...onCallSettings, emailRecipients: [...onCallSettings.emailRecipients, newOnCallRecipient.trim()] }); setNewOnCallRecipient(""); } }} />
                    <button disabled={!newOnCallRecipient.trim()} onClick={() => { setOnCallSettings({ ...onCallSettings, emailRecipients: [...onCallSettings.emailRecipients, newOnCallRecipient.trim()] }); setNewOnCallRecipient(""); }} className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/oncall/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(onCallSettings),
                    });
                    if (res.ok) flash("On-Call settings saved", "success");
                    else { const d = await res.json(); flash(d.error || "Failed to save", "error"); }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Save On-Call Settings
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/oncall/send-report", { method: "POST" });
                    if (res.ok) {
                      const d = await res.json();
                      flash(`Weekly report sent to ${d.sent}/${d.total} recipients (${d.from} – ${d.to})`, "success");
                    } else {
                      const d = await res.json();
                      flash(d.error || "Failed to send report", "error");
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium border border-border text-text-muted rounded-lg hover:bg-muted transition-colors"
                >
                  Send Weekly Report Now
                </button>
              </div>
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
                  onChange={(e) => setChangelogSettings({ ...changelogSettings, retentionYears: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-muted mt-1">Change entries older than this are removed. Default: 5 years.</p>
              </div>

              {/* Categories */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Categories</label>
                <p className="text-xs text-text-muted mb-2">Categories available when logging a change. Must have at least one.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {changelogSettings.categories.map((cat) => (
                    <span key={cat} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-full border border-border">
                      {cat}
                      {changelogSettings.categories.length > 1 && (
                        <button
                          onClick={() => setChangelogSettings({
                            ...changelogSettings,
                            categories: changelogSettings.categories.filter((c) => c !== cat),
                          })}
                          className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                          title={`Remove "${cat}"`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 max-w-xs">
                  <input
                    type="text"
                    value={newChangelogCategory}
                    onChange={(e) => setNewChangelogCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = newChangelogCategory.trim();
                        if (val && !changelogSettings.categories.includes(val)) {
                          setChangelogSettings({ ...changelogSettings, categories: [...changelogSettings.categories, val] });
                          setNewChangelogCategory("");
                        }
                      }
                    }}
                    placeholder="New category…"
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      const val = newChangelogCategory.trim();
                      if (val && !changelogSettings.categories.includes(val)) {
                        setChangelogSettings({ ...changelogSettings, categories: [...changelogSettings.categories, val] });
                        setNewChangelogCategory("");
                      }
                    }}
                    disabled={!newChangelogCategory.trim() || changelogSettings.categories.includes(newChangelogCategory.trim())}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
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

        {/* VMware Tab */}
        {tab === "vmware" && (
          <div className="bg-surface rounded-xl shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Network className="w-4 h-4 text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">VMware Inventory</h2>
              <p className="ml-2 text-xs text-text-muted">Configure vCenter connection credentials and access control.</p>
            </div>
            <div className="px-6 py-6 space-y-6">

              {/* Enable toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${vmwareCfg.enabled ? "bg-accent" : "bg-gray-300"}`}
                    onClick={() => setVmwareCfg({ ...vmwareCfg, enabled: !vmwareCfg.enabled })}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${vmwareCfg.enabled ? "translate-x-5" : ""}`} />
                  </div>
                </label>
                <span className="text-sm font-medium text-text-primary">Enable VMware Inventory module</span>
              </div>

              {/* vCenter URL */}
              <div className="max-w-md">
                <label className="block text-xs font-medium text-gray-600 mb-1">vCenter URL</label>
                <input
                  type="url"
                  value={vmwareCfg.vcenterUrl}
                  onChange={(e) => setVmwareCfg({ ...vmwareCfg, vcenterUrl: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://vcenter.example.com"
                />
              </div>

              {/* Username */}
              <div className="max-w-md">
                <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                <input
                  type="text"
                  value={vmwareCfg.username}
                  onChange={(e) => setVmwareCfg({ ...vmwareCfg, username: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="administrator@vsphere.local"
                />
              </div>

              {/* Password */}
              <div className="max-w-md">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Password {vmwareCfg.passwordSet && !vmwareCfg.password && <span className="text-green-600 font-normal">(set)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showVmwarePassword ? "text" : "password"}
                    value={vmwareCfg.password}
                    onChange={(e) => setVmwareCfg({ ...vmwareCfg, password: e.target.value })}
                    className="w-full px-3 py-1.5 pr-9 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={vmwareCfg.passwordSet ? "Leave blank to keep current" : "Enter password"}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    onClick={() => setShowVmwarePassword((v) => !v)}
                  >
                    {showVmwarePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Ignore SSL */}
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={vmwareCfg.ignoreSslErrors}
                  onChange={(e) => setVmwareCfg({ ...vmwareCfg, ignoreSslErrors: e.target.checked })}
                  className="rounded"
                />
                Ignore SSL certificate errors (for self-signed vCenter certificates)
              </label>

              {/* Allowed users */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Users</h3>
                <p className="text-xs text-text-muted mb-3">Users who can access the VMware Inventory module. Admins always have access.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {vmwareCfg.allowedUsers.map((u, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
                      {u}
                      <button onClick={() => setVmwareCfg({ ...vmwareCfg, allowedUsers: vmwareCfg.allowedUsers.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {vmwareCfg.allowedUsers.length === 0 && <span className="text-xs text-text-muted">No users configured (admins only)</span>}
                </div>
                <div className="flex gap-2 max-w-xs">
                  <input
                    type="text"
                    value={newVmwareUser}
                    onChange={(e) => setNewVmwareUser(e.target.value)}
                    placeholder="username"
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => { if (e.key === "Enter" && newVmwareUser.trim()) { setVmwareCfg({ ...vmwareCfg, allowedUsers: [...vmwareCfg.allowedUsers, newVmwareUser.trim()] }); setNewVmwareUser(""); } }}
                  />
                  <button
                    disabled={!newVmwareUser.trim()}
                    onClick={() => { setVmwareCfg({ ...vmwareCfg, allowedUsers: [...vmwareCfg.allowedUsers, newVmwareUser.trim()] }); setNewVmwareUser(""); }}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                  >Add</button>
                </div>
              </div>

              {/* Cache TTL */}
              <div className="max-w-xs">
                <label className="block text-xs font-medium text-gray-600 mb-1">Inventory Cache TTL (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={vmwareCfg.cacheTtlMinutes}
                  onChange={(e) => setVmwareCfg({ ...vmwareCfg, cacheTtlMinutes: parseInt(e.target.value) || 15 })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-muted mt-1">How long to cache the VM inventory. Use the Refresh button on the VMware page to force a reload.</p>
              </div>

              {/* Weekly Report */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Weekly Inventory Report</h3>
                <p className="text-xs text-text-muted mb-3">Send a weekly HTML email with VM inventory summary. Requires SMTP to be configured.</p>
                <label className="flex items-center gap-2 text-sm text-text-secondary mb-3">
                  <input
                    type="checkbox"
                    checked={vmwareCfg.weeklyReportEnabled}
                    onChange={(e) => setVmwareCfg({ ...vmwareCfg, weeklyReportEnabled: e.target.checked })}
                    className="rounded"
                  />
                  Enable weekly inventory report
                </label>
                <div className="grid grid-cols-2 gap-4 max-w-sm mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Day of week</label>
                    <select
                      value={vmwareCfg.weeklyReportDay}
                      onChange={(e) => setVmwareCfg({ ...vmwareCfg, weeklyReportDay: parseInt(e.target.value) })}
                      className="w-full text-sm border border-border rounded-lg px-3 py-1.5"
                    >
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Send time</label>
                    <input
                      type="time"
                      value={vmwareCfg.weeklyReportTime}
                      onChange={(e) => setVmwareCfg({ ...vmwareCfg, weeklyReportTime: e.target.value })}
                      className="w-full text-sm border border-border rounded-lg px-3 py-1.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Recipients</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {vmwareCfg.weeklyReportRecipients.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full border border-border">
                        {r}
                        <button onClick={() => setVmwareCfg({ ...vmwareCfg, weeklyReportRecipients: vmwareCfg.weeklyReportRecipients.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {vmwareCfg.weeklyReportRecipients.length === 0 && <span className="text-xs text-text-muted">No recipients added</span>}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <input
                      type="email"
                      value={newVmwareRecipient}
                      onChange={(e) => setNewVmwareRecipient(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => { if (e.key === "Enter" && newVmwareRecipient.trim()) { setVmwareCfg({ ...vmwareCfg, weeklyReportRecipients: [...vmwareCfg.weeklyReportRecipients, newVmwareRecipient.trim()] }); setNewVmwareRecipient(""); } }}
                    />
                    <button
                      disabled={!newVmwareRecipient.trim()}
                      onClick={() => { setVmwareCfg({ ...vmwareCfg, weeklyReportRecipients: [...vmwareCfg.weeklyReportRecipients, newVmwareRecipient.trim()] }); setNewVmwareRecipient(""); }}
                      className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                    >Add</button>
                  </div>
                </div>
              </div>

              {/* Test result */}
              {vmwareTestResult && (
                <div className={`text-sm px-4 py-3 rounded-lg border ${
                  vmwareTestResult.ok
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-red-50 border-red-300 text-red-800"
                }`}>
                  {vmwareTestResult.message}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  disabled={vmwareSaving}
                  onClick={async () => {
                    setVmwareSaving(true);
                    const body: Record<string, unknown> = {
                      enabled: vmwareCfg.enabled,
                      vcenterUrl: vmwareCfg.vcenterUrl.trim(),
                      username: vmwareCfg.username.trim(),
                      ignoreSslErrors: vmwareCfg.ignoreSslErrors,
                      allowedUsers: vmwareCfg.allowedUsers,
                      cacheTtlMinutes: vmwareCfg.cacheTtlMinutes,
                      weeklyReportEnabled: vmwareCfg.weeklyReportEnabled,
                      weeklyReportRecipients: vmwareCfg.weeklyReportRecipients,
                      weeklyReportDay: vmwareCfg.weeklyReportDay,
                      weeklyReportTime: vmwareCfg.weeklyReportTime,
                    };
                    if (vmwareCfg.password) body.password = vmwareCfg.password;
                    const res = await fetch("/api/vmware/config", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    setVmwareSaving(false);
                    if (res.ok) {
                      setVmwareCfg({ ...vmwareCfg, password: "", passwordSet: vmwareCfg.password ? true : vmwareCfg.passwordSet });
                      flash("VMware settings saved", "success");
                    } else {
                      const d = await res.json();
                      flash(d.error || "Failed to save VMware settings", "error");
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {vmwareSaving ? "Saving…" : "Save VMware Settings"}
                </button>
                <button
                  disabled={vmwareTesting}
                  onClick={async () => {
                    setVmwareTesting(true);
                    setVmwareTestResult(null);
                    const res = await fetch("/api/vmware/vms");
                    setVmwareTesting(false);
                    if (res.ok) {
                      const d = await res.json();
                      setVmwareTestResult({ ok: true, message: `Connection successful — ${d.vms?.length ?? 0} VM(s) found` });
                    } else {
                      const d = await res.json();
                      setVmwareTestResult({ ok: false, message: d.error || `HTTP ${res.status}` });
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium border border-border text-text-muted rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {vmwareTesting ? "Testing…" : "Test Connection"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mirth Tab */}
        {tab === "mirth" && (
          <div className="space-y-4">
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-accent" />
                <h2 className="text-lg font-semibold text-text-primary">Mirth Connect Servers</h2>
                <button
                  onClick={() => { setEditingMirthId(null); setMirthForm(emptyMirthForm()); setShowMirthForm(true); }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Server
                </button>
              </div>

              {/* Add / Edit form */}
              {showMirthForm && (
                <div className="px-6 py-4 bg-gray-50 border-b border-border">
                  <p className="text-xs font-semibold text-gray-600 mb-3">{editingMirthId ? "Edit Server" : "New Server"}</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input type="text" value={mirthForm.name} onChange={(e) => setMirthForm({ ...mirthForm, name: e.target.value })} placeholder="Production Mirth" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                      <input type="url" value={mirthForm.url} onChange={(e) => setMirthForm({ ...mirthForm, url: e.target.value })} placeholder="https://mirth.example.com:8443" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                      <input type="text" value={mirthForm.username} onChange={(e) => setMirthForm({ ...mirthForm, username: e.target.value })} placeholder="admin" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Password {editingMirthId && <span className="font-normal text-text-muted">(leave blank to keep current)</span>}</label>
                      <input type="password" value={mirthForm.password} onChange={(e) => setMirthForm({ ...mirthForm, password: e.target.value })} placeholder={editingMirthId ? "unchanged" : "••••••••"} autoComplete="new-password" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                      <input type="number" value={mirthForm.sortOrder} onChange={(e) => setMirthForm({ ...mirthForm, sortOrder: parseInt(e.target.value) || 0 })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-end gap-4 pb-1">
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={mirthForm.ignoreSslErrors} onChange={(e) => setMirthForm({ ...mirthForm, ignoreSslErrors: e.target.checked })} className="rounded" />
                        Ignore SSL errors
                      </label>
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={mirthForm.enabled} onChange={(e) => setMirthForm({ ...mirthForm, enabled: e.target.checked })} className="rounded" />
                        Enabled
                      </label>
                    </div>
                  </div>
                {/* Notification config — only shown when editing an existing server */}
                {editingMirthId && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Notification Settings
                    </p>
                    {!mirthNotifLoaded ? (
                      <p className="text-xs text-text-muted">Loading…</p>
                    ) : (
                      <>
                        <p className="text-xs text-text-muted mb-2">Send an alert when a channel health transitions to:</p>
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          {([
                            { key: "alertError"  as const, label: "Error"  },
                            { key: "alertStuck"  as const, label: "Stuck"  },
                            { key: "alertDown"   as const, label: "Down"   },
                            { key: "alertPaused" as const, label: "Paused" },
                          ]).map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                              <input type="checkbox" checked={mirthNotif[key]}
                                onChange={e => setMirthNotif(p => ({ ...p, [key]: e.target.checked }))}
                                className="rounded" />
                              {label}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-text-muted mb-1">Email recipients (leave empty to use default admin addresses):</p>
                        <div className="flex gap-2 mb-2">
                          <input type="email" value={mirthNotifEmail}
                            onChange={e => setMirthNotifEmail(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = mirthNotifEmail.trim();
                                if (v && !mirthNotif.recipients.includes(v)) setMirthNotif(p => ({ ...p, recipients: [...p.recipients, v] }));
                                setMirthNotifEmail("");
                              }
                            }}
                            placeholder="email@example.com"
                            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <button type="button"
                            onClick={() => {
                              const v = mirthNotifEmail.trim();
                              if (v && !mirthNotif.recipients.includes(v)) setMirthNotif(p => ({ ...p, recipients: [...p.recipients, v] }));
                              setMirthNotifEmail("");
                            }}
                            disabled={!mirthNotifEmail.trim()}
                            className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">
                            Add
                          </button>
                        </div>
                        {mirthNotif.recipients.length === 0 ? (
                          <p className="text-xs text-text-muted italic">No overrides — using default admin email list.</p>
                        ) : (
                          <div className="space-y-1 mb-3">
                            {mirthNotif.recipients.map(email => (
                              <div key={email} className="flex items-center justify-between px-2.5 py-1.5 rounded border border-border bg-gray-50 text-xs">
                                <span className="text-text-secondary">{email}</span>
                                <button type="button" onClick={() => setMirthNotif(p => ({ ...p, recipients: p.recipients.filter(e => e !== email) }))}
                                  className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button"
                          disabled={mirthNotifSaving}
                          onClick={async () => {
                            setMirthNotifSaving(true);
                            const r = await fetch(`/api/mirth/servers/${editingMirthId}/notifications`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(mirthNotif),
                            }).catch(() => null);
                            setMirthNotifSaving(false);
                            if (r?.ok) flash("Notification settings saved", "success");
                            else {
                              const d = r ? await r.json().catch(() => ({})) : {};
                              flash(d.error || "Failed to save notification settings", "error");
                            }
                          }}
                          className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                          {mirthNotifSaving ? "Saving…" : "Save Notifications"}
                        </button>
                      </>
                    )}
                  </div>
                )}

                  <div className="flex gap-2 mt-4">
                    <button
                      disabled={mirthSaving || !mirthForm.name.trim() || !mirthForm.url.trim()}
                      onClick={async () => {
                        setMirthSaving(true);
                        const body: Record<string, unknown> = {
                          name: mirthForm.name.trim(),
                          url: mirthForm.url.trim(),
                          username: mirthForm.username.trim(),
                          ignoreSslErrors: mirthForm.ignoreSslErrors,
                          enabled: mirthForm.enabled,
                          sortOrder: mirthForm.sortOrder,
                        };
                        if (mirthForm.password) body.password = mirthForm.password;
                        const res = editingMirthId
                          ? await fetch(`/api/mirth/servers/${editingMirthId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
                          : await fetch("/api/mirth/servers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
                        setMirthSaving(false);
                        if (res?.ok) {
                          setShowMirthForm(false);
                          setEditingMirthId(null);
                          setMirthForm(emptyMirthForm());
                          setMirthNotif(emptyMirthNotif());
                          setMirthNotifLoaded(false);
                          fetchMirthServers();
                        } else {
                          const d = res ? await res.json().catch(() => ({})) : {};
                          flash(d.error || "Failed to save server", "error");
                        }
                      }}
                      className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                    >
                      {mirthSaving ? "Saving…" : editingMirthId ? "Update Connection" : "Create"}
                    </button>
                    <button type="button" onClick={() => { setShowMirthForm(false); setEditingMirthId(null); setMirthForm(emptyMirthForm()); setMirthNotif(emptyMirthNotif()); setMirthNotifLoaded(false); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-text-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Server list */}
              {mirthServers.length === 0 ? (
                <p className="px-6 py-6 text-sm text-text-muted text-center">No Mirth Connect servers configured.</p>
              ) : (
                <div className="divide-y divide-border">
                  {mirthServers.map((s) => {
                    const testResult = mirthTestResults[s.id];
                    return (
                      <div key={s.id} className="flex items-center gap-4 px-6 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">{s.name}</span>
                            {!s.enabled && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">Disabled</span>}
                            {s.ignoreSslErrors && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded">SSL bypassed</span>}
                          </div>
                          <p className="text-xs text-text-muted font-mono">{s.url} · {s.username}</p>
                          {testResult && (
                            <p className={`text-xs mt-0.5 ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                              {testResult.ok ? `✓ Connected${testResult.version ? ` — Mirth ${testResult.version}` : ""}` : `✗ ${testResult.error}`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => testMirthServer(s.id)}
                            disabled={mirthTesting === s.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                            title="Test connection"
                          >
                            <Wifi className="w-3.5 h-3.5" />
                            {mirthTesting === s.id ? "Testing…" : "Test"}
                          </button>
                          <button
                          onClick={() => {
                              setEditingMirthId(s.id);
                              setMirthForm({ name: s.name, url: s.url, username: s.username, password: "", ignoreSslErrors: s.ignoreSslErrors, enabled: s.enabled, sortOrder: s.sortOrder });
                              setMirthNotif(emptyMirthNotif());
                              setMirthNotifLoaded(false);
                              setMirthNotifEmail("");
                              loadMirthNotifConfig(s.id);
                              setShowMirthForm(true);
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteMirthServer(s.id)}
                            disabled={mirthDeleting === s.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provisioning Tab */}
        {tab === "provisioning" && (
          <div className="space-y-6">
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Server className="w-4 h-4 text-accent" />
                <h2 className="text-lg font-semibold text-text-primary">Provisioning Configuration</h2>
                <p className="ml-2 text-xs text-text-muted">Netbox, DNS/DHCP agents, and access control.</p>
              </div>
              <div className="px-6 py-6 space-y-6">

                {/* Netbox */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">Netbox</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                      <input type="url" value={provCfg.netbox.url} onChange={(e) => setProvCfg({ ...provCfg, netbox: { ...provCfg.netbox, url: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://netbox.example.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Token {provCfg.netbox.tokenSet && !provCfg.netbox.token && <span className="text-green-600 font-normal">(set)</span>}</label>
                      <input type="password" value={provCfg.netbox.token} onChange={(e) => setProvCfg({ ...provCfg, netbox: { ...provCfg.netbox, token: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={provCfg.netbox.tokenSet ? "Leave blank to keep current" : "Enter API token"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Site ID</label>
                      <input type="number" value={provCfg.netbox.siteId ?? ""} onChange={(e) => setProvCfg({ ...provCfg, netbox: { ...provCfg.netbox, siteId: e.target.value ? parseInt(e.target.value) : null } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default Role ID</label>
                      <input type="number" value={provCfg.netbox.defaultRoleId ?? ""} onChange={(e) => setProvCfg({ ...provCfg, netbox: { ...provCfg.netbox, defaultRoleId: e.target.value ? parseInt(e.target.value) : null } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-text-secondary mt-3 cursor-pointer">
                    <input type="checkbox" checked={provCfg.netbox.ignoreSslErrors} onChange={(e) => setProvCfg({ ...provCfg, netbox: { ...provCfg.netbox, ignoreSslErrors: e.target.checked } })} className="rounded" />
                    Ignore SSL certificate errors
                  </label>
                </div>

                {/* DNS Agent */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">DNS Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL</label>
                      <input type="url" value={provCfg.dns.endpoint} onChange={(e) => setProvCfg({ ...provCfg, dns: { ...provCfg.dns, endpoint: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://dns-agent:5443" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Token {provCfg.dns.tokenSet && !provCfg.dns.token && <span className="text-green-600 font-normal">(set)</span>}</label>
                      <input type="password" value={provCfg.dns.token} onChange={(e) => setProvCfg({ ...provCfg, dns: { ...provCfg.dns, token: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={provCfg.dns.tokenSet ? "Leave blank to keep current" : "Enter token"} />
                    </div>
                  </div>
                  <div className="max-w-xs mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default Zone</label>
                    <input type="text" value={provCfg.dns.defaultZone} onChange={(e) => setProvCfg({ ...provCfg, dns: { ...provCfg.dns, defaultZone: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="example.com" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-text-secondary mt-3 cursor-pointer">
                    <input type="checkbox" checked={provCfg.dns.ignoreSslErrors} onChange={(e) => setProvCfg({ ...provCfg, dns: { ...provCfg.dns, ignoreSslErrors: e.target.checked } })} className="rounded" />
                    Ignore SSL certificate errors
                  </label>
                </div>

                {/* DHCP Agent */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">DHCP Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL</label>
                      <input type="url" value={provCfg.dhcp.endpoint} onChange={(e) => setProvCfg({ ...provCfg, dhcp: { ...provCfg.dhcp, endpoint: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://dhcp-agent:5443" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Token {provCfg.dhcp.tokenSet && !provCfg.dhcp.token && <span className="text-green-600 font-normal">(set)</span>}</label>
                      <input type="password" value={provCfg.dhcp.token} onChange={(e) => setProvCfg({ ...provCfg, dhcp: { ...provCfg.dhcp, token: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={provCfg.dhcp.tokenSet ? "Leave blank to keep current" : "Enter token"} />
                    </div>
                  </div>
                  <div className="max-w-xs mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default Scope</label>
                    <input type="text" value={provCfg.dhcp.defaultScope} onChange={(e) => setProvCfg({ ...provCfg, dhcp: { ...provCfg.dhcp, defaultScope: e.target.value } })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="10.0.0.0" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-text-secondary mt-3 cursor-pointer">
                    <input type="checkbox" checked={provCfg.dhcp.ignoreSslErrors} onChange={(e) => setProvCfg({ ...provCfg, dhcp: { ...provCfg.dhcp, ignoreSslErrors: e.target.checked } })} className="rounded" />
                    Ignore SSL certificate errors
                  </label>
                </div>

                {/* Allowed Users */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed Users</h3>
                  <p className="text-xs text-text-muted mb-3">Users who can access the Provisioning module. Admins always have access.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {provCfg.allowedUsers.map((u, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
                        {u}
                        <button onClick={() => setProvCfg({ ...provCfg, allowedUsers: provCfg.allowedUsers.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {provCfg.allowedUsers.length === 0 && <span className="text-xs text-text-muted">No users configured (admins only)</span>}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <input type="text" value={newProvUser} onChange={(e) => setNewProvUser(e.target.value)} placeholder="username" className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === "Enter" && newProvUser.trim()) { setProvCfg({ ...provCfg, allowedUsers: [...provCfg.allowedUsers, newProvUser.trim()] }); setNewProvUser(""); } }} />
                    <button disabled={!newProvUser.trim()} onClick={() => { setProvCfg({ ...provCfg, allowedUsers: [...provCfg.allowedUsers, newProvUser.trim()] }); setNewProvUser(""); }} className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                  </div>
                </div>

                {/* Allowed DNS Zones */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">Allowed DNS Zones</h3>
                  <p className="text-xs text-text-muted mb-3">DNS zones users may create records in. Leave empty to allow any zone.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {provCfg.allowedDnsZones.map((z, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
                        {z}
                        <button onClick={() => setProvCfg({ ...provCfg, allowedDnsZones: provCfg.allowedDnsZones.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {provCfg.allowedDnsZones.length === 0 && <span className="text-xs text-text-muted">No restrictions (all zones allowed)</span>}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <input type="text" value={newProvDnsZone} onChange={(e) => setNewProvDnsZone(e.target.value)} placeholder="example.com" className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === "Enter" && newProvDnsZone.trim()) { setProvCfg({ ...provCfg, allowedDnsZones: [...provCfg.allowedDnsZones, newProvDnsZone.trim()] }); setNewProvDnsZone(""); } }} />
                    <button disabled={!newProvDnsZone.trim()} onClick={() => { setProvCfg({ ...provCfg, allowedDnsZones: [...provCfg.allowedDnsZones, newProvDnsZone.trim()] }); setNewProvDnsZone(""); }} className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                  </div>
                </div>

                {/* DNS Flush Targets */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">DNS Cache Flush Targets</h3>
                  <p className="text-xs text-text-muted mb-3">Remote DNS forwarder/caching servers whose cache can be flushed from the DNS tab. Uses WinRM via the agent.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {provCfg.dnsFlushTargets.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                        {h}
                        <button onClick={() => setProvCfg({ ...provCfg, dnsFlushTargets: provCfg.dnsFlushTargets.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {provCfg.dnsFlushTargets.length === 0 && <span className="text-xs text-text-muted">No targets configured (only local agent cache will be flushed)</span>}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <input type="text" value={newFlushTarget} onChange={(e) => setNewFlushTarget(e.target.value)} placeholder="VXDNS01" className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === "Enter" && newFlushTarget.trim()) { setProvCfg({ ...provCfg, dnsFlushTargets: [...provCfg.dnsFlushTargets, newFlushTarget.trim()] }); setNewFlushTarget(""); } }} />
                    <button disabled={!newFlushTarget.trim()} onClick={() => { setProvCfg({ ...provCfg, dnsFlushTargets: [...provCfg.dnsFlushTargets, newFlushTarget.trim()] }); setNewFlushTarget(""); }} className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">Add</button>
                  </div>
                </div>

                {/* AD Management */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">Active Directory Management</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={provCfg.adManagementEnabled} onChange={(e) => setProvCfg({ ...provCfg, adManagementEnabled: e.target.checked })} className="rounded" />
                      Enable AD computer account management during provisioning
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={provCfg.adManagementAdminOnly} onChange={(e) => setProvCfg({ ...provCfg, adManagementAdminOnly: e.target.checked })} className="rounded" />
                      Restrict AD management to administrators only
                    </label>
                  </div>
                </div>

                {/* Test result */}
                {provTestResult && (
                  <div className={`text-sm px-4 py-3 rounded-lg border ${
                    provTestResult.ok
                      ? "bg-green-50 border-green-300 text-green-800"
                      : "bg-red-50 border-red-300 text-red-800"
                  }`}>
                    <strong>{provTestResult.target}:</strong> {provTestResult.message}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 border-t border-border pt-6">
                  <button
                    disabled={provSaving}
                    onClick={async () => {
                      setProvSaving(true);
                      const body: Record<string, unknown> = {
                        netbox: { url: provCfg.netbox.url.trim(), siteId: provCfg.netbox.siteId, defaultRoleId: provCfg.netbox.defaultRoleId, ignoreSslErrors: provCfg.netbox.ignoreSslErrors },
                        dns: { type: provCfg.dns.type, endpoint: provCfg.dns.endpoint.trim(), defaultZone: provCfg.dns.defaultZone.trim(), ignoreSslErrors: provCfg.dns.ignoreSslErrors },
                        dhcp: { type: provCfg.dhcp.type, endpoint: provCfg.dhcp.endpoint.trim(), defaultScope: provCfg.dhcp.defaultScope.trim(), ignoreSslErrors: provCfg.dhcp.ignoreSslErrors },
                        allowedUsers: provCfg.allowedUsers,
                        allowedDnsZones: provCfg.allowedDnsZones,
                        dnsFlushTargets: provCfg.dnsFlushTargets,
                        adManagementEnabled: provCfg.adManagementEnabled,
                        adManagementAdminOnly: provCfg.adManagementAdminOnly,
                      };
                      if (provCfg.netbox.token) (body.netbox as Record<string, unknown>).token = provCfg.netbox.token;
                      if (provCfg.dns.token) (body.dns as Record<string, unknown>).token = provCfg.dns.token;
                      if (provCfg.dhcp.token) (body.dhcp as Record<string, unknown>).token = provCfg.dhcp.token;
                      const res = await fetch("/api/provisioning/config", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      });
                      setProvSaving(false);
                      if (res.ok) {
                        flash("Provisioning settings saved", "success");
                        fetchProvisioningConfig();
                      } else {
                        const d = await res.json();
                        flash(d.error || "Failed to save provisioning settings", "error");
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {provSaving ? "Saving…" : "Save Provisioning Settings"}
                  </button>
                  {(["netbox", "dns", "dhcp"] as const).map((target) => (
                    <button
                      key={target}
                      disabled={provTesting !== null}
                      onClick={async () => {
                        setProvTesting(target);
                        setProvTestResult(null);
                        try {
                          const res = await fetch("/api/provisioning/config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ target }),
                          });
                          const d = await res.json();
                          setProvTestResult({ target, ok: !!d.ok, message: d.message || d.error || (d.ok ? "Connection successful" : "Connection failed") });
                        } catch {
                          setProvTestResult({ target, ok: false, message: "Network error" });
                        }
                        setProvTesting(null);
                      }}
                      className="px-3 py-2 text-sm font-medium border border-border text-text-muted rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {provTesting === target ? "Testing…" : `Test ${target.toUpperCase()}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Device Profiles */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Device Profiles</h2>
                  <p className="text-xs text-text-muted mt-0.5">Templates for device provisioning with pre-configured defaults.</p>
                </div>
                <button
                  onClick={() => { setEditingProfileId(null); setProfileForm(emptyProfile()); setShowProfileForm(true); if (!nbRefLoaded) fetchNetboxRefData(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Profile
                </button>
              </div>

              {/* Create / Edit form */}
              {showProfileForm && (
                <div className="px-6 py-4 bg-gray-50 border-b border-border">
                  <p className="text-xs font-semibold text-gray-600 mb-3">{editingProfileId ? "Edit Profile" : "New Profile"}</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input type="text" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="e.g. Windows Server" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Icon</label>
                      <div className="flex flex-wrap gap-1">
                        {PROFILE_ICON_OPTIONS.map((opt) => {
                          const Ic = opt.icon;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setProfileForm({ ...profileForm, icon: opt.value })}
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${profileForm.icon === opt.value ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-gray-400 text-gray-500"}`}
                              title={opt.label}
                            >
                              <Ic className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Netbox Role</label>
                      <select value={profileForm.netboxRoleId ?? ""} onChange={(e) => setProfileForm({ ...profileForm, netboxRoleId: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">— None —</option>
                        {nbRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default VLAN</label>
                      <select value={profileForm.defaultVlanId ?? ""} onChange={(e) => setProfileForm({ ...profileForm, defaultVlanId: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">— None —</option>
                        {nbVlans.map(v => <option key={v.id} value={v.id}>{v.name} (VLAN {v.vid})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default Prefix</label>
                      <select value={profileForm.defaultPrefixId ?? ""} onChange={(e) => setProfileForm({ ...profileForm, defaultPrefixId: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">— None —</option>
                        {nbPrefixes.map(p => <option key={p.id} value={p.id}>{p.prefix}{p.description ? ` — ${p.description}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default DNS Zone</label>
                      <input type="text" value={profileForm.defaultDnsZone} onChange={(e) => setProfileForm({ ...profileForm, defaultDnsZone: e.target.value })} placeholder="example.com" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default DHCP Scope</label>
                      <input type="text" value={profileForm.defaultDhcpScope} onChange={(e) => setProfileForm({ ...profileForm, defaultDhcpScope: e.target.value })} placeholder="10.0.0.0" className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                      <input type="number" value={profileForm.sortOrder} onChange={(e) => setProfileForm({ ...profileForm, sortOrder: parseInt(e.target.value) || 0 })} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-end gap-4 pb-1">
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={profileForm.requiresAssetTag} onChange={(e) => setProfileForm({ ...profileForm, requiresAssetTag: e.target.checked })} className="rounded" />
                        Requires asset tag
                      </label>
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={profileForm.autoCreateCmdb} onChange={(e) => setProfileForm({ ...profileForm, autoCreateCmdb: e.target.checked })} className="rounded" />
                        Auto-create CMDB entry
                      </label>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer Filter</label>
                      {nbManufacturers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 p-2 border border-border rounded-lg bg-white max-h-28 overflow-y-auto">
                          {nbManufacturers.map(m => (
                            <label key={m.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-colors ${profileForm.manufacturerFilter.includes(m.id) ? "bg-accent/10 text-accent border border-accent/30" : "bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100"}`}>
                              <input
                                type="checkbox"
                                checked={profileForm.manufacturerFilter.includes(m.id)}
                                onChange={(e) => {
                                  const ids = e.target.checked
                                    ? [...profileForm.manufacturerFilter, m.id]
                                    : profileForm.manufacturerFilter.filter((x: number) => x !== m.id);
                                  setProfileForm({ ...profileForm, manufacturerFilter: ids });
                                }}
                                className="sr-only"
                              />
                              {m.name}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted italic py-1">Connect Netbox to load manufacturers</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={profileSaving || !profileForm.name.trim()}
                      onClick={async () => {
                        setProfileSaving(true);
                        const body = { ...profileForm };
                        const res = editingProfileId
                          ? await fetch("/api/provisioning/device-profiles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: editingProfileId }) }).catch(() => null)
                          : await fetch("/api/provisioning/device-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
                        setProfileSaving(false);
                        if (res?.ok) {
                          setShowProfileForm(false);
                          setEditingProfileId(null);
                          setProfileForm(emptyProfile());
                          fetchDeviceProfiles();
                        } else {
                          const d = res ? await res.json().catch(() => ({})) : {};
                          flash(d.error || "Failed to save profile", "error");
                        }
                      }}
                      className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                    >
                      {profileSaving ? "Saving…" : editingProfileId ? "Update" : "Create"}
                    </button>
                    <button onClick={() => { setShowProfileForm(false); setEditingProfileId(null); setProfileForm(emptyProfile()); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-text-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Profile list */}
              {!deviceProfilesLoaded ? (
                <p className="px-6 py-6 text-sm text-text-muted text-center">Loading…</p>
              ) : deviceProfiles.length === 0 ? (
                <p className="px-6 py-6 text-sm text-text-muted text-center">No device profiles configured.</p>
              ) : (
                <div className="divide-y divide-border">
                  {deviceProfiles.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {(() => { const Ic = PROFILE_ICON_OPTIONS.find(o => o.value === p.icon)?.icon; return Ic ? <Ic className="w-4 h-4 text-text-muted" /> : null; })()}
                          <span className="text-sm font-medium text-text-primary">{p.name}</span>
                          {p.requiresAssetTag && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded">Asset tag required</span>}
                          {p.autoCreateCmdb && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded">Auto CMDB</span>}
                        </div>
                        <p className="text-xs text-text-muted">
                          {[p.defaultDnsZone && `DNS: ${p.defaultDnsZone}`, p.defaultDhcpScope && `DHCP: ${p.defaultDhcpScope}`, p.netboxRoleId && `Role: ${nbRoles.find(r => r.id === p.netboxRoleId)?.name ?? p.netboxRoleId}`].filter(Boolean).join(" · ") || "No defaults set"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditingProfileId(p.id);
                            setProfileForm({ ...p, manufacturerFilter: Array.isArray(p.manufacturerFilter) ? p.manufacturerFilter : [] });
                            setShowProfileForm(true);
                            if (!nbRefLoaded) fetchNetboxRefData();
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete profile "${p.name}"?`)) return;
                            await fetch("/api/provisioning/device-profiles", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) }).catch(() => {});
                            fetchDeviceProfiles();
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Crash Logs Tab */}
        {tab === "crash-logs" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-surface rounded-xl shadow-sm border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <h2 className="text-lg font-semibold text-text-primary">Crash Logs</h2>
                <span className="ml-auto text-xs text-text-muted">{crashTotal} total</span>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                    <input
                      type="date"
                      value={crashFilters.dateFrom}
                      onChange={(e) => setCrashFilters({ ...crashFilters, dateFrom: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                    <input
                      type="date"
                      value={crashFilters.dateTo}
                      onChange={(e) => setCrashFilters({ ...crashFilters, dateTo: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                    <select
                      value={crashFilters.source}
                      onChange={(e) => setCrashFilters({ ...crashFilters, source: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    >
                      <option value="">All</option>
                      <option value="server">Server</option>
                      <option value="client">Client</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                    <select
                      value={crashFilters.level}
                      onChange={(e) => setCrashFilters({ ...crashFilters, level: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    >
                      <option value="">All</option>
                      <option value="fatal">Fatal</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
                    <input
                      type="text"
                      value={crashFilters.text}
                      onChange={(e) => setCrashFilters({ ...crashFilters, text: e.target.value })}
                      placeholder="message, stack, url…"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                </div>
                <button
                  onClick={() => { setCrashPage(1); fetchCrashLogs(crashFilters, 1); }}
                  className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  {crashLoading ? "Loading…" : "Search"}
                </button>
              </div>
            </div>

            {/* Results */}
            {crashEntries.length === 0 && crashLoaded && (
              <div className="bg-surface rounded-xl shadow-sm border border-border px-6 py-8 text-center text-sm text-text-muted">
                No crash logs found.
              </div>
            )}

            {crashEntries.length > 0 && (
              <div className="bg-surface rounded-xl shadow-sm border border-border divide-y divide-border">
                {crashEntries.map((entry) => (
                  <div key={entry.id} className="px-6 py-3">
                    <button
                      onClick={() => setCrashExpandedId(crashExpandedId === entry.id ? null : entry.id)}
                      className="w-full text-left flex items-start gap-3"
                    >
                      <span className={`mt-0.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        entry.level === "fatal" ? "bg-red-500" : "bg-orange-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            entry.level === "fatal"
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}>{entry.level.toUpperCase()}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            entry.source === "server"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>{entry.source}</span>
                          <span className="text-xs text-text-muted">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-text-primary mt-1 truncate">{entry.message}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 mt-1 transition-transform ${
                        crashExpandedId === entry.id ? "rotate-180" : ""
                      }`} />
                    </button>

                    {crashExpandedId === entry.id && (
                      <div className="mt-3 ml-5 space-y-2">
                        {entry.url && (
                          <div className="text-xs"><span className="font-medium text-text-muted">URL:</span> <span className="text-text-primary">{entry.url}</span></div>
                        )}
                        {entry.method && (
                          <div className="text-xs"><span className="font-medium text-text-muted">Method:</span> <span className="text-text-primary">{entry.method}</span></div>
                        )}
                        {entry.userAgent && (
                          <div className="text-xs"><span className="font-medium text-text-muted">User Agent:</span> <span className="text-text-primary break-all">{entry.userAgent}</span></div>
                        )}
                        {entry.details && (
                          <div className="text-xs"><span className="font-medium text-text-muted">Details:</span> <span className="text-text-primary font-mono">{JSON.stringify(entry.details)}</span></div>
                        )}
                        {entry.stack && (
                          <pre className="text-xs bg-gray-50 border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-text-secondary font-mono">{entry.stack}</pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {crashTotal > 50 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Page {crashPage} of {Math.ceil(crashTotal / 50)}</span>
                <div className="flex gap-2">
                  <button
                    disabled={crashPage <= 1}
                    onClick={() => { const p = crashPage - 1; setCrashPage(p); fetchCrashLogs(crashFilters, p); }}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={crashPage >= Math.ceil(crashTotal / 50)}
                    onClick={() => { const p = crashPage + 1; setCrashPage(p); fetchCrashLogs(crashFilters, p); }}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>
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
