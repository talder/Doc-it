/**
 * VMware Inventory Module — server-only library.
 *
 * Connects to a vCenter REST API (v7+) to enumerate VMs and their metrics.
 * Configuration and credentials are stored in SQLite KV.
 * The password is AES-256-GCM encrypted via crypto.ts.
 */

import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VmwareConfig {
  enabled: boolean;
  vcenterUrl: string;          // e.g. "https://vcenter.example.com"
  username: string;            // e.g. "administrator@vsphere.local"
  passwordEncrypted: string;   // AES-256-GCM encrypted password
  ignoreSslErrors: boolean;    // accept self-signed TLS certs
  allowedUsers: string[];      // empty = no non-admin access
}

export type VmPowerState = "POWERED_ON" | "POWERED_OFF" | "SUSPENDED";

export interface VmRecord {
  vmId: string;
  name: string;
  powerState: VmPowerState;
  host: string;                      // display name of the ESXi host
  guestOS: string;                   // e.g. "WINDOWS_SERVER_2019_64"
  guestOSDisplay: string;            // stable enum-based human-readable OS name (used for grouping)
  guestOSFullName: string;           // VMware Tools full_name (more specific, e.g. "CentOS Linux 7 (Core)")
  toolsVersion: string;              // VMware Tools version string, or "" if unknown
  toolsStatus: string;               // GUEST_TOOLS_RUNNING | GUEST_TOOLS_NOT_INSTALLED | etc.
  memoryMiB: number;                 // configured RAM in MiB
  memoryUsedMiB: number | null;      // in-use RAM (requires Tools), null = unavailable
  cpuCount: number;                  // number of vCPUs
  cpuUsageMhz: number | null;        // in-use CPU MHz (requires Tools), null = unavailable
  storageBytesProvisioned: number;   // sum of disk capacity bytes
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONFIG_FILE = "vmware-config.json";

const DEFAULT_CONFIG: VmwareConfig = {
  enabled: false,
  vcenterUrl: "",
  username: "",
  passwordEncrypted: "",
  ignoreSslErrors: false,
  allowedUsers: [],
};

// ── Config CRUD ────────────────────────────────────────────────────────────────

export async function readVmwareConfig(): Promise<VmwareConfig> {
  return readJsonConfig<VmwareConfig>(CONFIG_FILE, { ...DEFAULT_CONFIG });
}

export async function saveVmwareConfig(
  update: Partial<Omit<VmwareConfig, "passwordEncrypted">> & { password?: string },
): Promise<void> {
  const current = await readVmwareConfig();
  const next: VmwareConfig = {
    ...current,
    ...Object.fromEntries(
      Object.entries(update).filter(([k]) => k !== "password"),
    ),
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

// ── vCenter REST API helpers ──────────────────────────────────────────────────

/** Make a fetch call, optionally disabling TLS verification. */
async function vcFetch(
  url: string,
  options: RequestInit,
  ignoreSsl: boolean,
): Promise<Response> {
  if (ignoreSsl && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
    // Temporarily override for this request context (Node.js global)
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      return await fetch(url, options);
    } finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
  return fetch(url, options);
}

/** Authenticate with vCenter and return a session token. */
async function getSessionToken(
  base: string,
  username: string,
  password: string,
  ignoreSsl: boolean,
): Promise<string> {
  const creds = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await vcFetch(
    `${base}/api/session`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/json",
      },
    },
    ignoreSsl,
  );
  if (!res.ok) {
    throw new Error(`vCenter authentication failed: ${res.status} ${res.statusText}`);
  }
  const token = await res.json();
  if (typeof token !== "string") {
    throw new Error("vCenter returned unexpected session token format");
  }
  return token;
}

/** Fetch JSON from vCenter REST API. */
async function vcGet<T>(
  base: string,
  path: string,
  token: string,
  ignoreSsl: boolean,
): Promise<T> {
  const res = await vcFetch(
    `${base}${path}`,
    {
      headers: {
        "vmware-api-session-id": token,
        Accept: "application/json",
      },
    },
    ignoreSsl,
  );
  if (!res.ok) {
    throw new Error(`vCenter API error ${res.status} for ${path}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Delete the vCenter REST session (logout). */
async function deleteSession(
  base: string,
  token: string,
  ignoreSsl: boolean,
): Promise<void> {
  try {
    await vcFetch(
      `${base}/api/session`,
      {
        method: "DELETE",
        headers: { "vmware-api-session-id": token },
      },
      ignoreSsl,
    );
  } catch {
    // best-effort
  }
}

// vCenter API response shapes (partial)
interface VcHostSummary {
  host: string;
  name: string;
}

interface VcVmSummary {
  vm: string;
  name: string;
  power_state: VmPowerState;
  cpu_count: number;
  memory_size_MiB: number;
}

interface VcVmDetail {
  guest_OS?: string;
  cpu?: { count?: number };
  memory?: { size_MiB?: number };
  disks?: Record<string, { capacity?: number }>;
  placement?: { host?: string };
}

interface VcVmToolsInfo {
  version?: string;
  version_status?: string;
  run_state?: string;
  install_type?: string;
}

interface VcGuestIdentity {
  name?: string;
  full_name?: {
    default_message?: string;
  };
}

/** Placement result for GET /api/vcenter/vm/{vm}/placement */
interface VcVmPlacement {
  host?: string;
  cluster?: string;
  datastore?: string;
  folder?: string;
  resource_pool?: string;
}

/** Guest memory info for GET /api/vcenter/vm/{vm}/guest/memory */
interface VcGuestMemoryInfo {
  /** Total physical memory in the guest (bytes or MiB depending on vCenter version) */
  physical_memory?: number;
  /** Memory actively used by guest (bytes) */
  guest_memory_used?: number;
  /** Balloon driver size in MiB */
  balloon_size_MiB?: number;
  /** Swapped memory in MiB */
  swap_size_MiB?: number;
}

// Human-readable OS name mapping (VMware GuestOS enum → display string).
// These are used as the stable grouping key — never mix with Tools full_name strings.
function guestOsDisplay(raw?: string): string {
  if (!raw) return "Unknown";
  const map: Record<string, string> = {
    // Windows
    WINDOWS_SERVER_2025_64: "Windows Server 2025",
    WINDOWS_SERVER_2022_64: "Windows Server 2022",
    WINDOWS_SERVER_2019_64: "Windows Server 2019",
    WINDOWS_SERVER_2016_64: "Windows Server 2016",
    WINDOWS_SERVER_2012_64: "Windows Server 2012",
    WINDOWS_SERVER_2012_R2_64: "Windows Server 2012 R2",
    WINDOWS_SERVER_2008_64: "Windows Server 2008 (64-bit)",
    WINDOWS_SERVER_2008_R2_64: "Windows Server 2008 R2",
    WINDOWS_SERVER_2003_64: "Windows Server 2003 (64-bit)",
    WINDOWS_11_64: "Windows 11",
    WINDOWS_10_64: "Windows 10 (64-bit)",
    WINDOWS_10: "Windows 10",
    WINDOWS_9: "Windows 9",
    WINDOWS_8_64: "Windows 8 (64-bit)",
    WINDOWS_7_64: "Windows 7 (64-bit)",
    WINDOWS_VISTA_64: "Windows Vista (64-bit)",
    // RHEL / CentOS / Rocky / AlmaLinux
    RHEL_10_64: "RHEL 10 (64-bit)",
    RHEL_9_64: "RHEL 9 (64-bit)",
    RHEL_8_64: "RHEL 8 (64-bit)",
    RHEL7_64: "RHEL 7 (64-bit)",
    RHEL6_64: "RHEL 6 (64-bit)",
    CENTOS9_64: "CentOS 9 (64-bit)",
    CENTOS8_64: "CentOS 8 (64-bit)",
    CENTOS7_64: "CentOS 7 (64-bit)",
    CENTOS_64: "CentOS (64-bit)",
    ROCKYLINUX_64: "Rocky Linux (64-bit)",
    ALMALINUX_64: "AlmaLinux (64-bit)",
    // Ubuntu / Debian
    UBUNTU_64: "Ubuntu (64-bit)",
    UBUNTU: "Ubuntu",
    DEBIAN_13_64: "Debian 13 (64-bit)",
    DEBIAN_12_64: "Debian 12 (64-bit)",
    DEBIAN_11_64: "Debian 11 (64-bit)",
    DEBIAN_10_64: "Debian 10 (64-bit)",
    DEBIAN_9_64: "Debian 9 (64-bit)",
    DEBIAN_8_64: "Debian 8 (64-bit)",
    // SUSE
    SLES15_64: "SUSE Linux 15 (64-bit)",
    SLES12_64: "SUSE Linux 12 (64-bit)",
    SLES11_64: "SUSE Linux 11 (64-bit)",
    OPENSUSE_64: "openSUSE (64-bit)",
    // FreeBSD
    FREEBSD13_64: "FreeBSD 13 (64-bit)",
    FREEBSD12_64: "FreeBSD 12 (64-bit)",
    FREEBSD11_64: "FreeBSD 11 (64-bit)",
    FREEBSD_64: "FreeBSD (64-bit)",
    // Oracle / Fedora / Other Linux
    ORACLELINUX_64: "Oracle Linux (64-bit)",
    FEDORA_64: "Fedora (64-bit)",
    OTHER_3X_LINUX_64: "Linux (64-bit)",
    OTHER_4X_LINUX_64: "Linux (64-bit)",
    OTHER_5X_LINUX_64: "Linux (64-bit)",
    OTHER_6X_LINUX_64: "Linux (64-bit)",
    OTHER_LINUX: "Linux",
    OTHER_LINUX_64: "Linux (64-bit)",
    // VMware ESXi
    VMKERNEL8: "VMware ESXi 8",
    VMKERNEL7: "VMware ESXi 7",
    VMKERNEL6: "VMware ESXi 6",
    // Other
    OTHER: "Other",
    OTHER_64: "Other (64-bit)",
  };
  // Return from map, or prettify the enum string as a fallback
  return map[raw] ?? raw.replace(/_64$/, " (64-bit)").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main Fetch ─────────────────────────────────────────────────────────────────

/**
 * Connect to vCenter and return all VM records.
 * Throws if the connection or authentication fails.
 */
export async function fetchVMs(config: VmwareConfig): Promise<VmRecord[]> {
  const base = config.vcenterUrl.replace(/\/$/, "");
  const password = await decryptField(config.passwordEncrypted);
  const { ignoreSslErrors } = config;

  const token = await getSessionToken(base, config.username, password, ignoreSslErrors);

  try {
    // 1. Get all ESXi hosts
    const hosts = await vcGet<VcHostSummary[]>(base, "/api/vcenter/host", token, ignoreSslErrors);

    // 2. Build hostId → hostName map (used by the placement fallback)
    const hostMap: Record<string, string> = {};
    for (const h of hosts) hostMap[h.host] = h.name;

    // 3. Build vmId → hostName map: query each host's VM list.
    //    URL-encode the host ID (some vCenter versions require this).
    const vmHostMap: Record<string, string> = {};
    await Promise.all(
      hosts.map(async (host) => {
        try {
          const vmsOnHost = await vcGet<VcVmSummary[]>(
            base, `/api/vcenter/vm?filter.hosts=${encodeURIComponent(host.host)}`, token, ignoreSslErrors,
          );
          for (const vm of vmsOnHost) {
            vmHostMap[vm.vm] = host.name;
          }
        } catch (err) {
          // Log to server console to help diagnose host mapping failures
          console.warn(`[vmware] filter.hosts failed for ${host.name} (${host.host}):`, err instanceof Error ? err.message : String(err));
        }
      }),
    );

    // If filter.hosts mapped no VMs (likely unsupported or permissions issue),
    // flag that we should try the per-VM placement endpoint as a fallback.
    const usePlacementFallback = Object.keys(vmHostMap).length === 0;
    if (usePlacementFallback) {
      console.warn("[vmware] filter.hosts returned no results — will try GET /api/vcenter/vm/{vm}/placement per VM");
    }

    // 3. List all VMs (summary)
    const vmList = await vcGet<VcVmSummary[]>(base, "/api/vcenter/vm", token, ignoreSslErrors);

    // 4. Fetch details + tools info in parallel (batch concurrency to avoid overloading)
    const CONCURRENCY = 10;
    const results: VmRecord[] = [];

    for (let i = 0; i < vmList.length; i += CONCURRENCY) {
      const batch = vmList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (vm) => {
          let detail: VcVmDetail = {};
          let tools: VcVmToolsInfo = {};
          let guestId: VcGuestIdentity = {};

          try {
            detail = await vcGet<VcVmDetail>(
              base, `/api/vcenter/vm/${vm.vm}`, token, ignoreSslErrors,
            );
          } catch { /* non-fatal */ }

          try {
            tools = await vcGet<VcVmToolsInfo>(
              base, `/api/vcenter/vm/${vm.vm}/tools`, token, ignoreSslErrors,
            );
          } catch { /* non-fatal */ }

          // Guest identity — only used for the full_name display string (not for grouping)
          if (tools.run_state === "RUNNING") {
            try {
              guestId = await vcGet<VcGuestIdentity>(
                base, `/api/vcenter/vm/${vm.vm}/guest/identity`, token, ignoreSslErrors,
              );
            } catch { /* non-fatal */ }
          }

          // Storage: sum all disk capacities
          let storageBytesProvisioned = 0;
          if (detail.disks) {
            for (const disk of Object.values(detail.disks)) {
              storageBytesProvisioned += disk.capacity ?? 0;
            }
          }

          // ── Host resolution ───────────────────────────────────────────────
          // Primary: use the filter.hosts map built above.
          // Fallback: GET /api/vcenter/vm/{vm}/placement (vCenter 7.0 U2+).
          let hostName = vmHostMap[vm.vm] || "";

          if (!hostName && usePlacementFallback) {
            try {
              const placement = await vcGet<VcVmPlacement>(
                base, `/api/vcenter/vm/${vm.vm}/placement`, token, ignoreSslErrors,
              );
              if (placement.host) {
                // MOR may be prefixed: "HostSystem:host-10" → "host-10"
                const normalizedId = placement.host.includes(":")
                  ? placement.host.split(":").pop()!
                  : placement.host;
                hostName = hostMap[placement.host] || hostMap[normalizedId] || normalizedId;
              }
            } catch { /* not available in this vCenter version */ }
          }

          if (!hostName) hostName = "Unknown";

          // ── OS info ───────────────────────────────────────────────────────
          const rawGuestOS = detail.guest_OS ?? "";
          const guestOSDisplay = guestOsDisplay(rawGuestOS);
          const guestOSFullName = guestId.full_name?.default_message || "";

          // ── Memory in use ─────────────────────────────────────────────────
          // Try GET /api/vcenter/vm/{vm}/guest/memory when Tools is running.
          // The field guest_memory_used may be in bytes (divide by 1024²→MiB).
          let memoryUsedMiB: number | null = null;
          if (tools.run_state === "RUNNING") {
            try {
              const guestMem = await vcGet<VcGuestMemoryInfo>(
                base, `/api/vcenter/vm/${vm.vm}/guest/memory`, token, ignoreSslErrors,
              );
              if (typeof guestMem.guest_memory_used === "number" && guestMem.guest_memory_used > 0) {
                const raw = guestMem.guest_memory_used;
                // Heuristic: if value is > 1 GiB it's in bytes; otherwise MiB
                memoryUsedMiB = raw > 1_073_741_824
                  ? Math.round(raw / (1024 * 1024))
                  : raw;
              }
            } catch { /* endpoint not available in this vCenter version */ }
          }

          const record: VmRecord = {
            vmId: vm.vm,
            name: vm.name,
            powerState: vm.power_state,
            host: hostName,
            guestOS: rawGuestOS,
            guestOSDisplay,
            guestOSFullName,
            toolsVersion: tools.version ?? "",
            toolsStatus: tools.run_state ?? "",
            memoryMiB: vm.memory_size_MiB ?? detail.memory?.size_MiB ?? 0,
            memoryUsedMiB,
            cpuCount: vm.cpu_count ?? detail.cpu?.count ?? 0,
            cpuUsageMhz: null, // requires vCenter performance counters API
            storageBytesProvisioned,
          };

          return record;
        }),
      );
      results.push(...batchResults);
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  } finally {
    await deleteSession(base, token, ignoreSslErrors);
  }
}
