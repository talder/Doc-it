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
  placement?: { host?: string; cluster?: string };
  /** Some vCenter versions expose runtime host here */
  runtime?: { host?: string; power_state?: string; connection_state?: string };
  /** Some vCenter versions use a direct host field */
  host?: string;
  [key: string]: unknown; // allow unknown fields for diagnostics
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

// ── SOAP property collector (fallback when REST filter.hosts is unsupported) ──

/**
 * Use the vSphere SOAP API property collector to retrieve runtime.host for all VMs.
 * This works on every vCenter version and configuration, unlike the REST API filters.
 * Returns a map of vmMOR → hostMOR (e.g. "vm-104465" → "host-252509").
 */
async function fetchVMHostsViaSoap(
  base: string,
  username: string,
  password: string,
  ignoreSsl: boolean,
): Promise<Record<string, string>> {
  const soapUrl = `${base}/sdk`;

  const esc = (s: string) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const post = (body: string, cookie?: string): Promise<Response> =>
    vcFetch(soapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "urn:vim25/7.0",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    }, ignoreSsl);

  // Step 1: Login
  const loginRes = await post(
    `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
<soapenv:Body><vim25:Login>
<_this type="SessionManager">SessionManager</_this>
<userName>${esc(username)}</userName>
<password>${esc(password)}</password>
</vim25:Login></soapenv:Body></soapenv:Envelope>`,
  );
  if (!loginRes.ok) {
    const errText = await loginRes.text().catch(() => "");
    throw new Error(`SOAP login failed (${loginRes.status}): ${errText.slice(0, 300)}`);
  }
  const rawCookie = loginRes.headers.get("set-cookie") ?? "";
  const sessionCookie = rawCookie.match(/vmware_soap_session=[^;,]+/)?.[0] ?? "";

  try {
    // Step 2: RetrieveServiceContent — get rootFolder and propertyCollector MORs
    const scRes = await post(
      `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
<soapenv:Body><vim25:RetrieveServiceContent>
<_this type="ServiceInstance">ServiceInstance</_this>
</vim25:RetrieveServiceContent></soapenv:Body></soapenv:Envelope>`,
      sessionCookie,
    );
    const scText = await scRes.text();

    const rootFolder = scText.match(/<rootFolder[^>]*>([^<]+)<\/rootFolder>/)?.[1];
    const propCollector = scText.match(/<propertyCollector[^>]*>([^<]+)<\/propertyCollector>/)?.[1];
    if (!rootFolder || !propCollector) throw new Error("Could not parse ServiceContent");

    // Step 3: RetrievePropertiesEx — get runtime.host for every VirtualMachine.
    // Traversal (inline, no cross-references): rootFolder → Folder.childEntity →
    //   Datacenter.vmFolder → Folder.childEntity → VirtualMachine
    // Using urn:vim25 as default namespace with plain type names (no vim25: prefix).
    const rpeRes = await post(
      `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
<soapenv:Body>
<RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <_this type="PropertyCollector">${esc(propCollector)}</_this>
  <specSet>
    <propSet>
      <type>VirtualMachine</type>
      <all>false</all>
      <pathSet>runtime.host</pathSet>
    </propSet>
    <objectSet>
      <obj type="Folder">${esc(rootFolder)}</obj>
      <skip>false</skip>
      <selectSet xsi:type="TraversalSpec">
        <name>folderChildren</name>
        <type>Folder</type>
        <path>childEntity</path>
        <skip>false</skip>
        <selectSet xsi:type="SelectionSpec"><name>folderChildren</name></selectSet>
        <selectSet xsi:type="TraversalSpec">
          <type>Datacenter</type>
          <path>vmFolder</path>
          <skip>false</skip>
          <selectSet xsi:type="SelectionSpec"><name>folderChildren</name></selectSet>
        </selectSet>
      </selectSet>
    </objectSet>
  </specSet>
  <options/>
</RetrievePropertiesEx>
</soapenv:Body></soapenv:Envelope>`,
      sessionCookie,
    );
    const rpeText = await rpeRes.text();
    if (!rpeRes.ok) {
      // Log full SOAP fault so we can see the actual error message
      console.warn("[vmware] SOAP RetrievePropertiesEx full response:", rpeText);
      throw new Error(`SOAP RetrievePropertiesEx failed (${rpeRes.status})`);
    }

    // Parse a SOAP page and accumulate vmMOR → hostMOR pairs
    const result: Record<string, string> = {};

    const parsePage = (xml: string) => {
      const objRx = /<objects>([ \t\r\n\S]*?)<\/objects>/gs;
      let m: RegExpExecArray | null;
      while ((m = objRx.exec(xml)) !== null) {
        const block = m[1];
        const vmMor = block.match(/<obj[^>]*type="VirtualMachine"[^>]*>([^<]+)<\/obj>/)?.[1];
        const hostMor = block.match(/<val[^>]*type="HostSystem"[^>]*>([^<]+)<\/val>/)?.[1];
        if (vmMor && hostMor) result[vmMor] = hostMor;
      }
      // Return the continuation token if present (means more pages follow)
      return xml.match(/<token>([^<]+)<\/token>/)?.[1] ?? null;
    };

    // First page
    let continuationToken = parsePage(rpeText);
    console.log(`[vmware] SOAP page 1: ${Object.keys(result).length} VMs, token=${continuationToken ?? "none"}`);

    // Subsequent pages (ContinueRetrievePropertiesEx)
    while (continuationToken) {
      const contRes = await post(
        `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
<soapenv:Body>
<ContinueRetrievePropertiesEx xmlns="urn:vim25">
  <_this type="PropertyCollector">${esc(propCollector)}</_this>
  <token>${esc(continuationToken)}</token>
</ContinueRetrievePropertiesEx>
</soapenv:Body></soapenv:Envelope>`,
        sessionCookie,
      );
      const contText = await contRes.text();
      if (!contRes.ok) {
        console.warn("[vmware] SOAP continuation failed:", contText);
        break;
      }
      continuationToken = parsePage(contText);
      console.log(`[vmware] SOAP continuation: ${Object.keys(result).length} VMs total, token=${continuationToken ?? "none"}`);
    }

    return result;
  } finally {
    // Logout best-effort
    await post(
      `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
<soapenv:Body><vim25:Logout>
<_this type="SessionManager">SessionManager</_this>
</vim25:Logout></soapenv:Body></soapenv:Envelope>`,
      sessionCookie,
    ).catch(() => {});
  }
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

    // 2. Build hostId → hostName map (needed for MOR lookups in fallback paths)
    const hostMap: Record<string, string> = {};
    for (const h of hosts) hostMap[h.host] = h.name;

    console.log(`[vmware] Found ${hosts.length} hosts: ${hosts.map((h) => `${h.name}(${h.host})`).join(", ")}`);

    // 3. Build vmId → hostName map.
    //    Strategy A: query each host's VM list via the new REST API filter.
    //    Strategy B: same query but on the old /vcenter/ path (if A returns nothing).
    //    Both approaches are tried; strategies C/D are per-VM fallbacks in the loop.
    const vmHostMap: Record<string, string> = {};

    // Some vCenter versions require the full MOR type prefix in the filter value:
    //   plain:  host-252509
    //   full:   HostSystem:host-252509
    // We try both; the one that doesn't return 400 is the right format.
    const tryFilterFormats = ["plain", "full"] as const;

    const queryHostVMs = async (
      apiPath: string,
      hostName: string,
      hostId: string,
      format: "plain" | "full",
    ) => {
      const filterVal = format === "full" ? `HostSystem:${hostId}` : hostId;
      const vmsOnHost = await vcGet<VcVmSummary[]>(
        base, `${apiPath}?filter.hosts=${encodeURIComponent(filterVal)}`, token, ignoreSslErrors,
      );
      for (const vm of vmsOnHost) vmHostMap[vm.vm] = hostName;
      return vmsOnHost.length;
    };

    // Strategy A — new REST API (/api/vcenter/vm), try plain then full MOR format
    let totalMapped = 0;
    let workingFormat: "plain" | "full" | null = null;

    for (const fmt of tryFilterFormats) {
      if (totalMapped > 0) break;
      await Promise.all(
        hosts.map(async (host) => {
          try {
            const n = await queryHostVMs("/api/vcenter/vm", host.name, host.host, fmt);
            if (n > 0) workingFormat = fmt;
            totalMapped += n;
          } catch (err) {
            if (fmt === "full") { // only log on the last attempt
              console.warn(`[vmware] Strategy A failed for ${host.name} (both formats):`, err instanceof Error ? err.message : String(err));
            }
          }
        }),
      );
    }

    if (totalMapped > 0) {
      console.log(`[vmware] Strategy A succeeded with format="${workingFormat}": ${totalMapped} VMs mapped`);
    }

    // Strategy B — old REST API (/vcenter/vm, vCenter 6.5–8.0), same format probing
    if (totalMapped === 0) {
      console.warn("[vmware] Strategy A returned 0 — trying old /vcenter/vm path");
      for (const fmt of tryFilterFormats) {
        if (totalMapped > 0) break;
        await Promise.all(
          hosts.map(async (host) => {
            try {
              const n = await queryHostVMs("/vcenter/vm", host.name, host.host, fmt);
              if (n > 0) workingFormat = fmt;
              totalMapped += n;
            } catch (err) {
              if (fmt === "full") {
                console.warn(`[vmware] Strategy B failed for ${host.name} (both formats):`, err instanceof Error ? err.message : String(err));
              }
            }
          }),
        );
      }
      if (totalMapped > 0) {
        console.log(`[vmware] Strategy B succeeded with format="${workingFormat}": ${totalMapped} VMs mapped`);
      }
    }

    const usePlacementFallback = totalMapped === 0;
    if (usePlacementFallback) {
      console.warn("[vmware] Both filter strategies returned 0 — will try per-VM placement/detail fallbacks");
    } else {
      console.log(`[vmware] Host map built: ${totalMapped} VMs mapped to hosts`);
    }

    // 4. List all VMs (summary)
    const vmList = await vcGet<VcVmSummary[]>(base, "/api/vcenter/vm", token, ignoreSslErrors);

    // Strategy E — reverse lookup (GET /api/vcenter/host?filter.vms=)
    if (usePlacementFallback && vmList.length > 0) {
      console.log("[vmware] Trying Strategy E: reverse host lookup (GET /api/vcenter/host?filter.vms=...)");
      let eSucceeded = 0;
      // Test with first VM to see if the endpoint is supported before doing all 310
      let eSupported = false;
      try {
        const testHosts = await vcGet<VcHostSummary[]>(
          base, `/api/vcenter/host?filter.vms=${encodeURIComponent(vmList[0].vm)}`, token, ignoreSslErrors,
        );
        eSupported = true;
        if (testHosts.length > 0) {
          vmHostMap[vmList[0].vm] = testHosts[0].name;
          eSucceeded++;
        }
        console.log("[vmware] Strategy E is supported — running for all VMs");
      } catch (err) {
        console.warn("[vmware] Strategy E also not supported:", err instanceof Error ? err.message : String(err));
      }

      if (eSupported) {
        const ECONCURRENCY = 20;
        for (let i = 1; i < vmList.length; i += ECONCURRENCY) {
          const batch = vmList.slice(i, i + ECONCURRENCY);
          await Promise.all(
            batch.map(async (vm) => {
              try {
                const hostsForVm = await vcGet<VcHostSummary[]>(
                  base, `/api/vcenter/host?filter.vms=${encodeURIComponent(vm.vm)}`, token, ignoreSslErrors,
                );
                if (hostsForVm.length > 0) {
                  vmHostMap[vm.vm] = hostsForVm[0].name;
                  eSucceeded++;
                }
              } catch { /* skip this VM */ }
            }),
          );
        }
        console.log(`[vmware] Strategy E mapped ${eSucceeded}/${vmList.length} VMs to hosts`);
      }
    }

    // Strategy F — SOAP property collector (universal fallback).
    // Works on every vCenter version regardless of REST API filter support.
    // Retrieves runtime.host for all VMs in one SOAP call via the property collector.
    if (Object.keys(vmHostMap).length === 0) {
      console.log("[vmware] Trying SOAP property collector (Strategy F) for VM-to-host mapping");
      try {
        const soapMap = await fetchVMHostsViaSoap(base, config.username, password, ignoreSslErrors);
        let soapMapped = 0;
        for (const [vmMor, hostMor] of Object.entries(soapMap)) {
          // hostMor is like "host-252509"; look up the display name in hostMap
          const norm = hostMor.includes(":") ? hostMor.split(":").pop()! : hostMor;
          const hostName = hostMap[hostMor] || hostMap[norm] || norm;
          vmHostMap[vmMor] = hostName;
          soapMapped++;
        }
        console.log(`[vmware] SOAP strategy mapped ${soapMapped} VMs to hosts`);
      } catch (err) {
        console.warn("[vmware] SOAP strategy failed:", err instanceof Error ? err.message : String(err));
      }
    }

    // Diagnostics: log top-level fields from the first VM detail so we can
    // see exactly which fields vCenter returns (helps identify host field name)
    if (vmList.length > 0) {
      try {
        const sampleDetail = await vcGet<VcVmDetail>(
          base, `/api/vcenter/vm/${vmList[0].vm}`, token, ignoreSslErrors,
        );
        const keys = Object.keys(sampleDetail);
        console.log(`[vmware] VM detail keys for ${vmList[0].name}:`, keys.join(", "));
        if (sampleDetail.placement) console.log("[vmware] placement:", JSON.stringify(sampleDetail.placement));
        if (sampleDetail.runtime) console.log("[vmware] runtime:", JSON.stringify(sampleDetail.runtime));
        if (sampleDetail.host) console.log("[vmware] host field:", sampleDetail.host);
      } catch { /* diagnostic only */ }
    }

    // 5. Fetch details + tools info in parallel (batch concurrency to avoid overloading)
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

          // ── Host resolution (strategies C & D) ───────────────────────────
          // Strategy A/B filled vmHostMap above. If still empty for this VM,
          // try C: read placement.host from the VM detail response (some
          // vCenter versions include it). Then D: GET /api/vcenter/vm/{vm}/placement.
          let hostName = vmHostMap[vm.vm] || "";

          if (!hostName) {
            // Strategy C — various host fields from VM detail response
            // Try placement.host, runtime.host, and detail.host (field name varies by vCenter version)
            const rawHostRef =
              detail.placement?.host ||
              detail.runtime?.host ||
              (typeof detail.host === "string" ? detail.host : undefined);
            if (rawHostRef) {
              const norm = rawHostRef.includes(":") ? rawHostRef.split(":").pop()! : rawHostRef;
              hostName = hostMap[rawHostRef] || hostMap[norm] || norm;
            }
          }

          if (!hostName && usePlacementFallback) {
            // Strategy D — dedicated placement endpoint (vCenter 7.0 U2+)
            try {
              const placement = await vcGet<VcVmPlacement>(
                base, `/api/vcenter/vm/${vm.vm}/placement`, token, ignoreSslErrors,
              );
              if (placement.host) {
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
