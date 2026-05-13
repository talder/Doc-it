/**
 * Provisioning module — server-only library.
 *
 * Orchestrates device registration across Netbox, DNS and DHCP.
 * Config stored in SQLite KV. Device profiles in a dedicated table.
 * Credentials AES-256-GCM encrypted via crypto.ts.
 */

import { randomUUID } from "crypto";
import dns from "dns/promises";
import net from "net";
import { getDb } from "./config";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";
import { _writeAuditLogDirect, sendRawSyslog } from "./audit";
import {
  readVmwareConfig, getVmDeployTemplate, deployVmViaPowerCLI,
} from "./vmware";
import type {
  ProvisioningConfig, DeviceProfile, ProvisioningRequest,
  PreflightResult, PreflightCheckId,
  PipelineStep, PipelineStepId, ProvisioningResult,
  ProvisioningHistoryEntry, InfraAuditTab, InfraAuditEntry,
  DecommissionStep, DecommissionStepId, DecommissionResult,
} from "./provisioning-shared";

// ── Default config ───────────────────────────────────────────────────────────

const CONFIG_KEY = "provisioning-config.json";

const DEFAULT_CONFIG: ProvisioningConfig = {
  netbox: { url: "", siteId: null, defaultRoleId: null, ignoreSslErrors: false },
  dns:    { type: "microsoft", endpoint: "", defaultZone: "", ignoreSslErrors: false },
  dhcp:   { type: "microsoft", endpoint: "", defaultScope: "", ignoreSslErrors: false },
  allowedUsers: [],
  allowedDnsZones: [],
  dnsFlushTargets: [],
  adManagementEnabled: false,
  adManagementAdminOnly: true,
};

export async function readProvisioningConfig(): Promise<ProvisioningConfig> {
  return readJsonConfig<ProvisioningConfig>(CONFIG_KEY, DEFAULT_CONFIG);
}

export async function saveProvisioningConfig(
  patch: Partial<{
    netbox: Partial<ProvisioningConfig["netbox"]> & { token?: string };
    dns:    Partial<ProvisioningConfig["dns"]>    & { token?: string };
    dhcp:   Partial<ProvisioningConfig["dhcp"]>   & { token?: string };
    allowedUsers: string[];
  }>,
): Promise<void> {
  const cfg = await readProvisioningConfig();

  if (patch.netbox) {
    const { token, ...rest } = patch.netbox;
    Object.assign(cfg.netbox, rest);
    if (token) cfg.netbox.tokenEncrypted = await encryptField(token);
  }
  if (patch.dns) {
    const { token, ...rest } = patch.dns;
    Object.assign(cfg.dns, rest);
    if (token) cfg.dns.tokenEncrypted = await encryptField(token);
  }
  if (patch.dhcp) {
    const { token, ...rest } = patch.dhcp;
    Object.assign(cfg.dhcp, rest);
    if (token) cfg.dhcp.tokenEncrypted = await encryptField(token);
  }
  if (patch.allowedUsers) cfg.allowedUsers = patch.allowedUsers;
  if ((patch as Record<string, unknown>).allowedDnsZones) cfg.allowedDnsZones = (patch as Record<string, unknown>).allowedDnsZones as string[];
  if ((patch as Record<string, unknown>).dnsFlushTargets) cfg.dnsFlushTargets = (patch as Record<string, unknown>).dnsFlushTargets as string[];
  if ((patch as Record<string, unknown>).dnsFlushToken) cfg.dnsFlushTokenEncrypted = await encryptField((patch as Record<string, unknown>).dnsFlushToken as string);
  if ((patch as Record<string, unknown>).adManagementEnabled !== undefined) cfg.adManagementEnabled = !!(patch as Record<string, unknown>).adManagementEnabled;
  if ((patch as Record<string, unknown>).adManagementAdminOnly !== undefined) cfg.adManagementAdminOnly = !!(patch as Record<string, unknown>).adManagementAdminOnly;

  await writeJsonConfig(CONFIG_KEY, cfg);
}

/** Resolve the Netbox API token (decrypt). */
async function getNetboxToken(): Promise<string> {
  const cfg = await readProvisioningConfig();
  if (!cfg.netbox.tokenEncrypted) return "";
  return decryptField(cfg.netbox.tokenEncrypted);
}

// ── SQLite tables ────────────────────────────────────────────────────────────

function initProvisioningTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS provisioning_device_profiles (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      icon                 TEXT NOT NULL DEFAULT '📦',
      netbox_role_id       INTEGER,
      default_vlan_id      INTEGER,
      default_prefix_id    INTEGER,
      default_dns_zone     TEXT NOT NULL DEFAULT '',
      default_dhcp_scope   TEXT NOT NULL DEFAULT '',
      default_gateway      TEXT NOT NULL DEFAULT '',
      manufacturer_filter  TEXT NOT NULL DEFAULT '[]',
      requires_asset_tag   INTEGER NOT NULL DEFAULT 0,
      auto_create_cmdb     INTEGER NOT NULL DEFAULT 0,
      vm_deploy_template_id TEXT,
      netbox_cluster_id    INTEGER,
      sort_order           INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS provisioning_history (
      id               TEXT PRIMARY KEY,
      timestamp        TEXT NOT NULL,
      user             TEXT NOT NULL,
      device_name      TEXT NOT NULL,
      profile_name     TEXT NOT NULL DEFAULT '',
      ip_address       TEXT NOT NULL DEFAULT '',
      mac_address      TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'success',
      netbox_device_id INTEGER,
      details          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_prov_hist_ts
      ON provisioning_history(timestamp DESC);

    CREATE TABLE IF NOT EXISTS provisioning_audit (
      id        TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      user      TEXT NOT NULL,
      tab       TEXT NOT NULL DEFAULT 'provision',
      action    TEXT NOT NULL,
      target    TEXT NOT NULL DEFAULT '',
      status    TEXT NOT NULL DEFAULT 'success',
      details   TEXT NOT NULL DEFAULT '{}',
      ip        TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_prov_audit_ts
      ON provisioning_audit(timestamp DESC);
  `);

  // Migration: add columns that may not exist yet
  const db = getDb();
  const cols = db.prepare("PRAGMA table_info(provisioning_device_profiles)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has("default_gateway"))        db.exec("ALTER TABLE provisioning_device_profiles ADD COLUMN default_gateway TEXT NOT NULL DEFAULT ''");
  if (!colNames.has("vm_deploy_template_id"))  db.exec("ALTER TABLE provisioning_device_profiles ADD COLUMN vm_deploy_template_id TEXT");
  if (!colNames.has("netbox_cluster_id"))      db.exec("ALTER TABLE provisioning_device_profiles ADD COLUMN netbox_cluster_id INTEGER");
  if (!colNames.has("default_tags"))           db.exec("ALTER TABLE provisioning_device_profiles ADD COLUMN default_tags TEXT NOT NULL DEFAULT '[]'");
}

// ── Device Profile CRUD ──────────────────────────────────────────────────────

export function listDeviceProfiles(): DeviceProfile[] {
  initProvisioningTables();
  const rows = getDb().prepare(
    "SELECT * FROM provisioning_device_profiles ORDER BY sort_order ASC, name ASC"
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToProfile);
}

export function getDeviceProfile(id: string): DeviceProfile | null {
  initProvisioningTables();
  const row = getDb().prepare(
    "SELECT * FROM provisioning_device_profiles WHERE id = ?"
  ).get(id) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function createDeviceProfile(data: Omit<DeviceProfile, "id">): DeviceProfile {
  initProvisioningTables();
  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO provisioning_device_profiles
      (id, name, icon, netbox_role_id, default_vlan_id, default_prefix_id,
       default_dns_zone, default_dhcp_scope, default_gateway,
       manufacturer_filter, requires_asset_tag, auto_create_cmdb,
       vm_deploy_template_id, netbox_cluster_id, default_tags, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.name, data.icon, data.netboxRoleId, data.defaultVlanId,
    data.defaultPrefixId, data.defaultDnsZone ?? "", data.defaultDhcpScope ?? "",
    data.defaultGateway ?? "",
    JSON.stringify(data.manufacturerFilter ?? []),
    data.requiresAssetTag ? 1 : 0, data.autoCreateCmdb ? 1 : 0,
    data.vmDeployTemplateId ?? null,
    data.netboxClusterId ?? null,
    JSON.stringify(data.defaultTags ?? []),
    data.sortOrder ?? 0,
  );
  return getDeviceProfile(id)!;
}

export function updateDeviceProfile(id: string, data: Partial<DeviceProfile>): DeviceProfile | null {
  initProvisioningTables();
  const existing = getDeviceProfile(id);
  if (!existing) return null;
  getDb().prepare(`
    UPDATE provisioning_device_profiles SET
      name = ?, icon = ?, netbox_role_id = ?, default_vlan_id = ?,
      default_prefix_id = ?, default_dns_zone = ?, default_dhcp_scope = ?,
      default_gateway = ?,
      manufacturer_filter = ?,
      requires_asset_tag = ?, auto_create_cmdb = ?,
      vm_deploy_template_id = ?, netbox_cluster_id = ?,
      default_tags = ?, sort_order = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.icon ?? existing.icon,
    data.netboxRoleId ?? existing.netboxRoleId,
    data.defaultVlanId ?? existing.defaultVlanId,
    data.defaultPrefixId ?? existing.defaultPrefixId,
    data.defaultDnsZone ?? existing.defaultDnsZone,
    data.defaultDhcpScope ?? existing.defaultDhcpScope,
    data.defaultGateway ?? existing.defaultGateway,
    JSON.stringify(data.manufacturerFilter ?? existing.manufacturerFilter),
    (data.requiresAssetTag ?? existing.requiresAssetTag) ? 1 : 0,
    (data.autoCreateCmdb ?? existing.autoCreateCmdb) ? 1 : 0,
    data.vmDeployTemplateId !== undefined ? data.vmDeployTemplateId : existing.vmDeployTemplateId,
    data.netboxClusterId !== undefined ? data.netboxClusterId : existing.netboxClusterId,
    JSON.stringify(data.defaultTags ?? existing.defaultTags),
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return getDeviceProfile(id);
}

export function deleteDeviceProfile(id: string): boolean {
  initProvisioningTables();
  const r = getDb().prepare("DELETE FROM provisioning_device_profiles WHERE id = ?").run(id);
  return r.changes > 0;
}

function rowToProfile(row: Record<string, unknown>): DeviceProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: String(row.icon ?? "📦"),
    netboxRoleId: row.netbox_role_id != null ? Number(row.netbox_role_id) : null,
    defaultVlanId: row.default_vlan_id != null ? Number(row.default_vlan_id) : null,
    defaultPrefixId: row.default_prefix_id != null ? Number(row.default_prefix_id) : null,
    defaultDnsZone: String(row.default_dns_zone ?? ""),
    defaultDhcpScope: String(row.default_dhcp_scope ?? ""),
    defaultGateway: String(row.default_gateway ?? ""),
    manufacturerFilter: (() => { try { return JSON.parse(String(row.manufacturer_filter ?? "[]")); } catch { return []; } })(),
    requiresAssetTag: row.requires_asset_tag === 1,
    autoCreateCmdb: row.auto_create_cmdb === 1,
    vmDeployTemplateId: row.vm_deploy_template_id ? String(row.vm_deploy_template_id) : null,
    netboxClusterId: row.netbox_cluster_id != null ? Number(row.netbox_cluster_id) : null,
    defaultTags: (() => { try { return JSON.parse(String(row.default_tags ?? "[]")); } catch { return []; } })(),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

// ── Netbox API client ────────────────────────────────────────────────────────

// Simple in-memory cache for reference data
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 15 * 60_000;

/** Invalidate cached Netbox GET responses whose key contains the given substring. */
export function clearNetboxCache(pathContains?: string) {
  if (!pathContains) { _cache.clear(); return; }
  for (const key of _cache.keys()) {
    if (key.includes(pathContains)) _cache.delete(key);
  }
}

export async function netboxFetch(
  path: string,
  options: RequestInit = {},
  useCache = false,
): Promise<unknown> {
  const cfg = await readProvisioningConfig();
  if (!cfg.netbox.url) throw new Error("Netbox URL not configured");

  const cacheKey = `nb:${path}`;
  if (useCache) {
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  }

  const token = await getNetboxToken();
  const url = `${cfg.netbox.url.replace(/\/$/, "")}/api${path}`;
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  const doFetch = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    return fetch(url, { ...options, headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  let res: Response;
  if (cfg.netbox.ignoreSslErrors) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try { res = await doFetch(); }
    finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  } else {
    res = await doFetch();
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Netbox ${res.status}: ${txt.slice(0, 300)}`);
  }

  // 204 No Content (e.g. DELETE) has no body
  if (res.status === 204) return null;
  const data = await res.json();
  if (useCache) _cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

/** Test Netbox connectivity by fetching /api/status/. */
export async function testNetboxConnection(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const data = await netboxFetch("/status/") as Record<string, unknown>;
    const version = String(data["netbox-version"] ?? data["django-version"] ?? "unknown");
    return { ok: true, message: `Connected — Netbox ${version}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

/** Test DNS agent connectivity by hitting its health endpoint. */
export async function testDnsAgentConnection(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const cfg = await readProvisioningConfig();
    if (!cfg.dns.endpoint) return { ok: false, error: "DNS agent endpoint not configured" };
    const res = await providerFetch(cfg.dns.endpoint, "/api/health", cfg.dns.tokenEncrypted, cfg.dns.ignoreSslErrors);
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { ok: true, message: `Connected${data.version ? ` — v${data.version}` : ""}` };
    }
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

/** Test DHCP agent connectivity by hitting its health endpoint. */
export async function testDhcpAgentConnection(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const cfg = await readProvisioningConfig();
    if (!cfg.dhcp.endpoint) return { ok: false, error: "DHCP agent endpoint not configured" };
    const res = await providerFetch(cfg.dhcp.endpoint, "/api/health", cfg.dhcp.tokenEncrypted, cfg.dhcp.ignoreSslErrors);
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { ok: true, message: `Connected${data.version ? ` — v${data.version}` : ""}` };
    }
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ── DNS / DHCP provider abstraction ──────────────────────────────────────────

async function providerFetch(
  endpoint: string,
  path: string,
  tokenEncrypted: string | undefined,
  ignoreSsl: boolean,
  options: RequestInit = {},
): Promise<Response> {
  if (!endpoint) throw new Error("Provider endpoint not configured");
  const token = tokenEncrypted ? await decryptField(tokenEncrypted) : "";
  const url = `${endpoint.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const doFetch = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    return fetch(url, { ...options, headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  if (ignoreSsl) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try { return await doFetch(); }
    finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
  return doFetch();
}

// ── Pre-flight checks ────────────────────────────────────────────────────────

export async function runPreflightChecks(
  req: ProvisioningRequest,
): Promise<{ results: PreflightResult[]; allocatedIp?: string }> {
  const cfg = await readProvisioningConfig();
  let ip = req.ipAllocation === "manual" ? req.manualIp ?? "" : "";
  let allocatedIp: string | undefined;
  const fqdn = `${req.deviceName}.${req.dnsZone}`;

  // For auto-allocation, peek at the next available IP from Netbox
  if (req.ipAllocation === "auto" && req.prefixId) {
    try {
      const peek = await netboxFetch(
        `/ipam/prefixes/${req.prefixId}/available-ips/?limit=1`,
        {},
        false,
      ) as Array<{ address: string }> | { address: string };
      const entry = Array.isArray(peek) ? peek[0] : peek;
      if (entry?.address) {
        ip = entry.address.split("/")[0]; // strip CIDR
        allocatedIp = ip;
      }
    } catch { /* Netbox unreachable — IP checks will still skip gracefully */ }
  }

  const checks: Array<{ id: PreflightCheckId; label: string; fn: () => Promise<PreflightResult> }> = [
    {
      id: "netbox-name", label: "Device name unique in Netbox",
      fn: async () => {
        try {
          const data = await netboxFetch(`/dcim/devices/?name=${encodeURIComponent(req.deviceName)}`) as { count: number };
          return data.count === 0
            ? { id: "netbox-name" as const, label: "Device name unique in Netbox", status: "pass" as const, message: "Name is available" }
            : { id: "netbox-name" as const, label: "Device name unique in Netbox", status: "fail" as const, message: `Device "${req.deviceName}" already exists in Netbox` };
        } catch (e) {
          return { id: "netbox-name" as const, label: "Device name unique in Netbox", status: "fail" as const, message: e instanceof Error ? e.message : "Check failed" };
        }
      },
    },
    {
      id: "netbox-mac", label: "MAC not already registered",
      fn: async () => {
        try {
          const data = await netboxFetch(`/dcim/interfaces/?mac_address=${encodeURIComponent(req.macAddress)}`) as { count: number };
          return data.count === 0
            ? { id: "netbox-mac" as const, label: "MAC not already registered", status: "pass" as const, message: "MAC is available" }
            : { id: "netbox-mac" as const, label: "MAC not already registered", status: "fail" as const, message: `MAC ${req.macAddress} already registered in Netbox` };
        } catch (e) {
          return { id: "netbox-mac" as const, label: "MAC not already registered", status: "fail" as const, message: e instanceof Error ? e.message : "Check failed" };
        }
      },
    },
    {
      id: "netbox-ip", label: "IP not in use (Netbox IPAM)",
      fn: async () => {
        if (!ip) return { id: "netbox-ip" as const, label: "IP not in use (Netbox IPAM)", status: "skip" as const, message: "Auto-allocation — checked at execution" };
        try {
          const data = await netboxFetch(`/ipam/ip-addresses/?address=${encodeURIComponent(ip)}`) as { count: number };
          return data.count === 0
            ? { id: "netbox-ip" as const, label: "IP not in use (Netbox IPAM)", status: "pass" as const, message: "IP is available in IPAM" }
            : { id: "netbox-ip" as const, label: "IP not in use (Netbox IPAM)", status: "fail" as const, message: `IP ${ip} already registered in Netbox IPAM` };
        } catch (e) {
          return { id: "netbox-ip" as const, label: "IP not in use (Netbox IPAM)", status: "fail" as const, message: e instanceof Error ? e.message : "Check failed" };
        }
      },
    },
    {
      id: "ping", label: "IP not pingable",
      fn: async () => {
        if (!ip) return { id: "ping" as const, label: "IP not pingable", status: "skip" as const, message: "Auto-allocation" };
        try {
          const reachable = await tcpProbe(ip, 80, 2000) || await tcpProbe(ip, 443, 2000);
          return reachable
            ? { id: "ping" as const, label: "IP not pingable", status: "fail" as const, message: `IP ${ip} responds — already in use` }
            : { id: "ping" as const, label: "IP not pingable", status: "pass" as const, message: "No response — IP appears free" };
        } catch {
          return { id: "ping" as const, label: "IP not pingable", status: "pass" as const, message: "No response — IP appears free" };
        }
      },
    },
    {
      id: "dns", label: "DNS name not taken",
      fn: async () => {
        try {
          const records = await dns.resolve4(fqdn).catch(() => []);
          return records.length === 0
            ? { id: "dns" as const, label: "DNS name not taken", status: "pass" as const, message: `${fqdn} not found in DNS` }
            : { id: "dns" as const, label: "DNS name not taken", status: "fail" as const, message: `${fqdn} resolves to ${records.join(", ")}` };
        } catch {
          return { id: "dns" as const, label: "DNS name not taken", status: "pass" as const, message: `${fqdn} not found in DNS` };
        }
      },
    },
    {
      id: "dhcp", label: "DHCP reservation doesn't exist",
      fn: async () => {
        if (!cfg.dhcp.endpoint) return { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "skip" as const, message: "DHCP provider not configured" };
        if (!ip) return { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "skip" as const, message: "Auto-allocation" };
        try {
          const res = await providerFetch(cfg.dhcp.endpoint, `/dhcp/reservations?ip=${encodeURIComponent(ip)}&mac=${encodeURIComponent(req.macAddress)}`, cfg.dhcp.tokenEncrypted, cfg.dhcp.ignoreSslErrors);
          if (!res.ok) return { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "warn" as const, message: `DHCP check returned HTTP ${res.status}` };
          const data = await res.json() as { count?: number; reservations?: unknown[] };
          const count = data.count ?? data.reservations?.length ?? 0;
          return count === 0
            ? { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "pass" as const, message: "No existing reservation" }
            : { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "fail" as const, message: "DHCP reservation already exists for this IP or MAC" };
        } catch (e) {
          return { id: "dhcp" as const, label: "DHCP reservation doesn't exist", status: "warn" as const, message: e instanceof Error ? e.message : "Check failed" };
        }
      },
    },
  ];

  const results = await Promise.all(checks.map(c => c.fn()));
  return { results, allocatedIp };
}

/** TCP connect probe — returns true if the port is open. */
function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

// ── Execute pipeline ─────────────────────────────────────────────────────────

/** Ensure tags exist in Netbox, creating any that are missing. */
async function ensureNetboxTags(tagNames: string[]): Promise<void> {
  if (!tagNames.length) return;
  for (const name of tagNames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      // Check if the tag already exists
      const existing = await netboxFetch(`/extras/tags/?name=${encodeURIComponent(name)}`) as { count: number };
      if (existing.count > 0) continue;
      // Create the tag
      await netboxFetch("/extras/tags/", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
    } catch { /* tag may already exist via slug collision — safe to ignore */ }
  }
}

/** Convert CIDR prefix length to dotted subnet mask (e.g. 22 → "255.255.252.0"). */
function cidrToSubnetMask(cidr: number): string {
  const mask = (0xFFFFFFFF << (32 - cidr)) >>> 0;
  return [(mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF].join(".");
}

export async function executeProvisioning(
  req: ProvisioningRequest,
  actor: string,
): Promise<ProvisioningResult> {
  const cfg = await readProvisioningConfig();
  const profile = getDeviceProfile(req.profileId);
  const roleId = profile?.netboxRoleId ?? cfg.netbox.defaultRoleId;
  const fqdn = `${req.deviceName}.${req.dnsZone}`;
  const isVm = !!(profile?.vmDeployTemplateId);

  const steps: PipelineStep[] = [
    { id: "netbox-device",     label: isVm ? "Create VM in Netbox" : "Create device in Netbox", status: "pending" },
    { id: "netbox-interface",  label: "Create network interface",      status: "pending" },
    { id: "netbox-ip",         label: "Allocate IP address",           status: "pending" },
    { id: "netbox-primary-ip", label: "Set primary IP",                status: "pending" },
    { id: "dhcp-reservation",  label: "Create DHCP reservation",       status: "pending" },
    { id: "dns-record",        label: "Create DNS record",             status: "pending" },
  ];
  if (profile?.autoCreateCmdb) {
    steps.push({ id: "cmdb-ci", label: "Create CMDB entry", status: "pending" });
  }
  if (isVm) {
    steps.push({ id: "vmware-deploy", label: "Deploy VM via VMware", status: "pending" });
  }

  // Track created resources for rollback
  let deviceId: number | undefined;
  let interfaceId: number | undefined;
  let ipId: number | undefined;
  let allocatedIp = "";
  let prefixCidr = 24; // default; will be updated from prefix lookup

  function markStep(id: PipelineStepId, status: PipelineStep["status"], detail?: string, resourceId?: string | number, resourceUrl?: string) {
    const step = steps.find(s => s.id === id);
    if (step) { step.status = status; step.detail = detail; step.resourceId = resourceId; step.resourceUrl = resourceUrl; }
  }

  try {
    // Step 1: Create device / VM in Netbox
    markStep("netbox-device", "running");
    // Resolve tags for Netbox (Netbox accepts tags as [{name: "..."}])
    const reqTags = req.tags?.length ? req.tags : (profile?.defaultTags ?? []);
    // Ensure tags exist in Netbox before referencing them
    await ensureNetboxTags(reqTags);
    const nbTags = reqTags.length ? reqTags.map(t => ({ name: t })) : undefined;

    if (isVm) {
      // Use Netbox Virtualization module for VMs
      const vmBody: Record<string, unknown> = {
        name: req.deviceName,
        site: req.siteId,
        comments: req.comment || "",
        status: "active",
      };
      if (profile!.netboxClusterId) vmBody.cluster = profile!.netboxClusterId;
      if (roleId) vmBody.role = roleId;
      if (nbTags) vmBody.tags = nbTags;
      const vm = await netboxFetch("/virtualization/virtual-machines/", { method: "POST", body: JSON.stringify(vmBody) }) as { id: number };
      deviceId = vm.id;
      markStep("netbox-device", "done", `VM ID ${vm.id}`, vm.id, `${cfg.netbox.url}/virtualization/virtual-machines/${vm.id}/`);
    } else {
      // Physical device
      const deviceBody: Record<string, unknown> = {
        name: req.deviceName,
        device_type: req.deviceTypeId,
        role: roleId,
        site: req.siteId,
        comments: req.comment || "",
      };
      if (req.assetTag) deviceBody.asset_tag = req.assetTag;
      if (nbTags) deviceBody.tags = nbTags;
      const device = await netboxFetch("/dcim/devices/", { method: "POST", body: JSON.stringify(deviceBody) }) as { id: number };
      deviceId = device.id;
      markStep("netbox-device", "done", `Device ID ${device.id}`, device.id, `${cfg.netbox.url}/dcim/devices/${device.id}/`);
    }

    // Step 2: Create interface
    markStep("netbox-interface", "running");
    if (isVm) {
      const ifBody = { virtual_machine: deviceId, name: "eth0", mac_address: req.macAddress };
      const iface = await netboxFetch("/virtualization/interfaces/", { method: "POST", body: JSON.stringify(ifBody) }) as { id: number };
      interfaceId = iface.id;
      markStep("netbox-interface", "done", `VM Interface ID ${iface.id}`, iface.id);
    } else {
      const ifBody = { device: deviceId, name: "NIC01", type: "1000base-t", mac_address: req.macAddress };
      const iface = await netboxFetch("/dcim/interfaces/", { method: "POST", body: JSON.stringify(ifBody) }) as { id: number };
      interfaceId = iface.id;
      markStep("netbox-interface", "done", `Interface ID ${iface.id}`, iface.id);
    }

    // Determine the assigned_object_type for IP assignment
    const ifObjectType = isVm ? "virtualization.vminterface" : "dcim.interface";

    // Step 3: Allocate IP
    markStep("netbox-ip", "running");
    let ipData: { id: number; address: string };
    if (req.ipAllocation === "auto") {
      const result = await netboxFetch(`/ipam/prefixes/${req.prefixId}/available-ips/`, {
        method: "POST",
        body: JSON.stringify({
          status: "dhcp",
          dns_name: fqdn,
          description: req.comment || req.deviceName,
          assigned_object_type: ifObjectType,
          assigned_object_id: interfaceId,
        }),
      }) as { id: number; address: string } | Array<{ id: number; address: string }>;
      ipData = Array.isArray(result) ? result[0] : result;
    } else {
      let ipWithMask = req.manualIp!;
      if (req.prefixId && !ipWithMask.includes("/")) {
        try {
          const pfx = await netboxFetch(`/ipam/prefixes/${req.prefixId}/`) as { prefix: string };
          const mask = pfx.prefix.split("/")[1];
          if (mask) { ipWithMask = `${ipWithMask}/${mask}`; prefixCidr = Number(mask); }
        } catch { /* fall through */ }
      }
      const result = await netboxFetch("/ipam/ip-addresses/", {
        method: "POST",
        body: JSON.stringify({
          address: ipWithMask,
          status: "dhcp",
          dns_name: fqdn,
          description: req.comment || req.deviceName,
          assigned_object_type: ifObjectType,
          assigned_object_id: interfaceId,
        }),
      }) as { id: number; address: string };
      ipData = result;
    }
    ipId = ipData.id;
    allocatedIp = ipData.address.split("/")[0];
    // Extract CIDR from the allocated address (e.g. "172.24.152.5/22" → 22)
    if (ipData.address.includes("/")) prefixCidr = Number(ipData.address.split("/")[1]) || 24;
    markStep("netbox-ip", "done", `${allocatedIp} (ID ${ipData.id})`, ipData.id);

    // Step 4: Set primary IP
    markStep("netbox-primary-ip", "running");
    if (isVm) {
      await netboxFetch(`/virtualization/virtual-machines/${deviceId}/`, {
        method: "PATCH",
        body: JSON.stringify({ primary_ip4: ipId }),
      });
    } else {
      await netboxFetch(`/dcim/devices/${deviceId}/`, {
        method: "PATCH",
        body: JSON.stringify({ primary_ip4: ipId }),
      });
    }
    markStep("netbox-primary-ip", "done", "Primary IPv4 set");

    // Step 5: DHCP reservation
    markStep("dhcp-reservation", "running");
    if (cfg.dhcp.endpoint) {
      const dhcpScope = req.dhcpScope || cfg.dhcp.defaultScope;
      if (!dhcpScope) {
        throw new Error("DHCP scope is required but none was selected and no default is configured in Admin → Provisioning → DHCP → Default Scope");
      }
      const dhcpDesc = [req.comment || req.deviceName, ...(reqTags.length ? [`[tags: ${reqTags.join(", ")}]`] : [])].join(" ");
      const dhcpRes = await providerFetch(cfg.dhcp.endpoint, "/dhcp/reservations", cfg.dhcp.tokenEncrypted, cfg.dhcp.ignoreSslErrors, {
        method: "POST",
        body: JSON.stringify({
          scope: dhcpScope,
          ipAddress: allocatedIp,
          hostName: fqdn,
          macAddress: req.macAddress,
          description: dhcpDesc,
        }),
      });
      if (!dhcpRes.ok) {
        const txt = await dhcpRes.text().catch(() => "");
        throw new Error(`DHCP reservation failed: HTTP ${dhcpRes.status} ${txt.slice(0, 200)}`);
      }
      markStep("dhcp-reservation", "done", `Reservation created in scope ${dhcpScope}`);
    } else {
      markStep("dhcp-reservation", "done", "Skipped — DHCP not configured");
    }

    // Step 6: DNS record
    markStep("dns-record", "running");
    if (cfg.dns.endpoint) {
      const dnsRes = await providerFetch(cfg.dns.endpoint, "/dns/records", cfg.dns.tokenEncrypted, cfg.dns.ignoreSslErrors, {
        method: "POST",
        body: JSON.stringify({
          type: "A",
          name: req.deviceName,
          zone: req.dnsZone || cfg.dns.defaultZone,
          ipAddress: allocatedIp,
        }),
      });
      if (!dnsRes.ok) {
        const txt = await dnsRes.text().catch(() => "");
        throw new Error(`DNS record creation failed: HTTP ${dnsRes.status} ${txt.slice(0, 200)}`);
      }
      markStep("dns-record", "done", `${fqdn} → ${allocatedIp}`);
    } else {
      markStep("dns-record", "done", "Skipped — DNS not configured");
    }

    // Step 7: CMDB CI (optional)
    if (profile?.autoCreateCmdb) {
      markStep("cmdb-ci", "running");
      markStep("cmdb-ci", "done", "CMDB integration placeholder");
    }

    // Step 8: VMware Deploy (when profile has a linked deploy template)
    if (isVm && profile?.vmDeployTemplateId) {
      markStep("vmware-deploy", "running");
      const vmConfig = await readVmwareConfig();
      if (!vmConfig.enabled || !vmConfig.vcenterUrl || !vmConfig.passwordEncrypted) {
        throw new Error("VMware is not configured — cannot deploy VM");
      }
      const deployTpl = getVmDeployTemplate(profile.vmDeployTemplateId);
      if (!deployTpl) throw new Error(`VMware deploy template "${profile.vmDeployTemplateId}" not found`);

      const subnetMask = cidrToSubnetMask(prefixCidr);
      const gateway = req.gateway || profile.defaultGateway;
      if (!gateway) throw new Error("Gateway is required for VM deployment but none was provided");

      const vmResult = await deployVmViaPowerCLI(vmConfig, {
        templateId: deployTpl.vcenterTemplateId,
        vmName: req.deviceName,
        customizationSpecName: deployTpl.customizationSpec,
        ip: allocatedIp,
        subnetMask,
        gateway,
        dns: [],
        datastoreId: deployTpl.defaultDatastoreId || undefined,
        clusterId: deployTpl.defaultClusterId || undefined,
        resourcePoolId: deployTpl.defaultResourcePoolId || undefined,
        folderId: deployTpl.defaultFolderId || undefined,
        networkId: deployTpl.defaultNetworkId || undefined,
        cpuCount: deployTpl.defaultCpuCount ?? undefined,
        memoryMiB: deployTpl.defaultMemoryMiB ?? undefined,
      });

      if (vmResult.success) {
        markStep("vmware-deploy", "done", `VM deployed (${deployTpl.name})`, vmResult.vmMoRef);
        sendRawSyslog(JSON.stringify({
          event: "vmware.deploy", vmName: req.deviceName, ip: allocatedIp,
          template: deployTpl.name, user: actor, status: "success",
          tags: reqTags.length ? reqTags : undefined,
        }), "vmware.deploy").catch(() => {});
      } else {
        throw new Error(`VMware deploy failed: ${vmResult.error}`);
      }
    }

    // Log success
    logHistory(actor, req.deviceName, profile?.name ?? "", allocatedIp, req.macAddress, "success", deviceId, { steps, tags: reqTags.length ? reqTags : undefined });
    auditLog(actor, req.deviceName, "success", { deviceId, ip: allocatedIp, tags: reqTags.length ? reqTags : undefined });
    writeInfraAudit({
      user: actor, tab: "provision", action: "provision-device",
      target: req.deviceName, status: "success",
      details: { deviceId, ip: allocatedIp, mac: req.macAddress, profile: profile?.name, isVm, tags: reqTags.length ? reqTags : undefined },
      auditEvent: "provisioning.device.created",
    });

    const nbUrlBase = isVm ? "virtualization/virtual-machines" : "dcim/devices";
    return {
      success: true,
      steps,
      netboxDeviceId: deviceId,
      netboxDeviceUrl: `${cfg.netbox.url}/${nbUrlBase}/${deviceId}/`,
      ipAddress: allocatedIp,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";

    // Mark current running step as failed
    for (const s of steps) {
      if (s.status === "running") { s.status = "failed"; s.detail = errMsg; break; }
    }

    // Rollback completed Netbox resources (best-effort, reverse order)
    if (ipId) {
      try { await netboxFetch(`/ipam/ip-addresses/${ipId}/`, { method: "DELETE" }); } catch { /* best-effort */ }
      const ipStep = steps.find(s => s.id === "netbox-ip");
      if (ipStep && ipStep.status === "done") ipStep.status = "rolled-back";
    }
    if (interfaceId) {
      const ifPath = isVm ? `/virtualization/interfaces/${interfaceId}/` : `/dcim/interfaces/${interfaceId}/`;
      try { await netboxFetch(ifPath, { method: "DELETE" }); } catch { /* best-effort */ }
      const ifStep = steps.find(s => s.id === "netbox-interface");
      if (ifStep && ifStep.status === "done") ifStep.status = "rolled-back";
    }
    if (deviceId) {
      const devPath = isVm ? `/virtualization/virtual-machines/${deviceId}/` : `/dcim/devices/${deviceId}/`;
      try { await netboxFetch(devPath, { method: "DELETE" }); } catch { /* best-effort */ }
      const devStep = steps.find(s => s.id === "netbox-device");
      if (devStep && devStep.status === "done") devStep.status = "rolled-back";
    }
    // Rollback DHCP if it was completed
    if (allocatedIp && cfg.dhcp.endpoint) {
      const dhcpStep = steps.find(s => s.id === "dhcp-reservation");
      if (dhcpStep?.status === "done") {
        try {
          await providerFetch(cfg.dhcp.endpoint, `/dhcp/reservations/${encodeURIComponent(allocatedIp)}`, cfg.dhcp.tokenEncrypted, cfg.dhcp.ignoreSslErrors, { method: "DELETE" });
        } catch { /* best-effort */ }
        dhcpStep.status = "rolled-back";
      }
    }
    // Rollback DNS if it was completed
    if (cfg.dns.endpoint) {
      const dnsStep = steps.find(s => s.id === "dns-record");
      if (dnsStep?.status === "done") {
        try {
          const rollbackZone = req.dnsZone || cfg.dns.defaultZone;
          await providerFetch(cfg.dns.endpoint, `/dns/records/${encodeURIComponent(req.deviceName)}?zone=${encodeURIComponent(rollbackZone)}`, cfg.dns.tokenEncrypted, cfg.dns.ignoreSslErrors, { method: "DELETE" });
        } catch { /* best-effort */ }
        dnsStep.status = "rolled-back";
      }
    }

    const finalStatus = steps.some(s => s.status === "rolled-back") ? "rolled-back" : "failed";
    logHistory(actor, req.deviceName, profile?.name ?? "", allocatedIp, req.macAddress, finalStatus as "failed" | "rolled-back", deviceId ?? null, { steps, error: errMsg });
    auditLog(actor, req.deviceName, "failure", { error: errMsg });
    writeInfraAudit({
      user: actor, tab: "provision", action: "provision-device",
      target: req.deviceName, status: "failure",
      details: { error: errMsg, finalStatus },
      auditEvent: "provisioning.device.created",
    });

    return { success: false, steps, error: errMsg };
  }
}

// ── Decommission pipeline ────────────────────────────────────────────────────

export async function executeDecommission(
  deviceName: string,
  actor: string,
): Promise<DecommissionResult> {
  const cfg = await readProvisioningConfig();

  // Netbox cascades: deleting a device removes its interfaces and assigned IPs.
  // Order: DNS → DHCP → Device (IP + interface cascade-deleted with device).
  const steps: DecommissionStep[] = [
    { id: "dns-record",        label: "Delete DNS record",          status: "pending" },
    { id: "dhcp-reservation",  label: "Delete DHCP reservation",   status: "pending" },
    { id: "netbox-device",     label: "Delete device from Netbox",  status: "pending" },
  ];

  function markStep(id: DecommissionStepId, status: DecommissionStep["status"], detail?: string) {
    const step = steps.find(s => s.id === id);
    if (step) { step.status = status; step.detail = detail; }
  }

  let ipAddress = "";
  let macAddress = "";

  try {
    // 1. Look up device in Netbox
    const devSearch = await netboxFetch(`/dcim/devices/?name=${encodeURIComponent(deviceName)}`) as { count: number; results: Array<Record<string, unknown>> };
    if (devSearch.count === 0) throw new Error(`Device "${deviceName}" not found in Netbox`);
    const dev = devSearch.results[0];
    const deviceId = Number(dev.id);
    const primaryIp = dev.primary_ip4 as { id: number; address: string; dns_name?: string } | null;
    if (primaryIp?.address) ipAddress = String(primaryIp.address).split("/")[0];
    const dnsName = primaryIp?.dns_name ?? "";

    // Look up interface to get MAC
    const ifSearch = await netboxFetch(`/dcim/interfaces/?device_id=${deviceId}&limit=10`) as { results: Array<{ id: number; mac_address?: string }> };
    const iface = ifSearch.results?.[0];
    const interfaceId = iface?.id;
    if (iface?.mac_address) macAddress = iface.mac_address;

    // Parse hostname + zone from dns_name (e.g. "server01.example.com" → name="server01", zone="example.com")
    let dnsHostname = "";
    let dnsZone = "";
    if (dnsName && dnsName.includes(".")) {
      const dot = dnsName.indexOf(".");
      dnsHostname = dnsName.slice(0, dot);
      dnsZone = dnsName.slice(dot + 1);
    }

    // 2. Delete DNS record
    markStep("dns-record", "running");
    if (cfg.dns.endpoint && dnsHostname && dnsZone) {
      try {
        const dnsRes = await providerFetch(
          cfg.dns.endpoint,
          `/dns/records/${encodeURIComponent(dnsHostname)}?zone=${encodeURIComponent(dnsZone)}&type=A`,
          cfg.dns.tokenEncrypted, cfg.dns.ignoreSslErrors,
          { method: "DELETE" },
        );
        if (dnsRes.ok || dnsRes.status === 404) {
          markStep("dns-record", "done", dnsRes.status === 404 ? "Not found (already removed)" : `Deleted ${dnsName}`);
        } else {
          const txt = await dnsRes.text().catch(() => "");
          markStep("dns-record", "failed", `HTTP ${dnsRes.status}: ${txt.slice(0, 200)}`);
        }
      } catch (e) {
        markStep("dns-record", "failed", e instanceof Error ? e.message : "DNS agent unreachable");
      }
    } else {
      markStep("dns-record", "done", !cfg.dns.endpoint ? "Skipped — DNS not configured" : "Skipped — no DNS name on device");
    }

    // 3. Delete DHCP reservation
    markStep("dhcp-reservation", "running");
    if (cfg.dhcp.endpoint && ipAddress) {
      try {
        const dhcpRes = await providerFetch(
          cfg.dhcp.endpoint,
          `/dhcp/reservations/${encodeURIComponent(ipAddress)}`,
          cfg.dhcp.tokenEncrypted, cfg.dhcp.ignoreSslErrors,
          { method: "DELETE" },
        );
        if (dhcpRes.ok || dhcpRes.status === 404) {
          markStep("dhcp-reservation", "done", dhcpRes.status === 404 ? "Not found (already removed)" : `Deleted reservation for ${ipAddress}`);
        } else {
          const txt = await dhcpRes.text().catch(() => "");
          markStep("dhcp-reservation", "failed", `HTTP ${dhcpRes.status}: ${txt.slice(0, 200)}`);
        }
      } catch (e) {
        markStep("dhcp-reservation", "failed", e instanceof Error ? e.message : "DHCP agent unreachable");
      }
    } else {
      markStep("dhcp-reservation", "done", !cfg.dhcp.endpoint ? "Skipped — DHCP not configured" : "Skipped — no IP address");
    }

    // 4. Delete Netbox device (cascades: interfaces + assigned IPs are auto-deleted)
    markStep("netbox-device", "running");
    try {
      await netboxFetch(`/dcim/devices/${deviceId}/`, { method: "DELETE" });
      const cascaded = [ipAddress ? `IP ${ipAddress}` : null, interfaceId ? `interface ${interfaceId}` : null].filter(Boolean).join(", ");
      markStep("netbox-device", "done", `Deleted device ID ${deviceId}${cascaded ? ` (cascade: ${cascaded})` : ""}`);
    } catch (e) {
      markStep("netbox-device", "failed", e instanceof Error ? e.message : "Failed");
    }

    const allDone = steps.every(s => s.status === "done");
    const anyFailed = steps.some(s => s.status === "failed");

    logHistory(actor, deviceName, "decommission", ipAddress, macAddress, anyFailed ? "failed" : "success", deviceId, { steps });
    writeInfraAudit({
      user: actor, tab: "provision", action: "decommission-device",
      target: deviceName, status: anyFailed ? "failure" : "success",
      details: { ip: ipAddress, mac: macAddress, steps: steps.map(s => ({ id: s.id, status: s.status })) },
      auditEvent: "provisioning.device.decommissioned",
    });

    return { success: allDone, steps, deviceName, ipAddress, ...(!allDone && anyFailed ? { error: "Some steps failed — see details" } : {}) };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    // Mark first pending step as failed
    for (const s of steps) {
      if (s.status === "pending" || s.status === "running") { s.status = "failed"; s.detail = errMsg; break; }
    }

    logHistory(actor, deviceName, "decommission", ipAddress, macAddress, "failed", null, { steps, error: errMsg });
    writeInfraAudit({
      user: actor, tab: "provision", action: "decommission-device",
      target: deviceName, status: "failure",
      details: { error: errMsg },
      auditEvent: "provisioning.device.decommissioned",
    });

    return { success: false, steps, error: errMsg, deviceName, ipAddress };
  }
}

// ── History ──────────────────────────────────────────────────────────────────

function logHistory(
  user: string, deviceName: string, profileName: string,
  ip: string, mac: string, status: string,
  netboxDeviceId: number | null, details: Record<string, unknown>,
): void {
  try {
    initProvisioningTables();
    getDb().prepare(`
      INSERT INTO provisioning_history (id, timestamp, user, device_name, profile_name, ip_address, mac_address, status, netbox_device_id, details)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), user, deviceName, profileName, ip, mac, status, netboxDeviceId, JSON.stringify(details));
  } catch { /* non-critical */ }
}

export function getProvisioningHistory(limit = 100): ProvisioningHistoryEntry[] {
  try {
    initProvisioningTables();
    const rows = getDb().prepare(`
      SELECT * FROM provisioning_history ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      user: String(r.user),
      deviceName: String(r.device_name),
      profileName: String(r.profile_name),
      ipAddress: String(r.ip_address),
      macAddress: String(r.mac_address),
      status: String(r.status) as "success" | "failed" | "rolled-back",
      netboxDeviceId: r.netbox_device_id != null ? Number(r.netbox_device_id) : null,
      details: (() => { try { return JSON.parse(String(r.details)); } catch { return {}; } })(),
    }));
  } catch { return []; }
}

// ── Audit ────────────────────────────────────────────────────────────────────

function auditLog(actor: string, deviceName: string, outcome: "success" | "failure", details: Record<string, unknown>): void {
  _writeAuditLogDirect({
    event: "provisioning.device.created",
    outcome,
    actor,
    sessionType: "session",
    resource: deviceName,
    resourceType: "provisioned-device",
    details,
  }).catch(() => {});
}

// ── Infrastructure module audit (dual-write: SQLite + JSONL) ─────────────────

import type { AuditEventType } from "./types";

export function writeInfraAudit(opts: {
  user: string;
  tab: InfraAuditTab;
  action: string;
  target: string;
  status: "success" | "failure";
  details?: Record<string, unknown>;
  ip?: string;
  auditEvent?: AuditEventType;
}): void {
  try {
    initProvisioningTables();
    getDb().prepare(`
      INSERT INTO provisioning_audit (id, timestamp, user, tab, action, target, status, details, ip)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      opts.user,
      opts.tab,
      opts.action,
      opts.target,
      opts.status,
      JSON.stringify(opts.details ?? {}),
      opts.ip ?? "",
    );
  } catch { /* non-critical */ }

  // Also write to the global encrypted JSONL audit log
  if (opts.auditEvent) {
    _writeAuditLogDirect({
      event: opts.auditEvent,
      outcome: opts.status,
      actor: opts.user,
      sessionType: "session",
      resource: opts.target,
      resourceType: `infra-${opts.tab}`,
      details: opts.details,
    }).catch(() => {});
  }
}

export function getInfraAuditLog(opts?: {
  limit?: number;
  tab?: InfraAuditTab;
  user?: string;
  action?: string;
  from?: string;
  to?: string;
}): InfraAuditEntry[] {
  try {
    initProvisioningTables();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.tab) { conditions.push("tab = ?"); params.push(opts.tab); }
    if (opts?.user) { conditions.push("user = ?"); params.push(opts.user); }
    if (opts?.action) { conditions.push("action = ?"); params.push(opts.action); }
    if (opts?.from) { conditions.push("timestamp >= ?"); params.push(opts.from); }
    if (opts?.to) { conditions.push("timestamp <= ?"); params.push(opts.to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(opts?.limit ?? 500);
    const rows = getDb().prepare(
      `SELECT * FROM provisioning_audit ${where} ORDER BY timestamp DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      user: String(r.user),
      tab: String(r.tab) as InfraAuditTab,
      action: String(r.action),
      target: String(r.target),
      status: String(r.status) as "success" | "failure",
      details: (() => { try { return JSON.parse(String(r.details)); } catch { return {}; } })(),
      ip: String(r.ip ?? ""),
    }));
  } catch { return []; }
}
