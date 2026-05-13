/**
 * VMware Inventory Module — server-only library.
 *
 * Connects to a vCenter REST API (v7+) and vSphere SOAP API to enumerate
 * VMs and their metrics. Configuration and credentials are stored in SQLite KV.
 * The password is AES-256-GCM encrypted via crypto.ts.
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig, getDb } from "./config";
import { encryptField, decryptField } from "./crypto";
import { addChangeRequest } from "./cmdb";
import { addChangeLogEntry } from "./changelog";
import { sendRawSyslog } from "./audit";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VmwareConfig {
  enabled: boolean;
  vcenterUrl: string;
  username: string;
  passwordEncrypted: string;
  ignoreSslErrors: boolean;
  allowedUsers: string[];
  cacheTtlMinutes: number;          // 0 = no cache, default 15
  weeklyReportEnabled: boolean;
  weeklyReportRecipients: string[];
  weeklyReportDay: number;          // 0=Sun … 6=Sat, default 1 (Mon)
  weeklyReportTime: string;         // "HH:MM"
  lastWeeklyReportAt?: string;      // ISO timestamp, debounce
}

export type VmPowerState = "POWERED_ON" | "POWERED_OFF" | "SUSPENDED";

export interface VmRecord {
  vmId: string;
  name: string;
  powerState: VmPowerState;
  host: string;
  guestOS: string;
  guestOSDisplay: string;
  guestOSFullName: string;
  toolsVersion: string;
  toolsStatus: string;
  memoryMiB: number;
  memoryUsedMiB: number | null;
  cpuCount: number;
  cpuUsageMhz: number | null;
  storageBytesProvisioned: number;
  ipAddress: string;
  annotation: string;
  hardwareVersion: string;
  snapshotCount: number;
}

export interface SnapshotInfo {
  moRef: string;
  name: string;
  description: string;
  createdAt: string;
  powerState: string;
  children: SnapshotInfo[];
}

export interface VmHostStats {
  physicalCpuCores: number;
  allocatedVcpus: number;
  ratio: number;
  totalCpuMhz: number;    // physicalCpuCores × cpuMhz (per core)
  usedCpuMhz: number;     // summary.quickStats.overallCpuUsage
  totalMemoryMiB: number; // summary.hardware.memorySize / 1 MiB
  usedMemoryMiB: number;  // summary.quickStats.overallMemoryUsage
}

export interface VmwareInventoryCache {
  vms: VmRecord[];
  fetchedAt: string;
  hostStats: Record<string, VmHostStats>;
}

export type VmChangeType = "host" | "memory" | "vcpu" | "disk";

// ── VM Deployment types ───────────────────────────────────────────────────────

export interface VmDeployTemplate {
  id: string;
  name: string;
  description: string;
  vcenterTemplateId: string;
  vcenterTemplateName: string;
  customizationSpec: string;
  defaultDatastoreId: string;
  defaultClusterId: string;
  defaultResourcePoolId: string;
  defaultFolderId: string;
  defaultNetworkId: string;
  defaultCpuCount: number | null;
  defaultMemoryMiB: number | null;
  icon: string;
  sortOrder: number;
}

export interface VmDeployRequest {
  deployTemplateId: string;
  vmName: string;
  ip: string;
  subnetMask: string;
  gateway: string;
  dns: string[];
  datastoreId?: string;
  clusterId?: string;
  resourcePoolId?: string;
  folderId?: string;
  networkId?: string;
  cpuCount?: number | null;
  memoryMiB?: number | null;
}

export type VmDeployStatus = "pending" | "running" | "success" | "failed";

export interface VmDeployHistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  vmName: string;
  templateName: string;
  ipAddress: string;
  status: VmDeployStatus;
  taskId: string;
  details: Record<string, unknown>;
}

export interface VcTemplate { vm: string; name: string; }
export interface VcCustomizationSpec { name: string; description?: string; }
export interface VcDatastore { datastore: string; name: string; type: string; capacity: number; free_space: number; }
export interface VcCluster { cluster: string; name: string; }
export interface VcResourcePool { resource_pool: string; name: string; }
export interface VcFolder { folder: string; name: string; type: string; }
export interface VcNetwork { network: string; name: string; type: string; }

export interface VmChangeEntry {
  id: number;
  timestamp: string;
  vmId: string;
  vmName: string;
  changeType: VmChangeType;
  oldValue: string;
  newValue: string;
}

// ── VM change tracking ────────────────────────────────────────────────────────

function initVmwareChangeTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vmware_vm_state (
      vm_id        TEXT PRIMARY KEY,
      vm_name      TEXT NOT NULL,
      host         TEXT NOT NULL,
      memory_mib   INTEGER NOT NULL,
      cpu_count    INTEGER NOT NULL,
      storage_bytes INTEGER NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vmware_vm_changes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL,
      vm_id        TEXT NOT NULL,
      vm_name      TEXT NOT NULL,
      change_type  TEXT NOT NULL,
      old_value    TEXT NOT NULL,
      new_value    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vmware_changes_ts
      ON vmware_vm_changes(timestamp DESC);
  `);
}

// Simple formatters for change request descriptions (server-side)
function _fmtMib(m: number): string { return m >= 1024 ? `${(m/1024).toFixed(1)} GB` : `${m} MB`; }
function _fmtBytes(b: number): string {
  if (b >= 1_099_511_627_776) return `${(b/1_099_511_627_776).toFixed(1)} TB`;
  if (b >= 1_073_741_824) return `${(b/1_073_741_824).toFixed(1)} GB`;
  return `${Math.round(b/1_048_576)} MB`;
}

async function detectAndLogVmChanges(vms: VmRecord[]): Promise<void> {
  try {
    initVmwareChangeTables();
    const db = getDb();
    const now = new Date().toISOString();
    const getState = db.prepare("SELECT host, memory_mib, cpu_count, storage_bytes FROM vmware_vm_state WHERE vm_id = ?");
    const insertChange = db.prepare(
      "INSERT INTO vmware_vm_changes (timestamp, vm_id, vm_name, change_type, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const upsertState = db.prepare(
      "INSERT OR REPLACE INTO vmware_vm_state (vm_id, vm_name, host, memory_mib, cpu_count, storage_bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    // Collect config changes that need a CMDB change request
    const configChanges: { vm: VmRecord; type: string; oldVal: string; newVal: string }[] = [];

    const run = db.transaction(() => {
      for (const vm of vms) {
        const prev = getState.get(vm.vmId) as { host: string; memory_mib: number; cpu_count: number; storage_bytes: number } | undefined;
        if (prev) {
          if (prev.host !== vm.host && vm.host && vm.host !== "Unknown")
            insertChange.run(now, vm.vmId, vm.name, "host", prev.host, vm.host);
          if (prev.memory_mib !== vm.memoryMiB && vm.memoryMiB > 0) {
            insertChange.run(now, vm.vmId, vm.name, "memory", String(prev.memory_mib), String(vm.memoryMiB));
            configChanges.push({ vm, type: "memory", oldVal: String(prev.memory_mib), newVal: String(vm.memoryMiB) });
          }
          if (prev.cpu_count !== vm.cpuCount && vm.cpuCount > 0) {
            insertChange.run(now, vm.vmId, vm.name, "vcpu", String(prev.cpu_count), String(vm.cpuCount));
            configChanges.push({ vm, type: "vcpu", oldVal: String(prev.cpu_count), newVal: String(vm.cpuCount) });
          }
          if (vm.storageBytesProvisioned > 0 && prev.storage_bytes !== vm.storageBytesProvisioned) {
            insertChange.run(now, vm.vmId, vm.name, "disk", String(prev.storage_bytes), String(vm.storageBytesProvisioned));
            configChanges.push({ vm, type: "disk", oldVal: String(prev.storage_bytes), newVal: String(vm.storageBytesProvisioned) });
          }
        }
        upsertState.run(vm.vmId, vm.name, vm.host || "", vm.memoryMiB, vm.cpuCount, vm.storageBytesProvisioned, now);
      }
    });
    run();

    // Forward all change types to syslog (VictoriaLogs) — fire-and-forget
    for (const { vm, type, oldVal, newVal } of configChanges) {
      sendRawSyslog(JSON.stringify({
        event: "vmware.change",
        changeType: type,
        vmId: vm.vmId,
        vmName: vm.name,
        host: vm.host,
        oldValue: oldVal,
        newValue: newVal,
        timestamp: now,
      }), "vmware.change").catch(() => {});
    }
    // Also forward host migration events (not in configChanges, already in DB)
    // They were inserted in the transaction loop — re-iterate to syslog them
    // (host changes are excluded from configChanges but already in vmware_vm_changes)

    // Create a CMDB RFC + Change Log CHG entry for each config change (memory / vCPU / disk)
    const today = now.slice(0, 10);
    for (const { vm, type, oldVal, newVal } of configChanges) {
      try {
        const typeLabels: Record<string, string> = { memory: "Memory", vcpu: "vCPU Count", disk: "Disk Size" };
        const label = typeLabels[type] ?? type;
        const oldFmt = type === "memory" ? _fmtMib(parseInt(oldVal)) : type === "disk" ? _fmtBytes(parseInt(oldVal)) : `${oldVal} vCPU`;
        const newFmt = type === "memory" ? _fmtMib(parseInt(newVal)) : type === "disk" ? _fmtBytes(parseInt(newVal)) : `${newVal} vCPU`;
        const changeDesc = `${label} changed from ${oldFmt} to ${newFmt} for VM "${vm.name}" on host ${vm.host}. Detected automatically by VMware inventory monitor.`;

        // 1. CMDB Change Request (RFC-XXXX)
        await addChangeRequest({
          title: `VM ${label} Change: ${vm.name}`,
          description: changeDesc,
          risk: type === "disk" ? "medium" : "low",
          status: "pending",
          affectedAssetIds: [],
          affectedServiceIds: [],
          rollbackPlan: `Revert ${label.toLowerCase()} of VM "${vm.name}" from ${newFmt} back to ${oldFmt} in vCenter.`,
          createdBy: "vmware-monitor",
        });

        // 2. Change Log entry (CHG-XXXXXX)
        await addChangeLogEntry({
          changeType: "Normal",
          date: today,
          author: "vmware-monitor",
          system: vm.name,
          category: type === "disk" ? "Disk" : "Configuration",
          description: changeDesc,
          impact: `VM ${label.toLowerCase()} modified — verify change was intentional and authorised.`,
          risk: type === "disk" ? "Medium" : "Low",
          status: "Completed",
        });

        console.log(`[vmware] Logged CHG + RFC for ${type} change on ${vm.name}`);
      } catch (crErr) {
        console.error(`[vmware] Failed to log change for ${vm.name}:`, crErr);
      }
    }
  } catch (e) {
    console.error("[vmware] detectAndLogVmChanges error:", e);
  }
}

export function getVmwareChanges(limit = 100): VmChangeEntry[] {
  try {
    initVmwareChangeTables();
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, timestamp, vm_id, vm_name, change_type, old_value, new_value FROM vmware_vm_changes ORDER BY id DESC LIMIT ?"
    ).all(limit) as { id: number; timestamp: string; vm_id: string; vm_name: string; change_type: string; old_value: string; new_value: string }[];
    return rows.map(r => ({
      id: r.id, timestamp: r.timestamp, vmId: r.vm_id, vmName: r.vm_name,
      changeType: r.change_type as VmChangeType, oldValue: r.old_value, newValue: r.new_value,
    }));
  } catch { return []; }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONFIG_FILE = "vmware-config.json";
const CACHE_FILE  = "vmware-inventory-cache.json";

const DEFAULT_CONFIG: VmwareConfig = {
  enabled: false,
  vcenterUrl: "",
  username: "",
  passwordEncrypted: "",
  ignoreSslErrors: false,
  allowedUsers: [],
  cacheTtlMinutes: 15,
  weeklyReportEnabled: false,
  weeklyReportRecipients: [],
  weeklyReportDay: 1,
  weeklyReportTime: "08:00",
};

// ── Config CRUD ────────────────────────────────────────────────────────────────

export async function readVmwareConfig(): Promise<VmwareConfig> {
  const cfg = await readJsonConfig<VmwareConfig>(CONFIG_FILE, { ...DEFAULT_CONFIG });
  return { ...DEFAULT_CONFIG, ...cfg };
}

export async function saveVmwareConfig(
  update: Partial<Omit<VmwareConfig, "passwordEncrypted">> & { password?: string },
): Promise<void> {
  const current = await readVmwareConfig();
  const next: VmwareConfig = {
    ...current,
    ...Object.fromEntries(Object.entries(update).filter(([k]) => k !== "password")),
  } as VmwareConfig;
  if (update.password && update.password.trim()) {
    next.passwordEncrypted = await encryptField(update.password.trim());
  }
  await writeJsonConfig(CONFIG_FILE, next);
}

// ── Access Control ─────────────────────────────────────────────────────────────

export async function isVmwareAllowed(username: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const cfg = await readVmwareConfig();
  if (!cfg.enabled) return false;
  return cfg.allowedUsers.includes(username);
}

// ── Inventory Cache ────────────────────────────────────────────────────────────

export async function getCachedInventory(ttlMinutes: number): Promise<VmwareInventoryCache | null> {
  if (ttlMinutes <= 0) return null;
  try {
    const cache = await readJsonConfig<VmwareInventoryCache | null>(CACHE_FILE, null);
  if (!cache?.fetchedAt || !Array.isArray(cache.vms) || !cache.hostStats || typeof cache.hostStats !== "object") return null;
    const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
    if (ageMs > ttlMinutes * 60_000) return null;
    return cache;
  } catch { return null; }
}

export async function setCachedInventory(cache: VmwareInventoryCache): Promise<void> {
  await writeJsonConfig(CACHE_FILE, cache);
}

// ── REST API helpers ───────────────────────────────────────────────────────────

async function vcFetch(url: string, options: RequestInit, ignoreSsl: boolean): Promise<Response> {
  if (ignoreSsl && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try { return await fetch(url, options); }
    finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
  return fetch(url, options);
}

async function getSessionToken(base: string, username: string, password: string, ignoreSsl: boolean): Promise<string> {
  const creds = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await vcFetch(`${base}/api/session`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
  }, ignoreSsl);
  if (!res.ok) throw new Error(`vCenter auth failed: ${res.status}`);
  const token = await res.json();
  if (typeof token !== "string") throw new Error("Unexpected session token");
  return token;
}

async function vcGet<T>(base: string, path: string, token: string, ignoreSsl: boolean): Promise<T> {
  const res = await vcFetch(`${base}${path}`, {
    headers: { "vmware-api-session-id": token, Accept: "application/json" },
  }, ignoreSsl);
  if (!res.ok) throw new Error(`vCenter API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

async function vcPost(base: string, path: string, token: string, ignoreSsl: boolean): Promise<Response> {
  return vcFetch(`${base}${path}`, {
    method: "POST",
    headers: { "vmware-api-session-id": token, "Content-Type": "application/json", Accept: "application/json" },
  }, ignoreSsl);
}

async function deleteSession(base: string, token: string, ignoreSsl: boolean): Promise<void> {
  await vcFetch(`${base}/api/session`, {
    method: "DELETE",
    headers: { "vmware-api-session-id": token },
  }, ignoreSsl).catch(() => {});
}

// ── REST types (partial) ──────────────────────────────────────────────────────

interface VcHostSummary { host: string; name: string; }
interface VcVmSummary { vm: string; name: string; power_state: VmPowerState; cpu_count: number; memory_size_MiB: number; }
interface VcVmDetail {
  guest_OS?: string;
  cpu?: { count?: number };
  memory?: { size_MiB?: number };
  disks?: Record<string, { capacity?: number }>;
  hardware?: { version?: string };
  placement?: { host?: string };
  runtime?: { host?: string };
  host?: string;
  [key: string]: unknown;
}
interface VcVmToolsInfo { version?: string; run_state?: string; }
interface VcGuestIdentity { full_name?: { default_message?: string }; }
interface VcGuestMemInfo { guest_memory_used?: number; }
interface VcGuestNetIface { ip_addresses?: { ip_address?: string }[]; }

// ── OS display mapping ────────────────────────────────────────────────────────

function guestOsDisplay(raw?: string): string {
  if (!raw) return "Unknown";
  const map: Record<string, string> = {
    // Windows Desktop
    WINDOWS_11_64:"Windows 11",WINDOWS_10_64:"Windows 10 (64-bit)",WINDOWS_10:"Windows 10",
    WINDOWS_9_64:"Windows 9 (64-bit)",WINDOWS_9:"Windows 9",
    WINDOWS_8_64:"Windows 8 (64-bit)",WINDOWS_7_64:"Windows 7 (64-bit)",
    WINDOWS_7:"Windows 7",WINDOWS_VISTA_64:"Windows Vista (64-bit)",
    WINDOWS_XP_64:"Windows XP (64-bit)",WINDOWS_XP:"Windows XP",
    WIN_2000_ADV_SERV:"Windows 2000 Advanced Server",WIN_2000_PRO:"Windows 2000 Professional",
    WIN_2000_SERV:"Windows 2000 Server",WIN_31:"Windows 3.1",WIN_95:"Windows 95",
    WIN_98:"Windows 98",WIN_ME:"Windows Me",WIN_NT:"Windows NT",
    // Windows Server
    WINDOWS_SERVER_2025_64:"Windows Server 2025",
    WINDOWS_SERVER_2022_64:"Windows Server 2022",WINDOWS_SERVER_2021_64:"Windows Server 2022",
    WINDOWS_SERVER_2019_64:"Windows Server 2019",WINDOWS_SERVER_2016_64:"Windows Server 2016",
    WINDOWS_SERVER_2012_R2_64:"Windows Server 2012 R2",WINDOWS_SERVER_2012_64:"Windows Server 2012",
    WINDOWS_SERVER_2008_R2_64:"Windows Server 2008 R2",WINDOWS_SERVER_2008_64:"Windows Server 2008 (64-bit)",
    WINDOWS_SERVER_2003_64:"Windows Server 2003 (64-bit)",WINDOWS_SERVER_2003:"Windows Server 2003",
    WIN_NET_ENTERPRISE_64:"Windows Server 2003 (64-bit)",WIN_NET_ENTERPRISE:"Windows Server 2003",
    WIN_NET_STANDARD_64:"Windows Server 2003 Std (64-bit)",WIN_NET_STANDARD:"Windows Server 2003 Std",
    WIN_LONG_HORN_64:"Windows Server 2008 (64-bit)",WIN_LONG_HORN:"Windows Server 2008",
    WIN_VISTA_GUEST_64:"Windows Vista (64-bit)",WIN_VISTA_GUEST:"Windows Vista",
    // RHEL / CentOS / Oracle (both underscore and no-underscore variants)
    RHEL_10_64:"RHEL 10 (64-bit)",RHEL10_64:"RHEL 10 (64-bit)",
    RHEL_9_64:"RHEL 9 (64-bit)",RHEL9_64:"RHEL 9 (64-bit)",
    RHEL_8_64:"RHEL 8 (64-bit)",RHEL8_64:"RHEL 8 (64-bit)",
    RHEL_7_64:"RHEL 7 (64-bit)",RHEL7_64:"RHEL 7 (64-bit)",
    RHEL_6_64:"RHEL 6 (64-bit)",RHEL6_64:"RHEL 6 (64-bit)",
    RHEL_5_64:"RHEL 5 (64-bit)",RHEL5_64:"RHEL 5 (64-bit)",
    RHEL_4_64:"RHEL 4 (64-bit)",RHEL4_64:"RHEL 4 (64-bit)",
    CENTOS_9_64:"CentOS 9 (64-bit)",CENTOS9_64:"CentOS 9 (64-bit)",
    CENTOS_8_64:"CentOS 8 (64-bit)",CENTOS8_64:"CentOS 8 (64-bit)",
    CENTOS_7_64:"CentOS 7 (64-bit)",CENTOS7_64:"CentOS 7 (64-bit)",
    CENTOS_6_64:"CentOS 6 (64-bit)",CENTOS6_64:"CentOS 6 (64-bit)",
    CENTOS_64:"CentOS (64-bit)",CENTOS_6:"CentOS 6",
    ORACLE_LINUX_8_64:"Oracle Linux 8 (64-bit)",ORACLELINUX_8_64:"Oracle Linux 8 (64-bit)",
    ORACLE_LINUX_7_64:"Oracle Linux 7 (64-bit)",ORACLELINUX_7_64:"Oracle Linux 7 (64-bit)",
    ORACLE_LINUX_6_64:"Oracle Linux 6 (64-bit)",ORACLELINUX_6_64:"Oracle Linux 6 (64-bit)",
    ORACLE_LINUX_64:"Oracle Linux (64-bit)",ORACLELINUX_64:"Oracle Linux (64-bit)",
    // Rocky / Alma
    ROCKYLINUX_64:"Rocky Linux (64-bit)",ROCKY_LINUX_64:"Rocky Linux (64-bit)",
    ALMALINUX_64:"AlmaLinux (64-bit)",ALMA_LINUX_64:"AlmaLinux (64-bit)",
    // Ubuntu / Debian
    UBUNTU_64:"Ubuntu (64-bit)",UBUNTU:"Ubuntu",
    DEBIAN_13_64:"Debian 13 (64-bit)",DEBIAN_12_64:"Debian 12 (64-bit)",
    DEBIAN_11_64:"Debian 11 (64-bit)",DEBIAN_10_64:"Debian 10 (64-bit)",
    DEBIAN_9_64:"Debian 9 (64-bit)",DEBIAN_8_64:"Debian 8 (64-bit)",
    DEBIAN_7_64:"Debian 7 (64-bit)",DEBIAN_6_64:"Debian 6 (64-bit)",
    // SUSE
    SLES_15_64:"SUSE Linux 15 (64-bit)",SLES15_64:"SUSE Linux 15 (64-bit)",
    SLES_12_64:"SUSE Linux 12 (64-bit)",SLES12_64:"SUSE Linux 12 (64-bit)",
    SLES_11_64:"SUSE Linux 11 (64-bit)",SLES11_64:"SUSE Linux 11 (64-bit)",
    OPENSUSE_64:"openSUSE (64-bit)",
    // FreeBSD
    FREEBSD_13_64:"FreeBSD 13 (64-bit)",FREEBSD13_64:"FreeBSD 13 (64-bit)",
    FREEBSD_12_64:"FreeBSD 12 (64-bit)",FREEBSD12_64:"FreeBSD 12 (64-bit)",
    FREEBSD_11_64:"FreeBSD 11 (64-bit)",FREEBSD11_64:"FreeBSD 11 (64-bit)",
    FREEBSD_64:"FreeBSD (64-bit)",
    // Other Linux / ESXi
    FEDORA_64:"Fedora (64-bit)",FEDORA:"Fedora",
    OTHER_26X_LINUX_64:"Linux (64-bit)",OTHER_3X_LINUX_64:"Linux (64-bit)",
    OTHER_4X_LINUX_64:"Linux (64-bit)",OTHER_5X_LINUX_64:"Linux (64-bit)",
    OTHER_6X_LINUX_64:"Linux (64-bit)",OTHER_LINUX_64:"Linux (64-bit)",OTHER_LINUX:"Linux",
    VMKERNEL8:"VMware ESXi 8",VMKERNEL7:"VMware ESXi 7",VMKERNEL6:"VMware ESXi 6",
    OTHER:"Other",OTHER_64:"Other (64-bit)",
  };

  // Direct map lookup
  if (map[raw]) return map[raw];

  // Normalize: remove underscores before digits (e.g. RHEL_6_64 → RHEL6_64) then retry
  const normalized = raw.replace(/_(?=\d)/g, "");
  if (normalized !== raw && map[normalized]) return map[normalized];

  // Regex patterns for Windows variants not in the static map
  const wsMatch = raw.match(/^WINDOWS_SERVER_(\d{4})(?:_R(\d))?(?: |_|$)/i);
  if (wsMatch) return `Windows Server ${wsMatch[1]}${wsMatch[2] ? ` R${wsMatch[2]}` : ""}`;
  const winMatch = raw.match(/^WINDOWS_(\d+)(_64)?/i);
  if (winMatch) return `Windows ${winMatch[1]}${winMatch[2] ? " (64-bit)" : ""}`;

  // Regex patterns for common Linux variants
  const rhelMatch = raw.match(/^RHEL_(\d+)(?:_(64))?/i);
  if (rhelMatch) return `RHEL ${rhelMatch[1]}${rhelMatch[2] ? " (64-bit)" : ""}`;
  const centosMatch = raw.match(/^CENTOS_(\d+)(?:_(64))?/i);
  if (centosMatch) return `CentOS ${centosMatch[1]}${centosMatch[2] ? " (64-bit)" : ""}`;
  const oracleMatch = raw.match(/^ORACLE_?LINUX_(\d+)(?:_(64))?/i);
  if (oracleMatch) return `Oracle Linux ${oracleMatch[1]}${oracleMatch[2] ? " (64-bit)" : ""}`;
  const slesMatch = raw.match(/^SLES_(\d+)(?:_(64))?/i);
  if (slesMatch) return `SUSE Linux ${slesMatch[1]}${slesMatch[2] ? " (64-bit)" : ""}`;
  if (/^OTHER_\d+X_LINUX_64/i.test(raw)) return "Linux (64-bit)";

  // Generic fallback
  return raw
    .replace(/_64$/, " (64-bit)")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── SOAP utilities ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function soapPost(url: string, body: string, cookie: string, ignoreSsl: boolean): Promise<string> {
  const res = await vcFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "urn:vim25/7.0",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  }, ignoreSsl);
  const text = await res.text();
  const faultString = text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1]?.trim();
  if (!res.ok) throw new Error(faultString ?? `SOAP ${res.status}`);
  // Detect faults in 200 OK responses (some vCenter versions)
  if (faultString) throw new Error(faultString);
  return text;
}

async function soapLogin(base: string, username: string, password: string, ignoreSsl: boolean): Promise<string> {
  const res = await vcFetch(`${base}/sdk`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "urn:vim25/7.0" },
    body: `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body><vim25:Login><_this type="SessionManager">SessionManager</_this><userName>${esc(username)}</userName><password>${esc(password)}</password></vim25:Login></soapenv:Body></soapenv:Envelope>`,
  }, ignoreSsl);
  if (!res.ok) throw new Error(`SOAP login failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  return cookie.match(/vmware_soap_session=[^;,]+/)?.[0] ?? "";
}

async function soapLogout(base: string, cookie: string, ignoreSsl: boolean): Promise<void> {
  await soapPost(`${base}/sdk`, `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body><vim25:Logout><_this type="SessionManager">SessionManager</_this></vim25:Logout></soapenv:Body></soapenv:Envelope>`, cookie, ignoreSsl).catch(() => {});
}

async function soapServiceContent(base: string, cookie: string, ignoreSsl: boolean): Promise<{ rootFolder: string; propCollector: string }> {
  const t = await soapPost(`${base}/sdk`, `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body><vim25:RetrieveServiceContent><_this type="ServiceInstance">ServiceInstance</_this></vim25:RetrieveServiceContent></soapenv:Body></soapenv:Envelope>`, cookie, ignoreSsl);
  const rootFolder = t.match(/<rootFolder[^>]*>([^<]+)<\/rootFolder>/)?.[1];
  const propCollector = t.match(/<propertyCollector[^>]*>([^<]+)<\/propertyCollector>/)?.[1];
  if (!rootFolder || !propCollector) throw new Error("Cannot parse ServiceContent");
  return { rootFolder, propCollector };
}

// ── SOAP bulk fetch ────────────────────────────────────────────────────────────

interface VmSoapData {
  hostMor: string;
  annotation: string;
  hardwareVersion: string;
  snapshotCount: number;
  guestFullName: string;      // summary.config.guestFullName
  summaryIpAddress: string;   // summary.guest.ipAddress (cached by vCenter)
  soapIpAddress: string;      // guest.ipAddress (live from Tools)
  memUsedMiB: number;         // summary.quickStats.guestMemoryUsage
  cpuUsedMhz: number;         // summary.quickStats.overallCpuUsage
}
interface HostSoapData {
  physicalCpuCores: number;
  cpuMhz: number;       // summary.hardware.cpuMhz (per core)
  memoryBytes: number;  // summary.hardware.memorySize
  usedCpuMhz: number;  // summary.quickStats.overallCpuUsage
  usedMemMiB: number;  // summary.quickStats.overallMemoryUsage
}

function parseSoapPage(
  xml: string,
  vmData: Record<string, VmSoapData>,
  hostData: Record<string, HostSoapData>,
): string | null {
  const objRx = /<objects>([\s\S]*?)<\/objects>/g;
  let m: RegExpExecArray | null;
  while ((m = objRx.exec(xml)) !== null) {
    const b = m[1];
    const vmMor = b.match(/<obj[^>]*type="VirtualMachine"[^>]*>([^<]+)<\/obj>/)?.[1];
    const hostMorObj = b.match(/<obj[^>]*type="HostSystem"[^>]*>([^<]+)<\/obj>/)?.[1];

    if (vmMor) {
      const hostMor = b.match(/<val[^>]*type="HostSystem"[^>]*>([^<]+)<\/val>/)?.[1] ?? "";
      const annotation = b.match(/summary\.config\.annotation<\/name>\s*<val[^>]*>([^<]*)<\/val>/)?.[1]?.trim() ?? "";
      const hwRaw = b.match(/config\.version<\/name>\s*<val[^>]*>([^<]+)<\/val>/)?.[1] ?? "";
      const hardwareVersion = hwRaw.toLowerCase().replace("vmx_", "vmx-");
      const snapXml = b.match(/\bsnapshot<\/name>[\s\S]*?<val[^>]*>([\s\S]*?)<\/val>/)?.[1] ?? "";
      const snapshotCount =
        (snapXml.match(/<rootSnapshotList>/g) ?? []).length +
        (snapXml.match(/<childSnapshotList>/g) ?? []).length;
      const guestFullName = b.match(/summary\.config\.guestFullName<\/name>\s*<val[^>]*>([^<]*)<\/val>/)?.[1]?.trim() ?? "";
      const summaryIpAddress = b.match(/summary\.guest\.ipAddress<\/name>\s*<val[^>]*>([^<]*)<\/val>/)?.[1]?.trim() ?? "";
      const soapIpAddress = b.match(/\bguest\.ipAddress<\/name>\s*<val[^>]*>([^<]*)<\/val>/)?.[1]?.trim() ?? "";
      const memUsedMiB = parseInt(b.match(/guestMemoryUsage<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      const cpuUsedMhz = parseInt(b.match(/overallCpuUsage<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      vmData[vmMor] = { hostMor, annotation, hardwareVersion, snapshotCount, guestFullName, summaryIpAddress, soapIpAddress, memUsedMiB, cpuUsedMhz };
    }
    if (hostMorObj) {
      const cores = parseInt(b.match(/numCpuCores<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      const cpuMhz = parseInt(b.match(/summary\.hardware\.cpuMhz<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      const memoryBytes = parseInt(b.match(/summary\.hardware\.memorySize<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      const usedCpuMhz = parseInt(b.match(/summary\.quickStats\.overallCpuUsage<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      const usedMemMiB = parseInt(b.match(/summary\.quickStats\.overallMemoryUsage<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      hostData[hostMorObj] = { physicalCpuCores: cores, cpuMhz, memoryBytes, usedCpuMhz, usedMemMiB };
    }
  }
  return xml.match(/<token>([^<]+)<\/token>/)?.[1] ?? null;
}

async function fetchVMDataViaSoap(
  base: string, username: string, password: string, ignoreSsl: boolean,
): Promise<{ vmData: Record<string, VmSoapData>; hostData: Record<string, HostSoapData> }> {
  const cookie = await soapLogin(base, username, password, ignoreSsl);
  try {
    const { rootFolder, propCollector } = await soapServiceContent(base, cookie, ignoreSsl);
    const soapUrl = `${base}/sdk`;

    // Use named traversal specs so ComputeResource/ClusterComputeResource hosts are found
    // regardless of folder depth (nested host folders, clusters, etc.)
    const rpeXml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
<soapenv:Body>
<RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <_this type="PropertyCollector">${esc(propCollector)}</_this>
  <specSet>
    <propSet><type>VirtualMachine</type><all>false</all>
      <pathSet>runtime.host</pathSet>
      <pathSet>summary.config.annotation</pathSet>
      <pathSet>summary.config.guestFullName</pathSet>
      <pathSet>summary.guest.ipAddress</pathSet>
      <pathSet>summary.quickStats.guestMemoryUsage</pathSet>
      <pathSet>summary.quickStats.overallCpuUsage</pathSet>
      <pathSet>config.version</pathSet>
      <pathSet>snapshot</pathSet>
      <pathSet>guest.ipAddress</pathSet>
    </propSet>
    <propSet><type>HostSystem</type><all>false</all>
      <pathSet>hardware.cpuInfo.numCpuCores</pathSet>
      <pathSet>summary.hardware.cpuMhz</pathSet>
      <pathSet>summary.hardware.memorySize</pathSet>
      <pathSet>summary.quickStats.overallCpuUsage</pathSet>
      <pathSet>summary.quickStats.overallMemoryUsage</pathSet>
    </propSet>
    <objectSet>
      <obj type="Folder">${esc(rootFolder)}</obj>
      <skip>false</skip>
      <!-- visitFolders: recurse into any Folder, and branch into DC/CR/CCR children -->
      <selectSet xsi:type="TraversalSpec">
        <name>visitFolders</name><type>Folder</type><path>childEntity</path><skip>false</skip>
        <selectSet xsi:type="SelectionSpec"><name>visitFolders</name></selectSet>
        <selectSet xsi:type="SelectionSpec"><name>dcToVms</name></selectSet>
        <selectSet xsi:type="SelectionSpec"><name>dcToHosts</name></selectSet>
        <selectSet xsi:type="SelectionSpec"><name>crToHosts</name></selectSet>
      </selectSet>
      <!-- dcToVms: Datacenter → vmFolder -->
      <selectSet xsi:type="TraversalSpec">
        <name>dcToVms</name><type>Datacenter</type><path>vmFolder</path><skip>false</skip>
        <selectSet xsi:type="SelectionSpec"><name>visitFolders</name></selectSet>
      </selectSet>
      <!-- dcToHosts: Datacenter → hostFolder -->
      <selectSet xsi:type="TraversalSpec">
        <name>dcToHosts</name><type>Datacenter</type><path>hostFolder</path><skip>false</skip>
        <selectSet xsi:type="SelectionSpec"><name>visitFolders</name></selectSet>
      </selectSet>
      <!-- crToHosts: ComputeResource (incl. ClusterComputeResource) → host -->
      <selectSet xsi:type="TraversalSpec">
        <name>crToHosts</name><type>ComputeResource</type><path>host</path><skip>false</skip>
      </selectSet>
    </objectSet>
  </specSet>
  <options/>
</RetrievePropertiesEx>
</soapenv:Body></soapenv:Envelope>`;

    const vmData: Record<string, VmSoapData> = {};
    const hostData: Record<string, HostSoapData> = {};

    const firstPage = await soapPost(soapUrl, rpeXml, cookie, ignoreSsl);
    let token = parseSoapPage(firstPage, vmData, hostData);
    console.log(`[vmware] SOAP page 1: ${Object.keys(vmData).length} VMs, ${Object.keys(hostData).length} hosts, token=${token ?? "none"}`);

    while (token) {
      const cont = await soapPost(soapUrl,
        `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ContinueRetrievePropertiesEx xmlns="urn:vim25"><_this type="PropertyCollector">${esc(propCollector)}</_this><token>${esc(token)}</token></ContinueRetrievePropertiesEx></soapenv:Body></soapenv:Envelope>`,
        cookie, ignoreSsl,
      );
      token = parseSoapPage(cont, vmData, hostData);
      console.log(`[vmware] SOAP cont: ${Object.keys(vmData).length} VMs total`);
    }

    return { vmData, hostData };
  } finally {
    await soapLogout(base, cookie, ignoreSsl);
  }
}

// ── Snapshot operations ────────────────────────────────────────────────────────

function parseSnapshotTree(xml: string): SnapshotInfo[] {
  const results: SnapshotInfo[] = [];
  const rx = /<rootSnapshotList>([\s\S]*?)<\/rootSnapshotList>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml)) !== null) results.push(parseSnapshotBlock(m[1]));
  return results;
}

function parseSnapshotBlock(block: string): SnapshotInfo {
  const moRef = block.match(/<snapshot[^>]*type="VirtualMachineSnapshot"[^>]*>([^<]+)<\/snapshot>/)?.[1] ?? "";
  const name = block.match(/<name>([^<]*)<\/name>/)?.[1] ?? "";
  const description = block.match(/<description>([^<]*)<\/description>/)?.[1] ?? "";
  const createdAt = block.match(/<createTime>([^<]+)<\/createTime>/)?.[1] ?? "";
  const powerState = block.match(/<state>([^<]+)<\/state>/)?.[1] ?? "";
  const children: SnapshotInfo[] = [];
  const crx = /<childSnapshotList>([\s\S]*?)<\/childSnapshotList>/g;
  let cm: RegExpExecArray | null;
  while ((cm = crx.exec(block)) !== null) children.push(parseSnapshotBlock(cm[1]));
  return { moRef, name, description, createdAt, powerState, children };
}

export async function listSnapshots(config: VmwareConfig, vmId: string): Promise<SnapshotInfo[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const cookie = await soapLogin(base, config.username, password, config.ignoreSslErrors);
  try {
    const { propCollector } = await soapServiceContent(base, cookie, config.ignoreSslErrors);
    const xml = await soapPost(`${base}/sdk`,
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><_this type="PropertyCollector">${esc(propCollector)}</_this><specSet><propSet><type>VirtualMachine</type><all>false</all><pathSet>snapshot</pathSet></propSet><objectSet><obj type="VirtualMachine">${esc(vmId)}</obj><skip>false</skip></objectSet></specSet><options/></RetrievePropertiesEx></soapenv:Body></soapenv:Envelope>`,
      cookie, config.ignoreSslErrors,
    );
    const valMatch = xml.match(/\bsnapshot<\/name>[\s\S]*?<val[^>]*>([\s\S]*?)<\/val>/);
    return valMatch ? parseSnapshotTree(valMatch[1]) : [];
  } finally {
    await soapLogout(base, cookie, config.ignoreSslErrors);
  }
}

export async function createSnapshot(
  config: VmwareConfig,
  vmId: string,
  name: string,
  description: string,
  includeMemory: boolean,
): Promise<void> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;

  // Try vSphere REST API first (7.0+)
  const token = await getSessionToken(base, config.username, password, ignoreSslErrors);
  try {
    const res = await vcFetch(`${base}/api/vcenter/vm/${encodeURIComponent(vmId)}/snapshots`, {
      method: "POST",
      headers: {
        "vmware-api-session-id": token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ name, description, memory: includeMemory, quiesce: false }),
    }, ignoreSslErrors);
    if (res.ok || res.status === 204) return; // success
    if (res.status !== 404 && res.status !== 405 && res.status !== 501) {
      // Definitive REST failure — extract message
      const d = await res.json().catch(() => ({}) as Record<string, unknown>);
      const msg = (d as { messages?: { default_message?: string }[] }).messages?.[0]?.default_message
        ?? (d as { error_message?: string }).error_message
        ?? `Snapshot creation failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    // 404/405/501 means endpoint not available — fall through to SOAP
  } finally {
    await deleteSession(base, token, ignoreSslErrors);
  }

  // SOAP fallback (vSphere 6.x or REST unavailable)
  const cookie = await soapLogin(base, config.username, password, ignoreSslErrors);
  try {
    await soapPost(`${base}/sdk`,
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><CreateSnapshot_Task xmlns="urn:vim25"><_this type="VirtualMachine">${esc(vmId)}</_this><name>${esc(name)}</name><description>${esc(description)}</description><memory>${includeMemory}</memory><quiesce>false</quiesce></CreateSnapshot_Task></soapenv:Body></soapenv:Envelope>`,
      cookie, ignoreSslErrors,
    );
  } finally {
    await soapLogout(base, cookie, ignoreSslErrors);
  }
}

export async function deleteSnapshot(config: VmwareConfig, snapshotMoRef: string, removeChildren: boolean): Promise<void> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const cookie = await soapLogin(base, config.username, password, config.ignoreSslErrors);
  try {
    await soapPost(`${base}/sdk`,
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><RemoveSnapshot_Task xmlns="urn:vim25"><_this type="VirtualMachineSnapshot">${esc(snapshotMoRef)}</_this><removeChildren>${removeChildren}</removeChildren><consolidate>true</consolidate></RemoveSnapshot_Task></soapenv:Body></soapenv:Envelope>`,
      cookie, config.ignoreSslErrors,
    );
  } finally {
    await soapLogout(base, cookie, config.ignoreSslErrors);
  }
}

// ── Power actions ──────────────────────────────────────────────────────────────

export async function powerAction(
  config: VmwareConfig,
  vmId: string,
  action: "start" | "stop" | "reset" | "suspend" | "shutdown" | "reboot",
): Promise<{ ok: boolean; error?: string }> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;
  const token = await getSessionToken(base, config.username, password, ignoreSslErrors);
  try {
    const isGuest = action === "shutdown" || action === "reboot";
    const path = isGuest
      ? `/api/vcenter/vm/${encodeURIComponent(vmId)}/guest/power?action=${action}`
      : `/api/vcenter/vm/${encodeURIComponent(vmId)}/power?action=${action}`;
    const res = await vcPost(base, path, token, ignoreSslErrors);
    if (res.ok || res.status === 204) return { ok: true };
    // Fallback to SOAP if REST filter-style APIs fail on this vCenter
    if (res.status === 400 || res.status === 405) {
      return powerActionViaSoap(base, config.username, password, vmId, action, ignoreSslErrors);
    }
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  } finally {
    await deleteSession(base, token, ignoreSslErrors);
  }
}

async function powerActionViaSoap(
  base: string, username: string, password: string,
  vmId: string, action: string, ignoreSsl: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ops: Record<string, string> = {
    start: "PowerOnVM_Task", stop: "PowerOffVM_Task",
    reset: "ResetVM_Task", suspend: "SuspendVM_Task",
    shutdown: "ShutdownGuest", reboot: "RebootGuest",
  };
  const op = ops[action];
  if (!op) return { ok: false, error: "Unknown action" };
  const cookie = await soapLogin(base, username, password, ignoreSsl);
  try {
    await soapPost(`${base}/sdk`,
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><${op} xmlns="urn:vim25"><_this type="VirtualMachine">${esc(vmId)}</_this></${op}></soapenv:Body></soapenv:Envelope>`,
      cookie, ignoreSsl,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await soapLogout(base, cookie, ignoreSsl);
  }
}

// ── Main inventory fetch ───────────────────────────────────────────────────────

export async function fetchVMs(config: VmwareConfig): Promise<VmwareInventoryCache> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;
  const token = await getSessionToken(base, config.username, password, ignoreSslErrors);

  try {
    const hosts = await vcGet<VcHostSummary[]>(base, "/api/vcenter/host", token, ignoreSslErrors);
    const hostMap: Record<string, string> = {};
    for (const h of hosts) hostMap[h.host] = h.name;
    console.log(`[vmware] Found ${hosts.length} hosts`);

    // SOAP bulk fetch
    const { vmData, hostData } = await fetchVMDataViaSoap(base, config.username, password, ignoreSslErrors);
    console.log(`[vmware] SOAP: ${Object.keys(vmData).length} VMs, ${Object.keys(hostData).length} hosts`);

    const vmList = await vcGet<VcVmSummary[]>(base, "/api/vcenter/vm", token, ignoreSslErrors);

    const CONCURRENCY = 10;
    const results: VmRecord[] = [];

    for (let i = 0; i < vmList.length; i += CONCURRENCY) {
      const batch = vmList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (vm) => {
        let detail: VcVmDetail = {};
        let tools: VcVmToolsInfo = {};
        let guestId: VcGuestIdentity = {};

        try { detail = await vcGet<VcVmDetail>(base, `/api/vcenter/vm/${vm.vm}`, token, ignoreSslErrors); } catch { /* non-fatal */ }
        try { tools = await vcGet<VcVmToolsInfo>(base, `/api/vcenter/vm/${vm.vm}/tools`, token, ignoreSslErrors); } catch { /* non-fatal */ }
        if (tools.run_state === "RUNNING") {
          try { guestId = await vcGet<VcGuestIdentity>(base, `/api/vcenter/vm/${vm.vm}/guest/identity`, token, ignoreSslErrors); } catch { /* non-fatal */ }
        }

        // Storage
        let storageBytesProvisioned = 0;
        if (detail.disks) for (const d of Object.values(detail.disks)) storageBytesProvisioned += d.capacity ?? 0;

        // Host resolution via SOAP data (primary)
        const soapVm = vmData[vm.vm];
        let hostName = soapVm?.hostMor ? (hostMap[soapVm.hostMor] || soapVm.hostMor) : "";
        if (!hostName) {
          const rawRef = detail.placement?.host || detail.runtime?.host;
          if (rawRef) {
            const norm = rawRef.includes(":") ? rawRef.split(":").pop()! : rawRef;
            hostName = hostMap[rawRef] || hostMap[norm] || norm;
          }
        }
        if (!hostName) hostName = "Unknown";

        // Hardware version
        const hwRest = (detail.hardware?.version ?? "").toLowerCase().replace("vmx_", "vmx-");
        const hardwareVersion = hwRest || soapVm?.hardwareVersion || "";

        // Memory in use — try REST first, fall back to SOAP quickStats (already in MiB)
        let memoryUsedMiB: number | null = null;
        if (tools.run_state === "RUNNING") {
          try {
            const gm = await vcGet<VcGuestMemInfo>(base, `/api/vcenter/vm/${vm.vm}/guest/memory`, token, ignoreSslErrors);
            if (typeof gm.guest_memory_used === "number" && gm.guest_memory_used > 0) {
              memoryUsedMiB = gm.guest_memory_used > 1_073_741_824
                ? Math.round(gm.guest_memory_used / (1024 * 1024))
                : gm.guest_memory_used;
            }
          } catch { /* non-fatal */ }
        }
        // SOAP fallback: summary.quickStats.guestMemoryUsage
        if (memoryUsedMiB === null && soapVm && soapVm.memUsedMiB > 0) {
          memoryUsedMiB = soapVm.memUsedMiB;
        }

        // CPU usage from SOAP quickStats (host-measured — no REST call needed)
        const cpuUsageMhz: number | null = soapVm && soapVm.cpuUsedMhz > 0 ? soapVm.cpuUsedMhz : null;

        // IP address — try REST networking, then fall back to SOAP cached values
        let ipAddress = "";
        if (tools.run_state === "RUNNING") {
          try {
            const ifaces = await vcGet<VcGuestNetIface[]>(base, `/api/vcenter/vm/${vm.vm}/guest/networking/interfaces`, token, ignoreSslErrors);
            outer: for (const iface of ifaces ?? []) {
              for (const ip of iface.ip_addresses ?? []) {
                const addr = ip.ip_address ?? "";
                if (addr && !addr.startsWith("169.254") && !addr.startsWith("fe80") && addr.includes(".")) {
                  ipAddress = addr; break outer;
                }
              }
            }
          } catch { /* non-fatal */ }
        }
        // SOAP fallbacks for IP (summary cached, then live guest property)
        if (!ipAddress) ipAddress = soapVm?.summaryIpAddress || soapVm?.soapIpAddress || "";

        return {
          vmId: vm.vm,
          name: vm.name,
          powerState: vm.power_state,
          host: hostName,
          guestOS: detail.guest_OS ?? "",
          guestOSDisplay: guestOsDisplay(detail.guest_OS ?? ""),
          guestOSFullName: guestId.full_name?.default_message || soapVm?.guestFullName || "",
          toolsVersion: tools.version ?? "",
          toolsStatus: tools.run_state ?? "",
          memoryMiB: vm.memory_size_MiB ?? detail.memory?.size_MiB ?? 0,
          memoryUsedMiB,
          cpuCount: vm.cpu_count ?? detail.cpu?.count ?? 0,
          cpuUsageMhz,
          storageBytesProvisioned,
          ipAddress,
          annotation: soapVm?.annotation ?? "",
          hardwareVersion,
          snapshotCount: soapVm?.snapshotCount ?? 0,
        } satisfies VmRecord;
      }));
      results.push(...batchResults);
    }

    results.sort((a, b) => a.name.localeCompare(b.name));

    // Host stats (oversubscription)
    const vcpuPerHost: Record<string, number> = {};
    for (const vm of results) {
      if (vm.powerState === "POWERED_ON") vcpuPerHost[vm.host] = (vcpuPerHost[vm.host] || 0) + vm.cpuCount;
    }
    const hostStats: Record<string, VmHostStats> = {};
    for (const h of hosts) {
      const name = h.name;
      const hd = hostData[h.host];
      const cores = hd?.physicalCpuCores ?? 0;
      const allocated = vcpuPerHost[name] ?? 0;
      const totalCpuMhz = (hd?.cpuMhz ?? 0) * cores;
      const totalMemoryMiB = hd?.memoryBytes ? Math.round(hd.memoryBytes / (1024 * 1024)) : 0;
      hostStats[name] = {
        physicalCpuCores: cores,
        allocatedVcpus: allocated,
        ratio: cores > 0 ? allocated / cores : 0,
        totalCpuMhz,
        usedCpuMhz: hd?.usedCpuMhz ?? 0,
        totalMemoryMiB,
        usedMemoryMiB: hd?.usedMemMiB ?? 0,
      };
    }

    await detectAndLogVmChanges(results);
    return { vms: results, fetchedAt: new Date().toISOString(), hostStats };
  } finally {
    await deleteSession(base, token, ignoreSslErrors);
  }
}

// ── Weekly report ──────────────────────────────────────────────────────────────

export function buildVmwareReportHtml(vms: VmRecord[], fetchedAt: string): string {
  const on = vms.filter((v) => v.powerState === "POWERED_ON").length;
  const off = vms.filter((v) => v.powerState === "POWERED_OFF").length;
  const suspended = vms.filter((v) => v.powerState === "SUSPENDED").length;
  const withSnaps = vms.filter((v) => v.snapshotCount > 0);

  const osCounts: Record<string, number> = {};
  const hostCounts: Record<string, number> = {};
  for (const vm of vms) {
    const os = vm.guestOSDisplay || "Unknown";
    osCounts[os] = (osCounts[os] || 0) + 1;
    hostCounts[vm.host] = (hostCounts[vm.host] || 0) + 1;
  }

  const th = `padding:6px 10px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase`;
  const td = `padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:0.85rem`;

  const osRows = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).map(
    ([os, n]) => `<tr><td style="${td}">${os}</td><td style="${td};text-align:center">${n}</td></tr>`).join("");
  const hostRows = Object.entries(hostCounts).sort((a, b) => a[0].localeCompare(b[0])).map(
    ([host, n]) => `<tr><td style="${td}">${host}</td><td style="${td};text-align:center">${n}</td></tr>`).join("");
  const snapRows = withSnaps.sort((a, b) => b.snapshotCount - a.snapshotCount).slice(0, 20).map(
    (vm) => `<tr><td style="${td}">${vm.name}</td><td style="${td}">${vm.host}</td><td style="${td};text-align:center">${vm.snapshotCount}</td></tr>`).join("");
  const offRows = vms.filter((v) => v.powerState === "POWERED_OFF").slice(0, 30).map(
    (vm) => `<tr><td style="${td}">${vm.name}</td><td style="${td}">${vm.host}</td><td style="${td}">${vm.guestOSDisplay}</td></tr>`).join("");

  return `<div style="font-family:sans-serif;max-width:900px;margin:0 auto;color:#111827">
<h2 style="color:#1d4ed8;margin-bottom:4px">🖥️ VMware Inventory Report</h2>
<p style="color:#6b7280;margin-top:0">Generated: <strong>${new Date(fetchedAt).toLocaleString()}</strong></p>
<table style="border-collapse:collapse;margin-bottom:24px">
  <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Total VMs</td><td style="font-weight:700;font-size:1.1rem">${vms.length}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#16a34a">Powered On</td><td style="font-weight:600;color:#16a34a">${on}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#dc2626">Powered Off</td><td style="font-weight:600;color:#dc2626">${off}</td></tr>
  ${suspended ? `<tr><td style="padding:4px 16px 4px 0;color:#d97706">Suspended</td><td style="font-weight:600;color:#d97706">${suspended}</td></tr>` : ""}
  <tr><td style="padding:4px 16px 4px 0;color:#b45309">With Snapshots</td><td style="font-weight:600">${withSnaps.length}</td></tr>
</table>
<h3 style="color:#374151">By Operating System</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <thead><tr style="background:#f3f4f6"><th style="${th}">OS</th><th style="${th};text-align:center">Count</th></tr></thead>
  <tbody>${osRows}</tbody>
</table>
<h3 style="color:#374151">By ESXi Host</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <thead><tr style="background:#f3f4f6"><th style="${th}">Host</th><th style="${th};text-align:center">VMs</th></tr></thead>
  <tbody>${hostRows}</tbody>
</table>
${withSnaps.length ? `<h3 style="color:#b45309">⚠️ VMs with Snapshots</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <thead><tr style="background:#fef9c3"><th style="${th}">VM</th><th style="${th}">Host</th><th style="${th};text-align:center">Snapshots</th></tr></thead>
  <tbody>${snapRows}</tbody>
</table>` : ""}
${off ? `<h3 style="color:#dc2626">⛔ Powered-Off VMs (first 30)</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <thead><tr style="background:#fef2f2"><th style="${th}">VM</th><th style="${th}">Host</th><th style="${th}">OS</th></tr></thead>
  <tbody>${offRows}</tbody>
</table>` : ""}
</div>`;
}

// ── VM Deploy Template tables ──────────────────────────────────────────────────

function initVmwareDeployTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vmware_deploy_templates (
      id                        TEXT PRIMARY KEY,
      name                      TEXT NOT NULL,
      description               TEXT NOT NULL DEFAULT '',
      vcenter_template_id       TEXT NOT NULL,
      vcenter_template_name     TEXT NOT NULL DEFAULT '',
      customization_spec        TEXT NOT NULL DEFAULT '',
      default_datastore_id      TEXT NOT NULL DEFAULT '',
      default_cluster_id        TEXT NOT NULL DEFAULT '',
      default_resource_pool_id  TEXT NOT NULL DEFAULT '',
      default_folder_id         TEXT NOT NULL DEFAULT '',
      default_network_id        TEXT NOT NULL DEFAULT '',
      default_cpu_count         INTEGER,
      default_memory_mib        INTEGER,
      icon                      TEXT NOT NULL DEFAULT '🖥',
      sort_order                INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vmware_deploy_history (
      id            TEXT PRIMARY KEY,
      timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
      user          TEXT NOT NULL,
      vm_name       TEXT NOT NULL,
      template_name TEXT NOT NULL DEFAULT '',
      ip_address    TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending',
      task_id       TEXT NOT NULL DEFAULT '',
      details       TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_vmware_deploy_hist_ts
      ON vmware_deploy_history(timestamp DESC);
  `);
}

// ── VM Deploy Template CRUD ──────────────────────────────────────────────────

function rowToDeployTemplate(row: Record<string, unknown>): VmDeployTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    vcenterTemplateId: String(row.vcenter_template_id),
    vcenterTemplateName: String(row.vcenter_template_name ?? ""),
    customizationSpec: String(row.customization_spec ?? ""),
    defaultDatastoreId: String(row.default_datastore_id ?? ""),
    defaultClusterId: String(row.default_cluster_id ?? ""),
    defaultResourcePoolId: String(row.default_resource_pool_id ?? ""),
    defaultFolderId: String(row.default_folder_id ?? ""),
    defaultNetworkId: String(row.default_network_id ?? ""),
    defaultCpuCount: row.default_cpu_count != null ? Number(row.default_cpu_count) : null,
    defaultMemoryMiB: row.default_memory_mib != null ? Number(row.default_memory_mib) : null,
    icon: String(row.icon ?? "🖥"),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function listVmDeployTemplates(): VmDeployTemplate[] {
  initVmwareDeployTables();
  const rows = getDb().prepare(
    "SELECT * FROM vmware_deploy_templates ORDER BY sort_order ASC, name ASC"
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToDeployTemplate);
}

export function getVmDeployTemplate(id: string): VmDeployTemplate | null {
  initVmwareDeployTables();
  const row = getDb().prepare(
    "SELECT * FROM vmware_deploy_templates WHERE id = ?"
  ).get(id) as Record<string, unknown> | undefined;
  return row ? rowToDeployTemplate(row) : null;
}

export function createVmDeployTemplate(data: Omit<VmDeployTemplate, "id">): VmDeployTemplate {
  initVmwareDeployTables();
  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO vmware_deploy_templates
      (id, name, description, vcenter_template_id, vcenter_template_name,
       customization_spec, default_datastore_id, default_cluster_id,
       default_resource_pool_id, default_folder_id, default_network_id,
       default_cpu_count, default_memory_mib, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.name, data.description ?? "",
    data.vcenterTemplateId, data.vcenterTemplateName ?? "",
    data.customizationSpec ?? "",
    data.defaultDatastoreId ?? "", data.defaultClusterId ?? "",
    data.defaultResourcePoolId ?? "", data.defaultFolderId ?? "",
    data.defaultNetworkId ?? "",
    data.defaultCpuCount ?? null, data.defaultMemoryMiB ?? null,
    data.icon ?? "🖥", data.sortOrder ?? 0,
  );
  return getVmDeployTemplate(id)!;
}

export function updateVmDeployTemplate(id: string, data: Partial<VmDeployTemplate>): VmDeployTemplate | null {
  initVmwareDeployTables();
  const existing = getVmDeployTemplate(id);
  if (!existing) return null;
  getDb().prepare(`
    UPDATE vmware_deploy_templates SET
      name = ?, description = ?, vcenter_template_id = ?, vcenter_template_name = ?,
      customization_spec = ?, default_datastore_id = ?, default_cluster_id = ?,
      default_resource_pool_id = ?, default_folder_id = ?, default_network_id = ?,
      default_cpu_count = ?, default_memory_mib = ?, icon = ?, sort_order = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name, data.description ?? existing.description,
    data.vcenterTemplateId ?? existing.vcenterTemplateId,
    data.vcenterTemplateName ?? existing.vcenterTemplateName,
    data.customizationSpec ?? existing.customizationSpec,
    data.defaultDatastoreId ?? existing.defaultDatastoreId,
    data.defaultClusterId ?? existing.defaultClusterId,
    data.defaultResourcePoolId ?? existing.defaultResourcePoolId,
    data.defaultFolderId ?? existing.defaultFolderId,
    data.defaultNetworkId ?? existing.defaultNetworkId,
    data.defaultCpuCount !== undefined ? data.defaultCpuCount : existing.defaultCpuCount,
    data.defaultMemoryMiB !== undefined ? data.defaultMemoryMiB : existing.defaultMemoryMiB,
    data.icon ?? existing.icon, data.sortOrder ?? existing.sortOrder,
    id,
  );
  return getVmDeployTemplate(id);
}

export function deleteVmDeployTemplate(id: string): boolean {
  initVmwareDeployTables();
  const r = getDb().prepare("DELETE FROM vmware_deploy_templates WHERE id = ?").run(id);
  return r.changes > 0;
}

// ── Deploy history ─────────────────────────────────────────────────────────────

export function logDeployHistory(
  user: string, vmName: string, templateName: string, ip: string,
  status: VmDeployStatus, taskId: string, details: Record<string, unknown>,
): string {
  initVmwareDeployTables();
  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO vmware_deploy_history (id, timestamp, user, vm_name, template_name, ip_address, status, task_id, details)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user, vmName, templateName, ip, status, taskId, JSON.stringify(details));
  return id;
}

export function updateDeployHistoryStatus(id: string, status: VmDeployStatus, details?: Record<string, unknown>): void {
  initVmwareDeployTables();
  if (details) {
    getDb().prepare("UPDATE vmware_deploy_history SET status = ?, details = ? WHERE id = ?").run(status, JSON.stringify(details), id);
  } else {
    getDb().prepare("UPDATE vmware_deploy_history SET status = ? WHERE id = ?").run(status, id);
  }
}

export function getDeployHistory(limit = 100): VmDeployHistoryEntry[] {
  try {
    initVmwareDeployTables();
    const rows = getDb().prepare(
      "SELECT * FROM vmware_deploy_history ORDER BY timestamp DESC LIMIT ?"
    ).all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      user: String(r.user),
      vmName: String(r.vm_name),
      templateName: String(r.template_name),
      ipAddress: String(r.ip_address),
      status: String(r.status) as VmDeployStatus,
      taskId: String(r.task_id),
      details: (() => { try { return JSON.parse(String(r.details)); } catch { return {}; } })(),
    }));
  } catch { return []; }
}

// ── vCenter resource listing (for deploy UI dropdowns) ─────────────────────────

export async function listVmTemplates(config: VmwareConfig): Promise<VcTemplate[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;

  // Use SOAP PropertyCollector to find VMs where config.template=true.
  // The REST filter.is_template param is only available on vSphere 8.0+;
  // SOAP works on all versions.
  const cookie = await soapLogin(base, config.username, password, ignoreSslErrors);
  try {
    const { rootFolder, propCollector } = await soapServiceContent(base, cookie, ignoreSslErrors);
    const xml = await soapPost(`${base}/sdk`, `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
<soapenv:Body>
<RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <_this type="PropertyCollector">${esc(propCollector)}</_this>
  <specSet>
    <propSet><type>VirtualMachine</type><all>false</all>
      <pathSet>name</pathSet>
      <pathSet>config.template</pathSet>
    </propSet>
    <objectSet>
      <obj type="Folder">${esc(rootFolder)}</obj><skip>false</skip>
      <selectSet xsi:type="TraversalSpec"><name>visitFolders</name><type>Folder</type><path>childEntity</path><skip>false</skip>
        <selectSet><name>visitFolders</name></selectSet>
        <selectSet><name>dcToVmFolder</name></selectSet>
      </selectSet>
      <selectSet xsi:type="TraversalSpec"><name>dcToVmFolder</name><type>Datacenter</type><path>vmFolder</path><skip>false</skip>
        <selectSet><name>visitFolders</name></selectSet>
      </selectSet>
    </objectSet>
  </specSet>
  <options/>
</RetrievePropertiesEx>
</soapenv:Body></soapenv:Envelope>`, cookie, ignoreSslErrors);

    const templates: VcTemplate[] = [];
    const objRx = /<objects>([\s\S]*?)<\/objects>/g;
    let m: RegExpExecArray | null;
    while ((m = objRx.exec(xml)) !== null) {
      const b = m[1];
      const isTemplate = /config\.template<\/name>\s*<val[^>]*>true<\/val>/.test(b);
      if (!isTemplate) continue;
      const vmMor = b.match(/<obj[^>]*type="VirtualMachine"[^>]*>([^<]+)<\/obj>/)?.[1];
      const name = b.match(/\bname<\/name>\s*<val[^>]*>([^<]+)<\/val>/)?.[1];
      if (vmMor && name) templates.push({ vm: vmMor, name });
    }
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await soapLogout(base, cookie, ignoreSslErrors);
  }
}

export async function listCustomizationSpecs(config: VmwareConfig): Promise<VcCustomizationSpec[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    const list = await vcGet<VcCustomizationSpec[]>(base, "/api/vcenter/guest/customization-specs", token, config.ignoreSslErrors);
    return (list ?? []).sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

export async function listDatastores(config: VmwareConfig): Promise<VcDatastore[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    return await vcGet<VcDatastore[]>(base, "/api/vcenter/datastore", token, config.ignoreSslErrors) ?? [];
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

export async function listClusters(config: VmwareConfig): Promise<VcCluster[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    return await vcGet<VcCluster[]>(base, "/api/vcenter/cluster", token, config.ignoreSslErrors) ?? [];
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

export async function listResourcePools(config: VmwareConfig): Promise<VcResourcePool[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    return await vcGet<VcResourcePool[]>(base, "/api/vcenter/resource-pool", token, config.ignoreSslErrors) ?? [];
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

export async function listFolders(config: VmwareConfig): Promise<VcFolder[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    return await vcGet<VcFolder[]>(base, "/api/vcenter/folder?type=VIRTUAL_MACHINE", token, config.ignoreSslErrors) ?? [];
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

export async function listNetworks(config: VmwareConfig): Promise<VcNetwork[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const token = await getSessionToken(base, config.username, password, config.ignoreSslErrors);
  try {
    return await vcGet<VcNetwork[]>(base, "/api/vcenter/network", token, config.ignoreSslErrors) ?? [];
  } finally {
    await deleteSession(base, token, config.ignoreSslErrors);
  }
}

// ── VM Clone via SOAP ──────────────────────────────────────────────────────────

export interface VmCloneSpec {
  templateId: string;
  vmName: string;
  customizationSpecName: string;
  ip: string;
  subnetMask: string;
  gateway: string;
  dns: string[];
  datastoreId?: string;
  clusterId?: string;
  resourcePoolId?: string;
  folderId?: string;
  networkId?: string;
  cpuCount?: number | null;
  memoryMiB?: number | null;
}

/**
 * Clone a VM from a template using SOAP CloneVM_Task with customization.
 * Returns the vCenter Task MoRef to poll for completion.
 */
export async function cloneVmFromTemplate(
  config: VmwareConfig,
  spec: VmCloneSpec,
): Promise<{ taskMoRef: string }> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;

  const cookie = await soapLogin(base, config.username, password, ignoreSslErrors);
  try {
    const { rootFolder } = await soapServiceContent(base, cookie, ignoreSslErrors);

    // Resolve resource pool: use specified, or find default from cluster
    let rpMor = spec.resourcePoolId ?? "";
    if (!rpMor && spec.clusterId) {
      // Get cluster's root resource pool
      const rpXml = await soapPost(`${base}/sdk`, `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><_this type="PropertyCollector">propertyCollector</_this><specSet><propSet><type>ClusterComputeResource</type><all>false</all><pathSet>resourcePool</pathSet></propSet><objectSet><obj type="ClusterComputeResource">${esc(spec.clusterId)}</obj><skip>false</skip></objectSet></specSet><options/></RetrievePropertiesEx></soapenv:Body></soapenv:Envelope>`, cookie, ignoreSslErrors);
      rpMor = rpXml.match(/<val[^>]*type="ResourcePool"[^>]*>([^<]+)<\/val>/)?.[1] ?? "";
    }
    if (!rpMor) throw new Error("Resource pool could not be determined. Specify a cluster or resource pool.");

    // Resolve target folder
    let folderMor = spec.folderId ?? "";
    if (!folderMor) folderMor = rootFolder; // default to root

    // Build customization spec XML
    const ipXml = spec.ip ? `
      <ip xsi:type="CustomizationFixedIp" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <ipAddress>${esc(spec.ip)}</ipAddress>
      </ip>
      <subnetMask>${esc(spec.subnetMask)}</subnetMask>
      <gateway>${spec.gateway ? `<gateway>${esc(spec.gateway)}</gateway>` : ""}</gateway>` : `
      <ip xsi:type="CustomizationDhcpIpGenerator" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>`;

    // DNS servers
    const dnsXml = (spec.dns ?? []).filter(Boolean).map(d => `<dnsServerList>${esc(d)}</dnsServerList>`).join("");

    // Build location spec (WSDL order: datastore, pool, host)
    let locationXml = "";
    if (spec.datastoreId) locationXml += `<datastore type="Datastore">${esc(spec.datastoreId)}</datastore>`;
    locationXml += `<pool type="ResourcePool">${esc(rpMor)}</pool>`;

    // Config spec for CPU/memory overrides
    let configSpecXml = "";
    if (spec.cpuCount || spec.memoryMiB) {
      configSpecXml = "<config>";
      if (spec.cpuCount) configSpecXml += `<numCPUs>${spec.cpuCount}</numCPUs>`;
      if (spec.memoryMiB) configSpecXml += `<memoryMB>${spec.memoryMiB}</memoryMB>`;
      configSpecXml += "</config>";
    }

    // Network backing change (if networkId specified)
    let networkXml = "";
    if (spec.networkId) {
      networkXml = `<config><deviceChange><operation>edit</operation><device xsi:type="VirtualVmxnet3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><backing xsi:type="VirtualEthernetCardDistributedVirtualPortBackingInfo"><port><portgroupKey>${esc(spec.networkId)}</portgroupKey></port></backing></device></deviceChange></config>`;
      configSpecXml = ""; // merged into networkXml config
      if (spec.cpuCount || spec.memoryMiB) {
        // Inject CPU/mem into the same config block
        let inject = "";
        if (spec.cpuCount) inject += `<numCPUs>${spec.cpuCount}</numCPUs>`;
        if (spec.memoryMiB) inject += `<memoryMB>${spec.memoryMiB}</memoryMB>`;
        networkXml = networkXml.replace("<deviceChange>", `${inject}<deviceChange>`);
      }
    }

    // Customization: if a named spec is given, reference it; otherwise inline
    let customizationXml = "";
    if (spec.customizationSpecName) {
      // Use named customization spec with IP override
      customizationXml = `
      <customization>
        <globalIPSettings>${dnsXml}</globalIPSettings>
        <nicSettingMap>
          <adapter>
            ${ipXml}
            ${dnsXml}
          </adapter>
        </nicSettingMap>
        <identity xsi:type="CustomizationSysprepText" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <value></value>
        </identity>
      </customization>`;
    }

    const cloneSoap = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<soapenv:Body>
<CloneVM_Task xmlns="urn:vim25">
  <_this type="VirtualMachine">${esc(spec.templateId)}</_this>
  <folder type="Folder">${esc(folderMor)}</folder>
  <name>${esc(spec.vmName)}</name>
  <spec>
    <location>${locationXml}</location>
    <template>false</template>
    ${configSpecXml}
    ${networkXml}
    ${customizationXml}
    <powerOn>true</powerOn>
  </spec>
</CloneVM_Task>
</soapenv:Body></soapenv:Envelope>`;

    const result = await soapPost(`${base}/sdk`, cloneSoap, cookie, ignoreSslErrors);

    // Extract task MoRef
    const taskMoRef = result.match(/<returnval[^>]*type="Task"[^>]*>([^<]+)<\/returnval>/)?.[1];
    if (!taskMoRef) throw new Error("CloneVM_Task did not return a task reference");

    console.log(`[vmware] CloneVM_Task started: ${taskMoRef} for ${spec.vmName}`);
    return { taskMoRef };
  } finally {
    await soapLogout(base, cookie, ignoreSslErrors);
  }
}

// ── Task polling ───────────────────────────────────────────────────────────────

export interface VcTaskStatus {
  state: "queued" | "running" | "success" | "error";
  progress: number; // 0-100
  error?: string;
  result?: string; // MoRef of created VM on success
}

export async function getTaskStatus(config: VmwareConfig, taskMoRef: string): Promise<VcTaskStatus> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const cookie = await soapLogin(base, config.username, password, config.ignoreSslErrors);
  try {
    const xml = await soapPost(`${base}/sdk`,
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><_this type="PropertyCollector">propertyCollector</_this><specSet><propSet><type>Task</type><all>false</all><pathSet>info.state</pathSet><pathSet>info.progress</pathSet><pathSet>info.error</pathSet><pathSet>info.result</pathSet></propSet><objectSet><obj type="Task">${esc(taskMoRef)}</obj><skip>false</skip></objectSet></specSet><options/></RetrievePropertiesEx></soapenv:Body></soapenv:Envelope>`,
      cookie, config.ignoreSslErrors,
    );

    const state = (xml.match(/info\.state<\/name>\s*<val[^>]*>([^<]+)<\/val>/)?.[1] ?? "running") as VcTaskStatus["state"];
    const progress = parseInt(xml.match(/info\.progress<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
    const errorMsg = xml.match(/info\.error<\/name>[\s\S]*?<localizedMessage>([^<]+)<\/localizedMessage>/)?.[1]?.trim();
    const resultMor = xml.match(/info\.result<\/name>\s*<val[^>]*type="VirtualMachine"[^>]*>([^<]+)<\/val>/)?.[1];

    return {
      state,
      progress: state === "success" ? 100 : progress,
      ...(errorMsg ? { error: errorMsg } : {}),
      ...(resultMor ? { result: resultMor } : {}),
    };
  } finally {
    await soapLogout(base, cookie, config.ignoreSslErrors);
  }
}

/** Poll a task until it completes (success/error) or times out. */
export async function pollTaskUntilDone(
  config: VmwareConfig,
  taskMoRef: string,
  timeoutMs = 600_000, // 10 min
  intervalMs = 5_000,
): Promise<VcTaskStatus> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getTaskStatus(config, taskMoRef);
    if (status.state === "success" || status.state === "error") return status;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { state: "error", progress: 0, error: `Task timed out after ${Math.round(timeoutMs / 1000)}s` };
}

/** Delete a VM by MoRef (for rollback on failed deployment). */
export async function deleteVm(config: VmwareConfig, vmMoRef: string): Promise<void> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;

  // Power off first (best-effort)
  const token = await getSessionToken(base, config.username, password, ignoreSslErrors);
  try {
    await vcFetch(`${base}/api/vcenter/vm/${encodeURIComponent(vmMoRef)}/power?action=stop`, {
      method: "POST",
      headers: { "vmware-api-session-id": token, "Content-Type": "application/json" },
    }, ignoreSslErrors).catch(() => {});
    // Delete
    const res = await vcFetch(`${base}/api/vcenter/vm/${encodeURIComponent(vmMoRef)}`, {
      method: "DELETE",
      headers: { "vmware-api-session-id": token },
    }, ignoreSslErrors);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete VM ${vmMoRef}: HTTP ${res.status}`);
    }
  } finally {
    await deleteSession(base, token, ignoreSslErrors);
  }
}
