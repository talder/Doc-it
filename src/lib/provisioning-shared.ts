/**
 * Provisioning module — client-safe types and helpers.
 * No server dependencies — safe to import from "use client" components.
 */

// ── Config types ─────────────────────────────────────────────────────────────

export interface NetboxConfig {
  url: string;
  tokenEncrypted?: string; // server only
  tokenSet?: boolean;      // client view
  siteId: number | null;
  defaultRoleId: number | null;
  ignoreSslErrors: boolean;
}

export interface DnsConfig {
  type: "microsoft" | "generic";
  endpoint: string;
  tokenEncrypted?: string;
  tokenSet?: boolean;
  defaultZone: string;
  ignoreSslErrors: boolean;
}

export interface DhcpConfig {
  type: "microsoft" | "generic";
  endpoint: string;
  tokenEncrypted?: string;
  tokenSet?: boolean;
  defaultScope: string;
  ignoreSslErrors: boolean;
}

export interface ProvisioningConfig {
  netbox: NetboxConfig;
  dns: DnsConfig;
  dhcp: DhcpConfig;
  allowedUsers: string[];
  /** DNS zones where write operations are allowed (empty = all zones writable) */
  allowedDnsZones: string[];
  /** Agent endpoint URLs of DNS forwarder/caching servers whose cache can be flushed (e.g. https://vxdns01:5989) */
  dnsFlushTargets: string[];
  /** Encrypted auth token shared by all DNS flush target agents */
  dnsFlushTokenEncrypted?: string;
  /** Client-side flag: true if dnsFlushTokenEncrypted is set */
  dnsFlushTokenSet?: boolean;
  /** Master toggle for the AD management tab */
  adManagementEnabled: boolean;
  /** Restrict the AD tab to admin users only (default true) */
  adManagementAdminOnly: boolean;
}

// ── Infrastructure audit types (client-safe) ─────────────────────────────────

export type InfraAuditTab = "provision" | "dns" | "dhcp" | "ad" | "vmware-deploy";

export interface InfraAuditEntry {
  id: string;
  timestamp: string;
  user: string;
  tab: InfraAuditTab;
  action: string;
  target: string;
  status: "success" | "failure";
  details: Record<string, unknown>;
  ip: string;
}

// ── Device Profiles ──────────────────────────────────────────────────────────

export interface DeviceProfile {
  id: string;
  name: string;
  icon: string;
  netboxRoleId: number | null;
  defaultVlanId: number | null;
  defaultPrefixId: number | null;
  defaultDnsZone: string;          // e.g. "sezz.local" — auto-filled in wizard
  defaultDhcpScope: string;        // e.g. "172.24.152.0" — auto-filled in wizard
  defaultGateway: string;          // e.g. "172.24.152.1" — for VM deployments
  defaultTags: string[];           // optional tags auto-populated in wizard
  manufacturerFilter: number[];    // Netbox manufacturer IDs
  requiresAssetTag: boolean;
  autoCreateCmdb: boolean;
  vmDeployTemplateId: string | null;
  netboxClusterId: number | null;  // Netbox virtualization cluster (for VM profiles)
  sortOrder: number;
}

// ── Netbox reference data (subset of Netbox API responses) ───────────────────

export interface NetboxManufacturer {
  id: number;
  name: string;
  slug: string;
}

export interface NetboxDeviceType {
  id: number;
  manufacturer: { id: number; name: string; slug: string };
  model: string;
  slug: string;
  part_number: string;
}

export interface NetboxSite {
  id: number;
  name: string;
  slug: string;
}

export interface NetboxVlan {
  id: number;
  vid: number;
  name: string;
  group?: { id: number; name: string } | null;
}

export interface NetboxPrefix {
  id: number;
  prefix: string;
  vlan?: { id: number; vid: number; name: string } | null;
  site?: { id: number; name: string } | null;
  description: string;
}

export interface NetboxDeviceRole {
  id: number;
  name: string;
  slug: string;
  color: string;
}

// ── Provisioning request (wizard → API) ──────────────────────────────────────

export interface ProvisioningRequest {
  profileId: string;
  deviceName: string;
  deviceTypeId: number;
  siteId: number;
  assetTag?: string;
  macAddress: string;
  comment: string;
  vlanId: number | null;
  prefixId: number;
  ipAllocation: "auto" | "manual";
  manualIp?: string;
  dnsZone: string;
  dhcpScope: string;
  gateway?: string;  // override for VM deployment (defaults to profile.defaultGateway)
  tags?: string[];   // optional tags pushed to Netbox, VMware, etc.
}

// ── Pre-flight checks ────────────────────────────────────────────────────────

export type PreflightCheckId =
  | "netbox-name"
  | "netbox-mac"
  | "netbox-ip"
  | "ping"
  | "dns"
  | "dhcp";

export type PreflightStatus = "pending" | "running" | "pass" | "fail" | "warn" | "skip";

export interface PreflightResult {
  id: PreflightCheckId;
  label: string;
  status: PreflightStatus;
  message: string;
}

// ── Execution pipeline ───────────────────────────────────────────────────────

export type PipelineStepId =
  | "netbox-device"
  | "netbox-interface"
  | "netbox-ip"
  | "netbox-primary-ip"
  | "dhcp-reservation"
  | "dns-record"
  | "cmdb-ci"
  | "vmware-deploy";

// ── Decommission pipeline ────────────────────────────────────────────────────

export type DecommissionStepId =
  | "dns-record"
  | "dhcp-reservation"
  | "netbox-device";

export interface DecommissionStep {
  id: DecommissionStepId;
  label: string;
  status: PipelineStepStatus;
  detail?: string;
}

export interface DecommissionResult {
  success: boolean;
  steps: DecommissionStep[];
  error?: string;
  deviceName: string;
  ipAddress?: string;
}

export type PipelineStepStatus = "pending" | "running" | "done" | "failed" | "rolled-back";

export interface PipelineStep {
  id: PipelineStepId;
  label: string;
  status: PipelineStepStatus;
  detail?: string;
  resourceId?: string | number;
  resourceUrl?: string;
}

export interface ProvisioningResult {
  success: boolean;
  steps: PipelineStep[];
  error?: string;
  netboxDeviceId?: number;
  netboxDeviceUrl?: string;
  ipAddress?: string;
}

// ── History ──────────────────────────────────────────────────────────────────

export interface ProvisioningHistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  deviceName: string;
  profileName: string;
  ipAddress: string;
  macAddress: string;
  status: "success" | "failed" | "rolled-back";
  netboxDeviceId: number | null;
  details: Record<string, unknown>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/;

export function isValidMac(mac: string): boolean {
  return MAC_REGEX.test(mac.trim());
}

export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ":");
}

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export function isValidIpv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip.trim())) return false;
  return ip.trim().split(".").every(o => { const n = Number(o); return n >= 0 && n <= 255; });
}

export function profileIcon(profile: DeviceProfile): string {
  return profile.icon || "📦";
}
