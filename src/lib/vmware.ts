/**
 * VMware Inventory Module — server-only library.
 *
 * Connects to a vCenter REST API (v7+) and vSphere SOAP API to enumerate
 * VMs and their metrics. Configuration and credentials are stored in SQLite KV.
 * The password is AES-256-GCM encrypted via crypto.ts.
 */

import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";

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
}

export interface VmwareInventoryCache {
  vms: VmRecord[];
  fetchedAt: string;
  hostStats: Record<string, VmHostStats>;
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
    if (!cache?.fetchedAt || !Array.isArray(cache.vms)) return null;
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
    WINDOWS_SERVER_2025_64:"Windows Server 2025",WINDOWS_SERVER_2022_64:"Windows Server 2022",
    WINDOWS_SERVER_2021_64:"Windows Server 2022",
    WINDOWS_SERVER_2019_64:"Windows Server 2019",WINDOWS_SERVER_2016_64:"Windows Server 2016",
    WINDOWS_SERVER_2012_R2_64:"Windows Server 2012 R2",WINDOWS_SERVER_2012_64:"Windows Server 2012",
    WINDOWS_SERVER_2008_R2_64:"Windows Server 2008 R2",WINDOWS_SERVER_2008_64:"Windows Server 2008 (64-bit)",
    WINDOWS_SERVER_2003_64:"Windows Server 2003 (64-bit)",
    WINDOWS_11_64:"Windows 11",WINDOWS_10_64:"Windows 10 (64-bit)",WINDOWS_10:"Windows 10",
    WINDOWS_9_64:"Windows 9 (64-bit)",WINDOWS_9:"Windows 9",
    WINDOWS_8_64:"Windows 8 (64-bit)",WINDOWS_7_64:"Windows 7 (64-bit)",
    RHEL_10_64:"RHEL 10 (64-bit)",RHEL_9_64:"RHEL 9 (64-bit)",RHEL_8_64:"RHEL 8 (64-bit)",
    RHEL7_64:"RHEL 7 (64-bit)",RHEL6_64:"RHEL 6 (64-bit)",
    CENTOS9_64:"CentOS 9 (64-bit)",CENTOS8_64:"CentOS 8 (64-bit)",
    CENTOS7_64:"CentOS 7 (64-bit)",CENTOS_64:"CentOS (64-bit)",
    ROCKYLINUX_64:"Rocky Linux (64-bit)",ALMALINUX_64:"AlmaLinux (64-bit)",
    UBUNTU_64:"Ubuntu (64-bit)",UBUNTU:"Ubuntu",
    DEBIAN_13_64:"Debian 13 (64-bit)",DEBIAN_12_64:"Debian 12 (64-bit)",
    DEBIAN_11_64:"Debian 11 (64-bit)",DEBIAN_10_64:"Debian 10 (64-bit)",
    DEBIAN_9_64:"Debian 9 (64-bit)",DEBIAN_8_64:"Debian 8 (64-bit)",
    SLES15_64:"SUSE Linux 15 (64-bit)",SLES12_64:"SUSE Linux 12 (64-bit)",
    SLES11_64:"SUSE Linux 11 (64-bit)",OPENSUSE_64:"openSUSE (64-bit)",
    FREEBSD13_64:"FreeBSD 13 (64-bit)",FREEBSD12_64:"FreeBSD 12 (64-bit)",
    FREEBSD11_64:"FreeBSD 11 (64-bit)",FREEBSD_64:"FreeBSD (64-bit)",
    ORACLELINUX_64:"Oracle Linux (64-bit)",FEDORA_64:"Fedora (64-bit)",
    OTHER_3X_LINUX_64:"Linux (64-bit)",OTHER_4X_LINUX_64:"Linux (64-bit)",
    OTHER_5X_LINUX_64:"Linux (64-bit)",OTHER_6X_LINUX_64:"Linux (64-bit)",
    OTHER_LINUX:"Linux",OTHER_LINUX_64:"Linux (64-bit)",
    VMKERNEL8:"VMware ESXi 8",VMKERNEL7:"VMware ESXi 7",VMKERNEL6:"VMware ESXi 6",
    OTHER:"Other",OTHER_64:"Other (64-bit)",
  };
  return map[raw] ?? raw.replace(/_64$/, " (64-bit)").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (!res.ok) throw new Error(`SOAP ${res.status}: ${text.slice(0, 600)}`);
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

interface VmSoapData { hostMor: string; annotation: string; hardwareVersion: string; snapshotCount: number; }
interface HostSoapData { physicalCpuCores: number; }

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
      vmData[vmMor] = { hostMor, annotation, hardwareVersion, snapshotCount };
    }
    if (hostMorObj) {
      const cores = parseInt(b.match(/numCpuCores<\/name>\s*<val[^>]*>(\d+)<\/val>/)?.[1] ?? "0", 10);
      hostData[hostMorObj] = { physicalCpuCores: cores };
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

    const rpeXml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
<soapenv:Body>
<RetrievePropertiesEx xmlns="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <_this type="PropertyCollector">${esc(propCollector)}</_this>
  <specSet>
    <propSet><type>VirtualMachine</type><all>false</all>
      <pathSet>runtime.host</pathSet>
      <pathSet>summary.config.annotation</pathSet>
      <pathSet>config.version</pathSet>
      <pathSet>snapshot</pathSet>
    </propSet>
    <propSet><type>HostSystem</type><all>false</all>
      <pathSet>hardware.cpuInfo.numCpuCores</pathSet>
    </propSet>
    <objectSet>
      <obj type="Folder">${esc(rootFolder)}</obj>
      <skip>false</skip>
      <selectSet xsi:type="TraversalSpec">
        <name>folderChildren</name><type>Folder</type><path>childEntity</path><skip>false</skip>
        <selectSet xsi:type="SelectionSpec"><name>folderChildren</name></selectSet>
        <selectSet xsi:type="TraversalSpec">
          <type>Datacenter</type><path>vmFolder</path><skip>false</skip>
          <selectSet xsi:type="SelectionSpec"><name>folderChildren</name></selectSet>
        </selectSet>
        <selectSet xsi:type="TraversalSpec">
          <type>Datacenter</type><path>hostFolder</path><skip>false</skip>
          <selectSet xsi:type="SelectionSpec"><name>folderChildren</name></selectSet>
          <selectSet xsi:type="TraversalSpec">
            <type>ComputeResource</type><path>host</path><skip>false</skip>
          </selectSet>
        </selectSet>
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

        // Memory in use
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

        // IP address
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

        return {
          vmId: vm.vm,
          name: vm.name,
          powerState: vm.power_state,
          host: hostName,
          guestOS: detail.guest_OS ?? "",
          guestOSDisplay: guestOsDisplay(detail.guest_OS ?? ""),
          guestOSFullName: guestId.full_name?.default_message || "",
          toolsVersion: tools.version ?? "",
          toolsStatus: tools.run_state ?? "",
          memoryMiB: vm.memory_size_MiB ?? detail.memory?.size_MiB ?? 0,
          memoryUsedMiB,
          cpuCount: vm.cpu_count ?? detail.cpu?.count ?? 0,
          cpuUsageMhz: null,
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
      const cores = hostData[h.host]?.physicalCpuCores ?? 0;
      const allocated = vcpuPerHost[name] ?? 0;
      hostStats[name] = { physicalCpuCores: cores, allocatedVcpus: allocated, ratio: cores > 0 ? allocated / cores : 0 };
    }

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
