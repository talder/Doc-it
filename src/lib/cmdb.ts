/**
 * CMDB module — IT configuration management database.
 *
 * Global store at config/assets.json.
 * CIs are organized in user-defined containers (tree structure).
 * Supports custom field definitions of various types.
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField } from "./crypto";

// ── Types ────────────────────────────────────────────────────────────

export type CmdbItemStatus = "Active" | "Maintenance" | "Decommissioned" | "Ordered";

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "url";

export interface CmdbContainer {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[]; // for select type
}

// ── CmdbItem Types ──────────────────────────────────────────────────────

export interface CmdbItemType {
  id: string;
  name: string;           // "Server", "Laptop", …
  icon: string;           // emoji or lucide icon name
  color: string;          // hex accent
  fields: CustomFieldDef[];  // per-type custom fields
  builtIn?: boolean;      // seed types can't be deleted
}

// ── Relationships ────────────────────────────────────────────────────

export interface RelationshipTypeDef {
  id: string;
  label: string;          // "Runs on"
  inverseLabel: string;   // "Hosts"
  builtIn?: boolean;
}

export interface CmdbRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  typeId: string;         // references RelationshipTypeDef.id
  label?: string;         // optional override / note
}

// ── History ──────────────────────────────────────────────────────────

export interface CmdbHistoryChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export type CmdbHistoryAction =
  | "created" | "updated" | "status-changed"
  | "checked-out" | "checked-in"
  | "relationship-added" | "relationship-removed"
  | "inventory-update"
  | "lifecycle-transition";

export interface CmdbHistoryEntry {
  timestamp: string;
  user: string;
  action: CmdbHistoryAction;
  changes: CmdbHistoryChange[];
}

// ── Software Inventory (agent) ───────────────────────────────────────

export interface SoftwareItem {
  name: string;
  version: string;
  publisher?: string;
}

export interface HardwareInfo {
  cpu?: string;
  cpuCores?: number;
  ramMb?: number;
  disks?: { name: string; sizeMb: number; serial?: string }[];
  nics?: { name: string; mac: string; ip?: string }[];
}

export type LicenseType =
  | "per-seat"
  | "per-device"
  | "volume"
  | "site"
  | "oem"
  | "subscription"
  | "freeware"
  | "open-source";

export type LicenseComplianceStatus = "compliant" | "over-licensed" | "under-licensed" | "expired";

export interface SoftwareLicense {
  id: string;
  name: string;
  vendor: string;
  product: string;
  licenseType: LicenseType;
  licenseKey?: string; // encrypted at rest
  totalSeats: number; // 0 = unlimited
  purchaseDate: string;
  expiryDate: string;
  cost: number;
  currency: string;
  contractRef?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface SoftwareLicenseView extends Omit<SoftwareLicense, "licenseKey"> {
  hasLicenseKey: boolean;
  maskedLicenseKey?: string;
}

export interface LicenseComplianceEntry {
  licenseId: string;
  licenseName: string;
  product: string;
  totalSeats: number;
  allocatedCount: number;
  availableCount: number;
  installedAssets: { id: string; name: string }[];
  complianceStatus: LicenseComplianceStatus;
}

export interface LicenseComplianceSummary {
  compliant: number;
  expired: number;
  overLicensed: number;
  underLicensed: number;
  total: number;
}

export type LifecycleRole = "admin" | "writer";

export interface LifecycleState {
  id: string;
  name: string;
  color: string;
  isFinal: boolean;
}

export interface LifecycleTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  label: string;
  requiredRole?: LifecycleRole;
}

export interface LifecycleWorkflow {
  id: string;
  name: string;
  states: LifecycleState[];
  transitions: LifecycleTransition[];
  initialStateId: string;
  builtIn?: boolean;
}

export type LocationType = "site" | "building" | "floor" | "room" | "rack" | "slot";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  order: number;
}

// ── Business Services ────────────────────────────────────────────────

export type ServiceCriticality = "critical" | "high" | "medium" | "low";
export type ServiceStatus = "operational" | "degraded" | "outage" | "planned";

export interface BusinessService {
  id: string;             // SVC-0001
  name: string;
  owner: string;
  criticality: ServiceCriticality;
  description: string;
  status: ServiceStatus;
  memberAssetIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// ── Saved Views ──────────────────────────────────────────────────────

export interface SavedViewFilters {
  containerId?: string;
  search?: string;
  tags?: string[];
  typeId?: string;
  status?: CmdbItemStatus;
  owner?: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: SavedViewFilters;
  createdBy: string;
  createdAt: string;
}

// ── CI Templates ─────────────────────────────────────────────────────

export interface CmdbTemplate {
  id: string;
  name: string;
  description: string;
  typeId?: string;
  containerId?: string;
  tags: string[];
  fields: {
    os?: string;
    location?: string;
    locationId?: string;
    owner?: string;
    notes?: string;
    customFields?: Record<string, string | number | boolean>;
  };
  createdBy: string;
  createdAt: string;
}

// ── Maintenance Windows ──────────────────────────────────────────────

export interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  assetIds: string[];
  serviceIds: string[];
  startTime: string;  // ISO
  endTime: string;    // ISO
  recurring: boolean;
  recurrenceRule?: string; // e.g. "weekly", "monthly"
  createdBy: string;
  createdAt: string;
}

// ── Compliance Checklists ────────────────────────────────────────────

export interface ComplianceCheckDef {
  id: string;
  label: string;         // "Patched", "Backed up", "Documented", "Antivirus"
  description?: string;
}

export interface ComplianceCheck {
  defId: string;
  passed: boolean;
  checkedAt: string;
  checkedBy: string;
  notes?: string;
}

// ── Vulnerability Tracking ───────────────────────────────────────────

export type VulnSeverity = "critical" | "high" | "medium" | "low" | "info";
export type VulnStatus = "open" | "mitigated" | "accepted" | "resolved";

export interface VulnerabilityEntry {
  id: string;
  cveId?: string;        // e.g. CVE-2024-1234
  title: string;
  description: string;
  severity: VulnSeverity;
  status: VulnStatus;
  affectedAssetIds: string[];
  remediationNotes: string;
  discoveredAt: string;
  resolvedAt?: string;
  createdBy: string;
}

// ── Change Requests ─────────────────────────────────────────────────

export type CrStatus = "draft" | "pending" | "approved" | "rejected" | "implemented" | "rolled-back";
export type CrRisk = "low" | "medium" | "high" | "critical";

export interface ChangeRequest {
  id: string;            // RFC-0001
  title: string;
  description: string;
  risk: CrRisk;
  status: CrStatus;
  affectedAssetIds: string[];
  affectedServiceIds: string[];
  rollbackPlan: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  approvedBy?: string;
  approvedAt?: string;
  implementedBy?: string;
  implementedAt?: string;
  changeLogEntryId?: string;  // link to changelog
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Cost / TCO ──────────────────────────────────────────────────────

export interface CostInfo {
  purchaseCost: number;
  monthlyCost: number;
  currency: string;        // EUR, USD, etc.
  depreciationYears: number; // 0 = no depreciation
  contractRef?: string;
  renewalDate?: string;
  vendor?: string;
}

// ── SLA Monitoring ──────────────────────────────────────────────────

export interface ServiceSla {
  serviceId: string;
  uptimeTarget: number;    // e.g. 99.9
  responseTimeTarget?: number; // minutes
  breaches: SlaBreach[];
}

export interface SlaBreach {
  id: string;
  timestamp: string;
  duration: number;       // minutes
  description: string;
  resolved: boolean;
}

// ── Network Scanning ────────────────────────────────────────────────

export interface ScanConfig {
  id: string;
  name: string;
  ipRange: string;       // e.g. "192.168.1.0/24" or "10.0.0.1-10.0.0.254"
  ports: number[];       // TCP ports to probe
  defaultContainerId?: string;
  createdBy: string;
  createdAt: string;
}

export interface DiscoveredDevice {
  ip: string;
  hostname: string;
  openPorts: number[];
  guessedType: string;   // "server", "switch", "printer", etc.
  guessedTypeId: string; // references CmdbItemType.id
  alreadyExists: boolean;
  existingAssetId?: string;
}

export interface ScanResult {
  id: string;
  configId: string;
  configName: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  scannedCount: number;
  discoveredDevices: DiscoveredDevice[];
  error?: string;
}

// ── Impact Analysis ─────────────────────────────────────────────────

export interface ImpactNode {
  assetId: string;
  assetName: string;
  depth: number;
  relationshipLabel: string;
  parentAssetId: string | null;
}

export interface ImpactResult {
  rootAssetId: string;
  rootAssetName: string;
  direction: "upstream" | "downstream" | "both";
  nodes: ImpactNode[];
  affectedServices: { id: string; name: string; criticality: ServiceCriticality; status: ServiceStatus }[];
}

// ── CmdbItem ────────────────────────────────────────────────────────────

export interface CmdbItem {
  id: string;           // AST-0001
  name: string;         // hostname / asset name
  containerId: string;
  status: CmdbItemStatus;
  workflowId?: string;
  lifecycleStateId?: string;
  type: string;         // legacy free-text (kept for migration compat)
  typeId?: string;      // references CmdbItemType.id
  ipAddresses: string[];
  os: string;
  location: string;
  locationId?: string;
  owner: string;
  purchaseDate: string; // YYYY-MM-DD or ""
  warrantyExpiry: string;
  notes: string;
  customFields: Record<string, string | number | boolean>;
  // Tags
  tags: string[];
  // Check-in / check-out
  assignedTo?: string;
  checkedOutAt?: string;
  checkedOutBy?: string;
  // History
  history: CmdbHistoryEntry[];
  // Compliance
  complianceChecks?: ComplianceCheck[];
  // Cost
  costInfo?: CostInfo;
  // Agent inventory
  softwareInventory?: SoftwareItem[];
  hardwareInfo?: HardwareInfo;
  lastInventoryAt?: string;
  agentId?: string;
  agentVersion?: string;
  // Soft delete
  deletedAt?: string;
  deletedBy?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CmdbReportSettings {
  enabled: boolean;
  schedule: "weekly" | "monthly";
  recipients: string[];  // email addresses
  dayOfWeek?: number;    // 0=Sun..6=Sat (for weekly)
  dayOfMonth?: number;   // 1-28 (for monthly)
}

export interface CmdbData {
  nextNumber: number;
  nextLicenseNumber: number;
  containers: CmdbContainer[];
  locations: Location[];
  customFieldDefs: CustomFieldDef[];
  assets: CmdbItem[];
  licenses: SoftwareLicense[];
  assetTypes: CmdbItemType[];
  lifecycleWorkflows: LifecycleWorkflow[];
  relationshipTypes: RelationshipTypeDef[];
  relationships: CmdbRelationship[];
  businessServices: BusinessService[];
  nextServiceNumber: number;
  savedViews: SavedView[];
  templates: CmdbTemplate[];
  maintenanceWindows: MaintenanceWindow[];
  scanConfigs: ScanConfig[];
  scanResults: ScanResult[];
  complianceCheckDefs: ComplianceCheckDef[];
  vulnerabilities: VulnerabilityEntry[];
  changeRequests: ChangeRequest[];
  nextCrNumber: number;
  serviceSlas: ServiceSla[];
  recycleBin: CmdbItem[];
  reportSettings: CmdbReportSettings;
}

// ── Constants ────────────────────────────────────────────────────────

const ASSETS_FILE = "assets.json";

const EMPTY: CmdbData = {
  nextNumber: 1,
  nextLicenseNumber: 1,
  containers: [],
  locations: [],
  customFieldDefs: [],
  assets: [],
  licenses: [],
  assetTypes: [],
  lifecycleWorkflows: [],
  relationshipTypes: [],
  relationships: [],
  businessServices: [],
  nextServiceNumber: 1,
  savedViews: [],
  templates: [],
  maintenanceWindows: [],
  scanConfigs: [],
  scanResults: [],
  complianceCheckDefs: [],
  vulnerabilities: [],
  changeRequests: [],
  nextCrNumber: 1,
  serviceSlas: [],
  recycleBin: [],
  reportSettings: { enabled: false, schedule: "weekly", recipients: [] },
};

// ── Seed data ────────────────────────────────────────────────────────

const SEED_TYPES: CmdbItemType[] = [
  { id: "type-server",     name: "Server",          icon: "🖥️", color: "#3b82f6", fields: [{ id: "sf-ram", name: "RAM (GB)", type: "number" }, { id: "sf-cpu", name: "CPU Cores", type: "number" }], builtIn: true },
  { id: "type-laptop",     name: "Laptop",          icon: "💻", color: "#8b5cf6", fields: [{ id: "sf-serial", name: "Serial Number", type: "text" }, { id: "sf-model", name: "Model", type: "text" }], builtIn: true },
  { id: "type-desktop",    name: "Desktop",         icon: "🖥️", color: "#6366f1", fields: [{ id: "sf-serial2", name: "Serial Number", type: "text" }, { id: "sf-model2", name: "Model", type: "text" }], builtIn: true },
  { id: "type-switch",     name: "Switch",          icon: "🔀", color: "#06b6d4", fields: [{ id: "sf-ports", name: "Port Count", type: "number" }], builtIn: true },
  { id: "type-router",     name: "Router",          icon: "🌐", color: "#0891b2", fields: [], builtIn: true },
  { id: "type-firewall",   name: "Firewall",        icon: "🛡️", color: "#ef4444", fields: [], builtIn: true },
  { id: "type-printer",    name: "Printer",         icon: "🖨️", color: "#f59e0b", fields: [], builtIn: true },
  { id: "type-phone",      name: "Phone",           icon: "📱", color: "#10b981", fields: [], builtIn: true },
  { id: "type-vm",         name: "Virtual Machine", icon: "☁️",  color: "#a855f7", fields: [], builtIn: true },
  { id: "type-other",      name: "Other",           icon: "📦", color: "#6b7280", fields: [], builtIn: true },
];

const SEED_RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  { id: "rel-runs-on",      label: "Runs on",      inverseLabel: "Hosts",          builtIn: true },
  { id: "rel-connected-to", label: "Connected to", inverseLabel: "Connected to",  builtIn: true },
  { id: "rel-depends-on",   label: "Depends on",   inverseLabel: "Depended on by", builtIn: true },
  { id: "rel-part-of",      label: "Part of",      inverseLabel: "Contains",       builtIn: true },
  { id: "rel-assigned-with",label: "Assigned with",inverseLabel: "Assigned with",  builtIn: true },
  { id: "rel-supports",     label: "Supports",     inverseLabel: "Supported by",   builtIn: true },
];

const DEFAULT_WORKFLOW_ID = "workflow-default";
const DEFAULT_LIFECYCLE_WORKFLOW: LifecycleWorkflow = {
  id: DEFAULT_WORKFLOW_ID,
  name: "Default",
  builtIn: true,
  initialStateId: "lc-requested",
  states: [
    { id: "lc-requested", name: "Requested", color: "#64748b", isFinal: false },
    { id: "lc-approved", name: "Approved", color: "#3b82f6", isFinal: false },
    { id: "lc-procured", name: "Procured", color: "#06b6d4", isFinal: false },
    { id: "lc-deployed", name: "Deployed", color: "#14b8a6", isFinal: false },
    { id: "lc-in-use", name: "In Use", color: "#16a34a", isFinal: false },
    { id: "lc-maintenance", name: "Maintenance", color: "#d97706", isFinal: false },
    { id: "lc-retired", name: "Retired", color: "#6b7280", isFinal: false },
    { id: "lc-disposed", name: "Disposed", color: "#111827", isFinal: true },
  ],
  transitions: [
    { id: "lct-requested-approved", fromStateId: "lc-requested", toStateId: "lc-approved", label: "Approve", requiredRole: "writer" },
    { id: "lct-approved-procured", fromStateId: "lc-approved", toStateId: "lc-procured", label: "Procure", requiredRole: "writer" },
    { id: "lct-procured-deployed", fromStateId: "lc-procured", toStateId: "lc-deployed", label: "Deploy", requiredRole: "writer" },
    { id: "lct-deployed-in-use", fromStateId: "lc-deployed", toStateId: "lc-in-use", label: "Go Live", requiredRole: "writer" },
    { id: "lct-in-use-maintenance", fromStateId: "lc-in-use", toStateId: "lc-maintenance", label: "Maintenance", requiredRole: "writer" },
    { id: "lct-maintenance-in-use", fromStateId: "lc-maintenance", toStateId: "lc-in-use", label: "Return to Service", requiredRole: "writer" },
    { id: "lct-in-use-retired", fromStateId: "lc-in-use", toStateId: "lc-retired", label: "Retire", requiredRole: "admin" },
    { id: "lct-retired-disposed", fromStateId: "lc-retired", toStateId: "lc-disposed", label: "Dispose", requiredRole: "admin" },
  ],
};

const LEGACY_STATUS_TO_LIFECYCLE_STATE: Record<CmdbItemStatus, string> = {
  Active: "lc-in-use",
  Maintenance: "lc-maintenance",
  Decommissioned: "lc-retired",
  Ordered: "lc-procured",
};

const DEFAULT_LOCATION_TYPES: LocationType[] = ["site", "building", "floor", "room", "rack", "slot"];

export const VALID_CMDB_STATUSES: CmdbItemStatus[] = ["Active", "Maintenance", "Decommissioned", "Ordered"];
export const VALID_LICENSE_TYPES: LicenseType[] = ["per-seat", "per-device", "volume", "site", "oem", "subscription", "freeware", "open-source"];
export const VALID_LOCATION_TYPES: LocationType[] = DEFAULT_LOCATION_TYPES;

function slugifyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeStoredLocation(location: Location): Location {
  return {
    ...location,
    type: DEFAULT_LOCATION_TYPES.includes(location.type) ? location.type : "site",
    parentId: location.parentId ?? null,
    order: Number.isFinite(location.order) ? location.order : 0,
  };
}

function normalizeStoredWorkflow(workflow: LifecycleWorkflow): LifecycleWorkflow {
  return {
    ...workflow,
    builtIn: workflow.builtIn || false,
    initialStateId: workflow.initialStateId || workflow.states[0]?.id || "",
    states: (workflow.states || []).map((state) => ({
      id: state.id,
      name: state.name,
      color: state.color || "#6b7280",
      isFinal: Boolean(state.isFinal),
    })),
    transitions: (workflow.transitions || []).map((transition) => ({
      id: transition.id,
      fromStateId: transition.fromStateId,
      toStateId: transition.toStateId,
      label: transition.label,
      requiredRole: transition.requiredRole,
    })),
  };
}

function ensureDefaultWorkflow(workflows: LifecycleWorkflow[]): LifecycleWorkflow[] {
  if (workflows.some((workflow) => workflow.id === DEFAULT_WORKFLOW_ID)) return workflows;
  return [DEFAULT_LIFECYCLE_WORKFLOW, ...workflows];
}

function normalizeSoftwareName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function softwareMatchesProduct(softwareName: string, product: string): boolean {
  const normalizedSoftware = normalizeSoftwareName(softwareName);
  const normalizedProduct = normalizeSoftwareName(product);
  if (!normalizedSoftware || !normalizedProduct) return false;
  return normalizedSoftware.includes(normalizedProduct) || normalizedProduct.includes(normalizedSoftware);
}

function maskLicenseKey(value: string): string {
  if (!value) return "";
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(0, value.length - Math.min(4, value.length)))}${visible}`;
}

function toLicenseView(license: SoftwareLicense): SoftwareLicenseView {
  return {
    id: license.id,
    name: license.name,
    vendor: license.vendor,
    product: license.product,
    licenseType: license.licenseType,
    totalSeats: license.totalSeats,
    purchaseDate: license.purchaseDate,
    expiryDate: license.expiryDate,
    cost: license.cost,
    currency: license.currency,
    contractRef: license.contractRef,
    notes: license.notes,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    createdBy: license.createdBy,
    updatedBy: license.updatedBy,
    hasLicenseKey: Boolean(license.licenseKey),
    maskedLicenseKey: license.licenseKey ? maskLicenseKey(license.licenseKey.startsWith("ENC:") ? "stored-key" : license.licenseKey) : undefined,
  };
}

function normalizeStoredLicense(license: SoftwareLicense): SoftwareLicense {
  return {
    ...license,
    vendor: license.vendor || "",
    product: license.product || license.name || "",
    totalSeats: Number.isFinite(license.totalSeats) ? license.totalSeats : 0,
    purchaseDate: license.purchaseDate || "",
    expiryDate: license.expiryDate || "",
    cost: Number.isFinite(license.cost) ? license.cost : 0,
    currency: license.currency || "EUR",
    notes: license.notes || "",
    createdAt: license.createdAt || new Date().toISOString(),
    updatedAt: license.updatedAt || new Date().toISOString(),
    createdBy: license.createdBy || "system",
    updatedBy: license.updatedBy || license.createdBy || "system",
  };
}

// ── Storage ──────────────────────────────────────────────────────────

export async function readCmdb(): Promise<CmdbData> {
  const data = await readJsonConfig<CmdbData>(ASSETS_FILE, { ...EMPTY });
  let dirty = false;

  if (!data.nextLicenseNumber) {
    data.nextLicenseNumber = 1;
    dirty = true;
  }
  if (!data.locations) {
    data.locations = [];
    dirty = true;
  } else {
    data.locations = data.locations.map((location) => {
      const normalized = normalizeStoredLocation(location);
      if (JSON.stringify(normalized) !== JSON.stringify(location)) dirty = true;
      return normalized;
    });
  }
  if (!data.licenses) {
    data.licenses = [];
    dirty = true;
  } else {
    data.licenses = data.licenses.map((license) => {
      const normalized = normalizeStoredLicense(license);
      if (JSON.stringify(normalized) !== JSON.stringify(license)) dirty = true;
      return normalized;
    });
  }

  // Seed asset types if missing
  if (!data.assetTypes || data.assetTypes.length === 0) {
    data.assetTypes = [...SEED_TYPES];
    dirty = true;
  }
  // Seed relationship types if missing
  if (!data.relationshipTypes || data.relationshipTypes.length === 0) {
    data.relationshipTypes = [...SEED_RELATIONSHIP_TYPES];
    dirty = true;
  }
  if (!data.lifecycleWorkflows || data.lifecycleWorkflows.length === 0) {
    data.lifecycleWorkflows = [DEFAULT_LIFECYCLE_WORKFLOW];
    dirty = true;
  } else {
    const normalizedWorkflows = ensureDefaultWorkflow(data.lifecycleWorkflows.map((workflow) => normalizeStoredWorkflow(workflow)));
    if (JSON.stringify(normalizedWorkflows) !== JSON.stringify(data.lifecycleWorkflows)) dirty = true;
    data.lifecycleWorkflows = normalizedWorkflows;
  }
  if (!data.relationships) { data.relationships = []; dirty = true; }
  if (!data.savedViews) { data.savedViews = []; dirty = true; }
  if (!data.templates) { data.templates = []; dirty = true; }
  if (!data.maintenanceWindows) { data.maintenanceWindows = []; dirty = true; }
  if (!data.scanConfigs) { data.scanConfigs = []; dirty = true; }
  if (!data.scanResults) { data.scanResults = []; dirty = true; }
  if (!data.complianceCheckDefs) { data.complianceCheckDefs = []; dirty = true; }
  if (!data.vulnerabilities) { data.vulnerabilities = []; dirty = true; }
  if (!data.changeRequests) { data.changeRequests = []; dirty = true; }
  if (!data.nextCrNumber) { data.nextCrNumber = 1; dirty = true; }
  if (!data.serviceSlas) { data.serviceSlas = []; dirty = true; }
  if (!data.recycleBin) { data.recycleBin = []; dirty = true; }
  if (!data.reportSettings) { data.reportSettings = { enabled: false, schedule: "weekly", recipients: [] }; dirty = true; }
  // Purge recycle bin items older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const binBefore = data.recycleBin.length;
  data.recycleBin = data.recycleBin.filter((a) => (a.deletedAt || "") >= thirtyDaysAgo);
  if (data.recycleBin.length !== binBefore) dirty = true;

  // Migrate free-text type → typeId
  for (const asset of data.assets) {
    if (!asset.history) asset.history = [];
    if (!asset.tags) { asset.tags = []; dirty = true; }
    if (!asset.workflowId) {
      asset.workflowId = DEFAULT_WORKFLOW_ID;
      dirty = true;
    }
    if (!asset.lifecycleStateId) {
      asset.lifecycleStateId = LEGACY_STATUS_TO_LIFECYCLE_STATE[asset.status] || DEFAULT_LIFECYCLE_WORKFLOW.initialStateId;
      dirty = true;
    }
    if (!asset.typeId && asset.type) {
      const match = data.assetTypes.find((t) => t.name.toLowerCase() === asset.type.toLowerCase());
      if (match) {
        asset.typeId = match.id;
        dirty = true;
      } else {
        // Create a new type for this free-text value
        const newType: CmdbItemType = {
          id: `type-${randomUUID().slice(0, 8)}`,
          name: asset.type,
          icon: "\ud83d\udce6",
          color: "#6b7280",
          fields: [],
        };
        data.assetTypes.push(newType);
        asset.typeId = newType.id;
        dirty = true;
      }
    }
    if (!asset.locationId && asset.location?.trim()) {
      const key = asset.location.trim();
      let existing = data.locations.find((location) => location.name.toLowerCase() === key.toLowerCase() && location.parentId === null);
      if (!existing) {
        existing = {
          id: `loc-${slugifyKey(key) || randomUUID().slice(0, 8)}`,
          name: key,
          type: "site",
          parentId: null,
          order: data.locations.filter((location) => location.parentId === null).length,
        };
        data.locations.push(existing);
      }
      asset.locationId = existing.id;
      dirty = true;
    }
  }

  if (dirty) await writeCmdb(data);
  return data;
}

export async function writeCmdb(data: CmdbData): Promise<void> {
  await writeJsonConfig(ASSETS_FILE, data);
}

// ── Container CRUD ───────────────────────────────────────────────────

export async function addContainer(name: string, parentId: string | null): Promise<CmdbContainer> {
  const data = await readCmdb();
  const siblings = data.containers.filter((c) => c.parentId === parentId);
  const container: CmdbContainer = {
    id: randomUUID(),
    name: name.trim(),
    parentId,
    order: siblings.length,
  };
  data.containers.push(container);
  await writeCmdb(data);
  return container;
}

export async function updateContainer(id: string, updates: { name?: string; parentId?: string | null; order?: number }): Promise<CmdbContainer | null> {
  const data = await readCmdb();
  const idx = data.containers.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  // Prevent setting parentId to self or descendant
  if (updates.parentId !== undefined) {
    if (updates.parentId === id) return null;
    if (updates.parentId && isDescendant(data.containers, id, updates.parentId)) return null;
  }

  if (updates.name !== undefined) data.containers[idx].name = updates.name.trim();
  if (updates.parentId !== undefined) data.containers[idx].parentId = updates.parentId;
  if (updates.order !== undefined) data.containers[idx].order = updates.order;
  await writeCmdb(data);
  return data.containers[idx];
}

export async function deleteContainer(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readCmdb();
  const hasChildren = data.containers.some((c) => c.parentId === id);
  if (hasChildren) return { ok: false, error: "Container has sub-groups. Remove them first." };
  const hasAssets = data.assets.some((a) => a.containerId === id);
  if (hasAssets) return { ok: false, error: "Container has assets. Move or delete them first." };
  data.containers = data.containers.filter((c) => c.id !== id);
  await writeCmdb(data);
  return { ok: true };
}

function isDescendant(containers: CmdbContainer[], ancestorId: string, candidateId: string): boolean {
  let current = containers.find((c) => c.id === candidateId);
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? containers.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

// ── CmdbItem CRUD ───────────────────────────────────────────────────────

export interface CreateCmdbItemFields {
  name: string;
  containerId: string;
  status?: CmdbItemStatus;
  workflowId?: string;
  lifecycleStateId?: string;
  type?: string;
  typeId?: string;
  ipAddresses?: string[];
  os?: string;
  location?: string;
  locationId?: string;
  owner?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
  customFields?: Record<string, string | number | boolean>;
  tags?: string[];
  createdBy: string;
}

export async function addCmdbItem(fields: CreateCmdbItemFields): Promise<CmdbItem> {
  const data = await readCmdb();
  const num = data.nextNumber || 1;
  const id = `AST-${String(num).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const asset: CmdbItem = {
    id,
    name: fields.name.trim(),
    containerId: fields.containerId,
    status: fields.status || "Active",
    workflowId: fields.workflowId || "workflow-default",
    lifecycleStateId: fields.lifecycleStateId || LEGACY_STATUS_TO_LIFECYCLE_STATE[fields.status || "Active"] || "lc-in-use",
    type: fields.type?.trim() || "",
    typeId: fields.typeId || undefined,
    ipAddresses: fields.ipAddresses || [],
    os: fields.os?.trim() || "",
    location: fields.location?.trim() || "",
    locationId: fields.locationId || undefined,
    owner: fields.owner?.trim() || "",
    purchaseDate: fields.purchaseDate || "",
    warrantyExpiry: fields.warrantyExpiry || "",
    notes: fields.notes?.trim() || "",
    customFields: fields.customFields || {},
    tags: (fields.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    history: [{ timestamp: now, user: fields.createdBy, action: "created", changes: [] }],
    createdAt: now,
    updatedAt: now,
    createdBy: fields.createdBy,
    updatedBy: fields.createdBy,
  };

  data.assets.push(asset);
  data.nextNumber = num + 1;
  await writeCmdb(data);
  return asset;
}

export interface UpdateAssetFields {
  name?: string;
  containerId?: string;
  status?: CmdbItemStatus;
  workflowId?: string;
  lifecycleStateId?: string;
  type?: string;
  typeId?: string;
  ipAddresses?: string[];
  os?: string;
  location?: string;
  locationId?: string;
  owner?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
  customFields?: Record<string, string | number | boolean>;
  tags?: string[];
  updatedBy: string;
}

/** Diff two values for history tracking. */
function diffFields(old: Record<string, unknown>, updated: Record<string, unknown>, keys: string[]): CmdbHistoryChange[] {
  const changes: CmdbHistoryChange[] = [];
  for (const key of keys) {
    const ov = old[key], nv = updated[key];
    if (nv === undefined) continue;
    const os = JSON.stringify(ov ?? ""), ns = JSON.stringify(nv);
    if (os !== ns) changes.push({ field: key, oldValue: ov ?? "", newValue: nv });
  }
  return changes;
}

const TRACKED_FIELDS = ["name", "containerId", "status", "workflowId", "lifecycleStateId", "type", "typeId", "ipAddresses", "os", "location", "locationId", "owner", "purchaseDate", "warrantyExpiry", "notes", "tags"];

export async function updateCmdbItem(id: string, fields: UpdateAssetFields): Promise<CmdbItem | null> {
  const data = await readCmdb();
  const idx = data.assets.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const a = data.assets[idx];
  const now = new Date().toISOString();

  // Build history entry
  const changes = diffFields(a as unknown as Record<string, unknown>, fields as unknown as Record<string, unknown>, TRACKED_FIELDS);
  const isStatusChange = fields.status !== undefined && fields.status !== a.status;

  if (fields.name !== undefined) a.name = fields.name.trim();
  if (fields.containerId !== undefined) a.containerId = fields.containerId;
  if (fields.status !== undefined) a.status = fields.status;
  if (fields.type !== undefined) a.type = fields.type.trim();
  if (fields.typeId !== undefined) a.typeId = fields.typeId;
  if (fields.ipAddresses !== undefined) a.ipAddresses = fields.ipAddresses;
  if (fields.os !== undefined) a.os = fields.os.trim();
  if (fields.location !== undefined) a.location = fields.location.trim();
  if (fields.locationId !== undefined) a.locationId = fields.locationId;
  if (fields.workflowId !== undefined) a.workflowId = fields.workflowId;
  if (fields.lifecycleStateId !== undefined) a.lifecycleStateId = fields.lifecycleStateId;
  if (fields.owner !== undefined) a.owner = fields.owner.trim();
  if (fields.purchaseDate !== undefined) a.purchaseDate = fields.purchaseDate;
  if (fields.warrantyExpiry !== undefined) a.warrantyExpiry = fields.warrantyExpiry;
  if (fields.notes !== undefined) a.notes = fields.notes.trim();
  if (fields.customFields !== undefined) a.customFields = fields.customFields;
  if (fields.tags !== undefined) a.tags = fields.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  a.updatedAt = now;
  a.updatedBy = fields.updatedBy;

  if (changes.length > 0) {
    if (!a.history) a.history = [];
    a.history.push({ timestamp: now, user: fields.updatedBy, action: isStatusChange ? "status-changed" : "updated", changes });
    // Cap history at 500
    if (a.history.length > 500) a.history = a.history.slice(-500);
  }

  await writeCmdb(data);
  return a;
}

export async function deleteCmdbItem(id: string, actor?: string): Promise<boolean> {
  const data = await readCmdb();
  const idx = data.assets.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  // Soft delete: move to recycle bin
  const asset = data.assets[idx];
  asset.deletedAt = new Date().toISOString();
  asset.deletedBy = actor || "system";
  data.recycleBin.push(asset);
  data.assets.splice(idx, 1);
  // Remove relationships involving this asset
  data.relationships = data.relationships.filter((r) => r.sourceId !== id && r.targetId !== id);
  await writeCmdb(data);
  return true;
}

export async function restoreCmdbItem(id: string): Promise<boolean> {
  const data = await readCmdb();
  const idx = data.recycleBin.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  const asset = data.recycleBin[idx];
  delete asset.deletedAt;
  delete asset.deletedBy;
  data.assets.push(asset);
  data.recycleBin.splice(idx, 1);
  await writeCmdb(data);
  return true;
}

export async function permanentlyDeleteCmdbItem(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.recycleBin.length;
  data.recycleBin = data.recycleBin.filter((a) => a.id !== id);
  if (data.recycleBin.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Custom Field Def CRUD ────────────────────────────────────────────

export async function addFieldDef(name: string, type: CustomFieldType, options?: string[]): Promise<CustomFieldDef> {
  const data = await readCmdb();
  const def: CustomFieldDef = {
    id: randomUUID(),
    name: name.trim(),
    type,
    ...(type === "select" && options ? { options } : {}),
  };
  data.customFieldDefs.push(def);
  await writeCmdb(data);
  return def;
}

export async function updateFieldDef(id: string, updates: { name?: string; type?: CustomFieldType; options?: string[] }): Promise<CustomFieldDef | null> {
  const data = await readCmdb();
  const idx = data.customFieldDefs.findIndex((d) => d.id === id);
  if (idx === -1) return null;

  if (updates.name !== undefined) data.customFieldDefs[idx].name = updates.name.trim();
  if (updates.type !== undefined) data.customFieldDefs[idx].type = updates.type;
  if (updates.options !== undefined) data.customFieldDefs[idx].options = updates.options;
  await writeCmdb(data);
  return data.customFieldDefs[idx];
}

export async function deleteFieldDef(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.customFieldDefs.length;
  data.customFieldDefs = data.customFieldDefs.filter((d) => d.id !== id);
  if (data.customFieldDefs.length === before) return false;
  // Remove field values from all assets
  for (const asset of data.assets) {
    delete asset.customFields[id];
  }
  await writeCmdb(data);
  return true;
}

// ── Search & Lookup ──────────────────────────────────────────────────

export function searchCmdbItems(assets: CmdbItem[], q: string): CmdbItem[] {
  const lower = q.toLowerCase();
  return assets.filter(
    (a) =>
      a.id.toLowerCase().includes(lower) ||
      a.name.toLowerCase().includes(lower) ||
      a.type.toLowerCase().includes(lower) ||
      a.ipAddresses.some((ip) => ip.toLowerCase().includes(lower)) ||
      a.os.toLowerCase().includes(lower) ||
      a.location.toLowerCase().includes(lower) ||
      a.owner.toLowerCase().includes(lower) ||
      a.notes.toLowerCase().includes(lower) ||
      a.status.toLowerCase().includes(lower) ||
      (a.tags || []).some((t) => t.includes(lower)),
  );
}

export function getAssetByName(assets: CmdbItem[], name: string): CmdbItem | undefined {
  const lower = name.toLowerCase();
  return assets.find((a) => a.name.toLowerCase() === lower);
}

export function getLicenseViews(licenses: SoftwareLicense[]): SoftwareLicenseView[] {
  return licenses.map((license) => toLicenseView(license));
}

export function reconcileLicenses(data: CmdbData): LicenseComplianceEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  return data.licenses.map((license) => {
    const installedAssets = data.assets
      .filter((asset) => (asset.softwareInventory || []).some((software) => softwareMatchesProduct(software.name, license.product)))
      .map((asset) => ({ id: asset.id, name: asset.name }));
    const allocatedCount = installedAssets.length;
    const availableCount = license.totalSeats > 0 ? Math.max(license.totalSeats - allocatedCount, 0) : 0;

    let complianceStatus: LicenseComplianceStatus = "compliant";
    if (license.expiryDate && license.expiryDate < today) complianceStatus = "expired";
    else if (license.totalSeats > 0 && allocatedCount > license.totalSeats) complianceStatus = "under-licensed";
    else if (license.totalSeats > 0 && allocatedCount < license.totalSeats) complianceStatus = "over-licensed";

    return {
      licenseId: license.id,
      licenseName: license.name,
      product: license.product,
      totalSeats: license.totalSeats,
      allocatedCount,
      availableCount,
      installedAssets,
      complianceStatus,
    };
  });
}

export function summarizeLicenseCompliance(entries: LicenseComplianceEntry[]): LicenseComplianceSummary {
  return entries.reduce<LicenseComplianceSummary>(
    (summary, entry) => {
      summary.total += 1;
      if (entry.complianceStatus === "compliant") summary.compliant += 1;
      if (entry.complianceStatus === "expired") summary.expired += 1;
      if (entry.complianceStatus === "over-licensed") summary.overLicensed += 1;
      if (entry.complianceStatus === "under-licensed") summary.underLicensed += 1;
      return summary;
    },
    { compliant: 0, expired: 0, overLicensed: 0, underLicensed: 0, total: 0 },
  );
}

export interface CreateSoftwareLicenseFields {
  name: string;
  vendor?: string;
  product: string;
  licenseType: LicenseType;
  licenseKey?: string;
  totalSeats?: number;
  purchaseDate?: string;
  expiryDate?: string;
  cost?: number;
  currency?: string;
  contractRef?: string;
  notes?: string;
  createdBy: string;
}

export interface UpdateSoftwareLicenseFields {
  name?: string;
  vendor?: string;
  product?: string;
  licenseType?: LicenseType;
  licenseKey?: string;
  totalSeats?: number;
  purchaseDate?: string;
  expiryDate?: string;
  cost?: number;
  currency?: string;
  contractRef?: string;
  notes?: string;
  updatedBy: string;
}

export async function addSoftwareLicense(fields: CreateSoftwareLicenseFields): Promise<SoftwareLicense> {
  const data = await readCmdb();
  const num = data.nextLicenseNumber || 1;
  const id = `LIC-${String(num).padStart(4, "0")}`;
  const now = new Date().toISOString();

  const license: SoftwareLicense = {
    id,
    name: fields.name.trim(),
    vendor: fields.vendor?.trim() || "",
    product: fields.product.trim(),
    licenseType: fields.licenseType,
    licenseKey: fields.licenseKey?.trim() ? await encryptField(fields.licenseKey.trim()) : undefined,
    totalSeats: fields.totalSeats ?? 0,
    purchaseDate: fields.purchaseDate || "",
    expiryDate: fields.expiryDate || "",
    cost: fields.cost ?? 0,
    currency: fields.currency?.trim() || "EUR",
    contractRef: fields.contractRef?.trim() || undefined,
    notes: fields.notes?.trim() || "",
    createdAt: now,
    updatedAt: now,
    createdBy: fields.createdBy,
    updatedBy: fields.createdBy,
  };

  data.licenses.push(license);
  data.nextLicenseNumber = num + 1;
  await writeCmdb(data);
  return license;
}

export async function updateSoftwareLicense(id: string, fields: UpdateSoftwareLicenseFields): Promise<SoftwareLicense | null> {
  const data = await readCmdb();
  const idx = data.licenses.findIndex((license) => license.id === id);
  if (idx === -1) return null;

  const license = data.licenses[idx];
  if (fields.name !== undefined) license.name = fields.name.trim();
  if (fields.vendor !== undefined) license.vendor = fields.vendor.trim();
  if (fields.product !== undefined) license.product = fields.product.trim();
  if (fields.licenseType !== undefined) license.licenseType = fields.licenseType;
  if (fields.licenseKey !== undefined) {
    const trimmed = fields.licenseKey.trim();
    license.licenseKey = trimmed ? await encryptField(trimmed) : undefined;
  }
  if (fields.totalSeats !== undefined) license.totalSeats = fields.totalSeats;
  if (fields.purchaseDate !== undefined) license.purchaseDate = fields.purchaseDate;
  if (fields.expiryDate !== undefined) license.expiryDate = fields.expiryDate;
  if (fields.cost !== undefined) license.cost = fields.cost;
  if (fields.currency !== undefined) license.currency = fields.currency.trim() || "EUR";
  if (fields.contractRef !== undefined) license.contractRef = fields.contractRef.trim() || undefined;
  if (fields.notes !== undefined) license.notes = fields.notes.trim();
  license.updatedAt = new Date().toISOString();
  license.updatedBy = fields.updatedBy;

  await writeCmdb(data);
  return license;
}

export async function deleteSoftwareLicense(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.licenses.length;
  data.licenses = data.licenses.filter((license) => license.id !== id);
  if (data.licenses.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Check-in / Check-out ─────────────────────────────────────────────

export async function checkOutCmdbItem(assetId: string, assignedTo: string, actor: string): Promise<CmdbItem | null> {
  const data = await readCmdb();
  const idx = data.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return null;
  const a = data.assets[idx];
  const now = new Date().toISOString();
  if (!a.history) a.history = [];
  a.history.push({ timestamp: now, user: actor, action: "checked-out", changes: [{ field: "assignedTo", oldValue: a.assignedTo || "", newValue: assignedTo }] });
  a.assignedTo = assignedTo;
  a.checkedOutAt = now;
  a.checkedOutBy = actor;
  a.updatedAt = now;
  a.updatedBy = actor;
  await writeCmdb(data);
  return a;
}

export async function checkInCmdbItem(assetId: string, actor: string): Promise<CmdbItem | null> {
  const data = await readCmdb();
  const idx = data.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return null;
  const a = data.assets[idx];
  const now = new Date().toISOString();
  if (!a.history) a.history = [];
  a.history.push({ timestamp: now, user: actor, action: "checked-in", changes: [{ field: "assignedTo", oldValue: a.assignedTo || "", newValue: "" }] });
  a.assignedTo = undefined;
  a.checkedOutAt = undefined;
  a.checkedOutBy = undefined;
  a.updatedAt = now;
  a.updatedBy = actor;
  await writeCmdb(data);
  return a;
}

// ── CmdbItem Type CRUD ─────────────────────────────────────────────────

export async function addCmdbItemType(type: Omit<CmdbItemType, "id">): Promise<CmdbItemType> {
  const data = await readCmdb();
  const record: CmdbItemType = { id: `type-${randomUUID().slice(0, 8)}`, ...type };
  data.assetTypes.push(record);
  await writeCmdb(data);
  return record;
}

export async function updateCmdbItemType(id: string, updates: Partial<Omit<CmdbItemType, "id">>): Promise<CmdbItemType | null> {
  const data = await readCmdb();
  const idx = data.assetTypes.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  Object.assign(data.assetTypes[idx], updates);
  await writeCmdb(data);
  return data.assetTypes[idx];
}

export async function deleteCmdbItemType(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readCmdb();
  const t = data.assetTypes.find((t) => t.id === id);
  if (!t) return { ok: false, error: "Not found" };
  if (t.builtIn) return { ok: false, error: "Cannot delete built-in type" };
  if (data.assets.some((a) => a.typeId === id)) return { ok: false, error: "Type is in use by assets" };
  data.assetTypes = data.assetTypes.filter((t) => t.id !== id);
  await writeCmdb(data);
  return { ok: true };
}

// ── Relationship CRUD ───────────────────────────────────────────────

export async function addRelationship(sourceId: string, targetId: string, typeId: string, label: string | undefined, actor: string): Promise<CmdbRelationship> {
  const data = await readCmdb();
  const rel: CmdbRelationship = { id: randomUUID(), sourceId, targetId, typeId, label };
  data.relationships.push(rel);

  // Log history on both assets
  const now = new Date().toISOString();
  const relType = data.relationshipTypes.find((t) => t.id === typeId);
  for (const asset of data.assets) {
    if (asset.id === sourceId || asset.id === targetId) {
      if (!asset.history) asset.history = [];
      const target = asset.id === sourceId ? targetId : sourceId;
      asset.history.push({ timestamp: now, user: actor, action: "relationship-added", changes: [{ field: "relationship", oldValue: "", newValue: `${relType?.label || typeId} → ${target}` }] });
    }
  }

  await writeCmdb(data);
  return rel;
}

export async function removeRelationship(relId: string, actor: string): Promise<boolean> {
  const data = await readCmdb();
  const rel = data.relationships.find((r) => r.id === relId);
  if (!rel) return false;

  const now = new Date().toISOString();
  const relType = data.relationshipTypes.find((t) => t.id === rel.typeId);
  for (const asset of data.assets) {
    if (asset.id === rel.sourceId || asset.id === rel.targetId) {
      if (!asset.history) asset.history = [];
      const target = asset.id === rel.sourceId ? rel.targetId : rel.sourceId;
      asset.history.push({ timestamp: now, user: actor, action: "relationship-removed", changes: [{ field: "relationship", oldValue: `${relType?.label || rel.typeId} → ${target}`, newValue: "" }] });
    }
  }

  data.relationships = data.relationships.filter((r) => r.id !== relId);
  await writeCmdb(data);
  return true;
}

// ── Relationship Type CRUD ──────────────────────────────────────────

export async function addRelationshipType(label: string, inverseLabel: string): Promise<RelationshipTypeDef> {
  const data = await readCmdb();
  const def: RelationshipTypeDef = { id: `rel-${randomUUID().slice(0, 8)}`, label, inverseLabel };
  data.relationshipTypes.push(def);
  await writeCmdb(data);
  return def;
}

export async function updateRelationshipType(id: string, updates: { label?: string; inverseLabel?: string }): Promise<RelationshipTypeDef | null> {
  const data = await readCmdb();
  const idx = data.relationshipTypes.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  if (updates.label !== undefined) data.relationshipTypes[idx].label = updates.label;
  if (updates.inverseLabel !== undefined) data.relationshipTypes[idx].inverseLabel = updates.inverseLabel;
  await writeCmdb(data);
  return data.relationshipTypes[idx];
}

export async function deleteRelationshipType(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readCmdb();
  const t = data.relationshipTypes.find((t) => t.id === id);
  if (!t) return { ok: false, error: "Not found" };
  if (t.builtIn) return { ok: false, error: "Cannot delete built-in type" };
  if (data.relationships.some((r) => r.typeId === id)) return { ok: false, error: "Relationship type is in use" };
  data.relationshipTypes = data.relationshipTypes.filter((t) => t.id !== id);
  await writeCmdb(data);
  return { ok: true };
}

// ── Agent Inventory Report ──────────────────────────────────────────

export interface AgentReport {
  hostname: string;
  os?: string;
  ipAddresses?: string[];
  hardwareInfo?: HardwareInfo;
  softwareInventory?: SoftwareItem[];
  collectedAt: string;
  agentId?: string;
  agentVersion?: string;
}

export async function processAgentReport(report: AgentReport, actor: string, defaultContainerId?: string): Promise<CmdbItem> {
  const data = await readCmdb();
  let asset = data.assets.find((a) => a.name.toLowerCase() === report.hostname.toLowerCase());
  const now = new Date().toISOString();

  if (!asset) {
    // Auto-create
    const num = data.nextNumber || 1;
    const isServer = report.os?.toLowerCase().includes("server") || report.os?.toLowerCase().includes("linux");
    asset = {
      id: `AST-${String(num).padStart(4, "0")}`,
      name: report.hostname,
      containerId: defaultContainerId || data.containers[0]?.id || "",
      status: "Active",
      type: isServer ? "Server" : "Desktop",
      typeId: isServer ? "type-server" : "type-desktop",
      ipAddresses: report.ipAddresses || [],
      os: report.os || "",
      location: "",
      owner: "",
      purchaseDate: "",
      warrantyExpiry: "",
      notes: "",
      customFields: {},
      tags: [],
      history: [{ timestamp: now, user: actor, action: "created", changes: [{ field: "source", oldValue: "", newValue: "agent-report" }] }],
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    data.assets.push(asset);
    data.nextNumber = num + 1;
  }

  // Update inventory fields
  if (report.os) asset.os = report.os;
  if (report.ipAddresses) asset.ipAddresses = report.ipAddresses;
  if (report.hardwareInfo) asset.hardwareInfo = report.hardwareInfo;
  if (report.softwareInventory) asset.softwareInventory = report.softwareInventory;
  asset.lastInventoryAt = report.collectedAt || now;
  if (report.agentId) asset.agentId = report.agentId;
  if (report.agentVersion) asset.agentVersion = report.agentVersion;
  asset.updatedAt = now;
  asset.updatedBy = actor;

  if (!asset.history) asset.history = [];
  asset.history.push({ timestamp: now, user: actor, action: "inventory-update", changes: [{ field: "lastInventoryAt", oldValue: "", newValue: asset.lastInventoryAt }] });
  if (asset.history.length > 500) asset.history = asset.history.slice(-500);

  await writeCmdb(data);
  return asset;
}

// ── Bulk Import ──────────────────────────────────────────────────────

export async function bulkCreateCmdbItems(
  rows: CreateCmdbItemFields[],
): Promise<{ created: number; errors: string[] }> {
  const data = await readCmdb();
  const errors: string[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) {
      errors.push(`Row ${i + 1}: name is required`);
      continue;
    }
    if (!row.containerId) {
      errors.push(`Row ${i + 1}: container is required`);
      continue;
    }
    // Check container exists
    if (!data.containers.some((c) => c.id === row.containerId)) {
      errors.push(`Row ${i + 1}: invalid container`);
      continue;
    }

    const num = data.nextNumber || 1;
    const id = `AST-${String(num).padStart(4, "0")}`;

    const bNow = new Date().toISOString();
    const asset: CmdbItem = {
      id,
      name: row.name.trim(),
      containerId: row.containerId,
      status: row.status && VALID_CMDB_STATUSES.includes(row.status) ? row.status : "Active",
      type: row.type?.trim() || "",
      typeId: row.typeId,
      ipAddresses: row.ipAddresses || [],
      os: row.os?.trim() || "",
      location: row.location?.trim() || "",
      owner: row.owner?.trim() || "",
      purchaseDate: row.purchaseDate || "",
      warrantyExpiry: row.warrantyExpiry || "",
      notes: row.notes?.trim() || "",
      customFields: row.customFields || {},
      tags: (row.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      history: [{ timestamp: bNow, user: row.createdBy, action: "created" as const, changes: [] }],
      createdAt: bNow,
      updatedAt: bNow,
      createdBy: row.createdBy,
      updatedBy: row.createdBy,
    };

    data.assets.push(asset);
    data.nextNumber = num + 1;
    created++;
  }

  await writeCmdb(data);
  return { created, errors };
}

// ── Lifecycle Workflow CRUD ──────────────────────────────────────────

export async function addLifecycleWorkflow(workflow: Omit<LifecycleWorkflow, "id">): Promise<LifecycleWorkflow> {
  const data = await readCmdb();
  const record: LifecycleWorkflow = { id: `workflow-${randomUUID().slice(0, 8)}`, ...workflow };
  data.lifecycleWorkflows.push(record);
  await writeCmdb(data);
  return record;
}

export async function updateLifecycleWorkflow(id: string, updates: Partial<Omit<LifecycleWorkflow, "id">>): Promise<LifecycleWorkflow | null> {
  const data = await readCmdb();
  const idx = data.lifecycleWorkflows.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  Object.assign(data.lifecycleWorkflows[idx], updates);
  await writeCmdb(data);
  return data.lifecycleWorkflows[idx];
}

export async function deleteLifecycleWorkflow(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readCmdb();
  const w = data.lifecycleWorkflows.find((w) => w.id === id);
  if (!w) return { ok: false, error: "Not found" };
  if (w.builtIn) return { ok: false, error: "Cannot delete built-in workflow" };
  if (data.assets.some((a) => a.workflowId === id)) return { ok: false, error: "Workflow is in use by assets" };
  data.lifecycleWorkflows = data.lifecycleWorkflows.filter((w) => w.id !== id);
  await writeCmdb(data);
  return { ok: true };
}

export async function transitionCmdbItemLifecycle(
  assetId: string,
  transitionId: string,
  actor: string,
): Promise<CmdbItem | null> {
  const data = await readCmdb();
  const idx = data.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return null;
  const asset = data.assets[idx];
  const workflow = data.lifecycleWorkflows.find((w) => w.id === asset.workflowId);
  if (!workflow) return null;
  const transition = workflow.transitions.find((t) => t.id === transitionId);
  if (!transition) return null;
  if (transition.fromStateId !== asset.lifecycleStateId) return null;
  const toState = workflow.states.find((s) => s.id === transition.toStateId);
  const fromState = workflow.states.find((s) => s.id === transition.fromStateId);
  if (!toState) return null;

  const now = new Date().toISOString();
  if (!asset.history) asset.history = [];
  asset.history.push({
    timestamp: now,
    user: actor,
    action: "lifecycle-transition",
    changes: [{ field: "lifecycleState", oldValue: fromState?.name || transition.fromStateId, newValue: toState.name }],
  });
  if (asset.history.length > 500) asset.history = asset.history.slice(-500);

  asset.lifecycleStateId = toState.id;
  // Keep legacy status in sync
  const reverseMap: Record<string, CmdbItemStatus> = { "lc-in-use": "Active", "lc-maintenance": "Maintenance", "lc-retired": "Decommissioned", "lc-procured": "Ordered" };
  if (reverseMap[toState.id]) asset.status = reverseMap[toState.id];
  asset.updatedAt = now;
  asset.updatedBy = actor;

  await writeCmdb(data);
  return asset;
}

// Re-export client-safe helpers from cmdb-shared.ts
export { getValidTransitions, getLifecycleStateName, getLifecycleStateColor, getLocationPath } from "./cmdb-shared";

// ── Location CRUD ───────────────────────────────────────────────────

export async function addLocation(name: string, type: LocationType, parentId: string | null): Promise<Location> {
  const data = await readCmdb();
  const siblings = data.locations.filter((l) => l.parentId === parentId);
  const loc: Location = {
    id: `loc-${randomUUID().slice(0, 8)}`,
    name: name.trim(),
    type,
    parentId,
    order: siblings.length,
  };
  data.locations.push(loc);
  await writeCmdb(data);
  return loc;
}

export async function updateLocation(id: string, updates: { name?: string; type?: LocationType; parentId?: string | null; order?: number }): Promise<Location | null> {
  const data = await readCmdb();
  const idx = data.locations.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  if (updates.parentId !== undefined) {
    if (updates.parentId === id) return null;
    if (updates.parentId && isLocationDescendant(data.locations, id, updates.parentId)) return null;
  }
  if (updates.name !== undefined) data.locations[idx].name = updates.name.trim();
  if (updates.type !== undefined) data.locations[idx].type = updates.type;
  if (updates.parentId !== undefined) data.locations[idx].parentId = updates.parentId;
  if (updates.order !== undefined) data.locations[idx].order = updates.order;
  await writeCmdb(data);
  return data.locations[idx];
}

export async function deleteLocation(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readCmdb();
  const hasChildren = data.locations.some((l) => l.parentId === id);
  if (hasChildren) return { ok: false, error: "Location has sub-locations. Remove them first." };
  const hasAssets = data.assets.some((a) => a.locationId === id);
  if (hasAssets) return { ok: false, error: "Location has assets. Move them first." };
  data.locations = data.locations.filter((l) => l.id !== id);
  await writeCmdb(data);
  return { ok: true };
}

function isLocationDescendant(locations: Location[], ancestorId: string, candidateId: string): boolean {
  let current = locations.find((l) => l.id === candidateId);
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? locations.find((l) => l.id === current!.parentId) : undefined;
  }
  return false;
}


// ── Business Service CRUD ───────────────────────────────────────────

export const VALID_SERVICE_CRITICALITIES: ServiceCriticality[] = ["critical", "high", "medium", "low"];
export const VALID_SERVICE_STATUSES: ServiceStatus[] = ["operational", "degraded", "outage", "planned"];

export async function addBusinessService(fields: {
  name: string; owner?: string; criticality?: ServiceCriticality; description?: string;
  status?: ServiceStatus; memberAssetIds?: string[]; createdBy: string;
}): Promise<BusinessService> {
  const data = await readCmdb();
  const num = data.nextServiceNumber || 1;
  const id = `SVC-${String(num).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const svc: BusinessService = {
    id,
    name: fields.name.trim(),
    owner: fields.owner?.trim() || "",
    criticality: fields.criticality || "medium",
    description: fields.description?.trim() || "",
    status: fields.status || "planned",
    memberAssetIds: fields.memberAssetIds || [],
    createdAt: now, updatedAt: now,
    createdBy: fields.createdBy, updatedBy: fields.createdBy,
  };
  data.businessServices.push(svc);
  data.nextServiceNumber = num + 1;
  await writeCmdb(data);
  return svc;
}

export async function updateBusinessService(id: string, fields: {
  name?: string; owner?: string; criticality?: ServiceCriticality; description?: string;
  status?: ServiceStatus; memberAssetIds?: string[]; updatedBy: string;
}): Promise<BusinessService | null> {
  const data = await readCmdb();
  const idx = data.businessServices.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const svc = data.businessServices[idx];
  if (fields.name !== undefined) svc.name = fields.name.trim();
  if (fields.owner !== undefined) svc.owner = fields.owner.trim();
  if (fields.criticality !== undefined) svc.criticality = fields.criticality;
  if (fields.description !== undefined) svc.description = fields.description.trim();
  if (fields.status !== undefined) svc.status = fields.status;
  if (fields.memberAssetIds !== undefined) svc.memberAssetIds = fields.memberAssetIds;
  svc.updatedAt = new Date().toISOString();
  svc.updatedBy = fields.updatedBy;
  await writeCmdb(data);
  return svc;
}

export async function deleteBusinessService(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.businessServices.length;
  data.businessServices = data.businessServices.filter((s) => s.id !== id);
  if (data.businessServices.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Impact Analysis ─────────────────────────────────────────────────

export function analyzeImpact(
  assetId: string,
  data: CmdbData,
  direction: "upstream" | "downstream" | "both",
  maxDepth: number = 10,
): ImpactResult {
  const root = data.assets.find((a) => a.id === assetId);
  const result: ImpactResult = {
    rootAssetId: assetId,
    rootAssetName: root?.name || assetId,
    direction,
    nodes: [],
    affectedServices: [],
  };
  if (!root) return result;

  const visited = new Set<string>([assetId]);
  const queue: { id: string; depth: number; parentId: string | null; label: string }[] = [];

  // Seed neighbours
  for (const rel of data.relationships) {
    const relType = data.relationshipTypes.find((t) => t.id === rel.typeId);
    if (rel.sourceId === assetId && (direction === "downstream" || direction === "both")) {
      queue.push({ id: rel.targetId, depth: 1, parentId: assetId, label: relType?.label || rel.typeId });
    }
    if (rel.targetId === assetId && (direction === "upstream" || direction === "both")) {
      queue.push({ id: rel.sourceId, depth: 1, parentId: assetId, label: relType?.inverseLabel || rel.typeId });
    }
  }

  // BFS
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.id) || item.depth > maxDepth) continue;
    visited.add(item.id);

    const asset = data.assets.find((a) => a.id === item.id);
    result.nodes.push({
      assetId: item.id,
      assetName: asset?.name || item.id,
      depth: item.depth,
      relationshipLabel: item.label,
      parentAssetId: item.parentId,
    });

    // Expand neighbours
    for (const rel of data.relationships) {
      const relType = data.relationshipTypes.find((t) => t.id === rel.typeId);
      if (rel.sourceId === item.id && (direction === "downstream" || direction === "both")) {
        queue.push({ id: rel.targetId, depth: item.depth + 1, parentId: item.id, label: relType?.label || rel.typeId });
      }
      if (rel.targetId === item.id && (direction === "upstream" || direction === "both")) {
        queue.push({ id: rel.sourceId, depth: item.depth + 1, parentId: item.id, label: relType?.inverseLabel || rel.typeId });
      }
    }
  }

  // Determine affected services
  const affectedAssetIds = new Set([assetId, ...result.nodes.map((n) => n.assetId)]);
  for (const svc of data.businessServices || []) {
    if (svc.memberAssetIds.some((id) => affectedAssetIds.has(id))) {
      result.affectedServices.push({ id: svc.id, name: svc.name, criticality: svc.criticality, status: svc.status });
    }
  }

  return result;
}

// ── Saved Views CRUD ─────────────────────────────────────────────────

export async function addSavedView(name: string, filters: SavedViewFilters, actor: string): Promise<SavedView> {
  const data = await readCmdb();
  const view: SavedView = { id: randomUUID(), name: name.trim(), filters, createdBy: actor, createdAt: new Date().toISOString() };
  data.savedViews.push(view);
  await writeCmdb(data);
  return view;
}

export async function deleteSavedView(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.savedViews.length;
  data.savedViews = data.savedViews.filter((v) => v.id !== id);
  if (data.savedViews.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── CI Templates CRUD ────────────────────────────────────────────────

export async function addTemplate(fields: Omit<CmdbTemplate, "id" | "createdAt">): Promise<CmdbTemplate> {
  const data = await readCmdb();
  const template: CmdbTemplate = { id: randomUUID(), ...fields, createdAt: new Date().toISOString() };
  data.templates.push(template);
  await writeCmdb(data);
  return template;
}

export async function updateTemplate(id: string, updates: Partial<Omit<CmdbTemplate, "id" | "createdAt" | "createdBy">>): Promise<CmdbTemplate | null> {
  const data = await readCmdb();
  const idx = data.templates.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  Object.assign(data.templates[idx], updates);
  await writeCmdb(data);
  return data.templates[idx];
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.templates.length;
  data.templates = data.templates.filter((t) => t.id !== id);
  if (data.templates.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Maintenance Window CRUD ──────────────────────────────────────────

export async function addMaintenanceWindow(fields: Omit<MaintenanceWindow, "id" | "createdAt">): Promise<MaintenanceWindow> {
  const data = await readCmdb();
  const mw: MaintenanceWindow = { id: randomUUID(), ...fields, createdAt: new Date().toISOString() };
  data.maintenanceWindows.push(mw);
  await writeCmdb(data);
  return mw;
}

export async function updateMaintenanceWindow(id: string, updates: Partial<Omit<MaintenanceWindow, "id" | "createdAt" | "createdBy">>): Promise<MaintenanceWindow | null> {
  const data = await readCmdb();
  const idx = data.maintenanceWindows.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  Object.assign(data.maintenanceWindows[idx], updates);
  await writeCmdb(data);
  return data.maintenanceWindows[idx];
}

export async function deleteMaintenanceWindow(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.maintenanceWindows.length;
  data.maintenanceWindows = data.maintenanceWindows.filter((m) => m.id !== id);
  if (data.maintenanceWindows.length === before) return false;
  await writeCmdb(data);
  return true;
}

export function getActiveMaintenanceWindows(data: CmdbData): MaintenanceWindow[] {
  const now = new Date().toISOString();
  return (data.maintenanceWindows || []).filter((mw) => mw.startTime <= now && mw.endTime >= now);
}

export function isInMaintenance(assetId: string, data: CmdbData): boolean {
  return getActiveMaintenanceWindows(data).some((mw) => mw.assetIds.includes(assetId));
}

// ── Bulk Operations ──────────────────────────────────────────────────

export async function bulkUpdateCmdbItems(
  ids: string[],
  updates: { status?: CmdbItemStatus; owner?: string; typeId?: string; containerId?: string; locationId?: string; addTags?: string[] },
  actor: string,
): Promise<number> {
  const data = await readCmdb();
  let count = 0;
  const now = new Date().toISOString();
  for (const asset of data.assets) {
    if (!ids.includes(asset.id)) continue;
    const changes: CmdbHistoryChange[] = [];
    if (updates.status !== undefined && updates.status !== asset.status) {
      changes.push({ field: "status", oldValue: asset.status, newValue: updates.status });
      asset.status = updates.status;
    }
    if (updates.owner !== undefined && updates.owner !== asset.owner) {
      changes.push({ field: "owner", oldValue: asset.owner, newValue: updates.owner });
      asset.owner = updates.owner;
    }
    if (updates.typeId !== undefined && updates.typeId !== asset.typeId) {
      changes.push({ field: "typeId", oldValue: asset.typeId || "", newValue: updates.typeId });
      asset.typeId = updates.typeId;
      const t = data.assetTypes.find((t) => t.id === updates.typeId);
      if (t) asset.type = t.name;
    }
    if (updates.containerId !== undefined && updates.containerId !== asset.containerId) {
      changes.push({ field: "containerId", oldValue: asset.containerId, newValue: updates.containerId });
      asset.containerId = updates.containerId;
    }
    if (updates.locationId !== undefined && updates.locationId !== asset.locationId) {
      changes.push({ field: "locationId", oldValue: asset.locationId || "", newValue: updates.locationId });
      asset.locationId = updates.locationId;
    }
    if (updates.addTags && updates.addTags.length > 0) {
      const newTags = updates.addTags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      const before = [...(asset.tags || [])];
      asset.tags = [...new Set([...before, ...newTags])];
      if (JSON.stringify(before) !== JSON.stringify(asset.tags)) {
        changes.push({ field: "tags", oldValue: before, newValue: asset.tags });
      }
    }
    if (changes.length > 0) {
      if (!asset.history) asset.history = [];
      asset.history.push({ timestamp: now, user: actor, action: "updated", changes });
      if (asset.history.length > 500) asset.history = asset.history.slice(-500);
      asset.updatedAt = now;
      asset.updatedBy = actor;
      count++;
    }
  }
  if (count > 0) await writeCmdb(data);
  return count;
}

export async function bulkDeleteCmdbItems(ids: string[]): Promise<number> {
  const data = await readCmdb();
  const before = data.assets.length;
  const idSet = new Set(ids);
  data.assets = data.assets.filter((a) => !idSet.has(a.id));
  data.relationships = data.relationships.filter((r) => !idSet.has(r.sourceId) && !idSet.has(r.targetId));
  const deleted = before - data.assets.length;
  if (deleted > 0) await writeCmdb(data);
  return deleted;
}

// ── Tag Helpers ──────────────────────────────────────────────────────

export function collectAllTags(assets: CmdbItem[]): string[] {
  const set = new Set<string>();
  for (const a of assets) for (const t of a.tags || []) set.add(t);
  return [...set].sort();
}

// ── Agent Helpers ────────────────────────────────────────────────────

export function getAgentStats(data: CmdbData): { total: number; withAgent: number; stale: number; coverage: number } {
  const total = data.assets.length;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let withAgent = 0;
  let stale = 0;
  for (const a of data.assets) {
    if (a.lastInventoryAt) {
      withAgent++;
      if (a.lastInventoryAt < sevenDaysAgo) stale++;
    }
  }
  return { total, withAgent, stale, coverage: total > 0 ? Math.round((withAgent / total) * 100) : 0 };
}

// ── Compliance Check Def CRUD ────────────────────────────────────────

export const DEFAULT_COMPLIANCE_CHECKS: ComplianceCheckDef[] = [
  { id: "cc-patched", label: "Patched", description: "OS and software patches are current" },
  { id: "cc-backup", label: "Backed up", description: "Regular backups configured and verified" },
  { id: "cc-documented", label: "Documented", description: "CI has up-to-date documentation" },
  { id: "cc-antivirus", label: "Antivirus", description: "Endpoint protection is active" },
  { id: "cc-monitored", label: "Monitored", description: "CI is included in monitoring" },
];

export async function addComplianceCheckDef(label: string, description?: string): Promise<ComplianceCheckDef> {
  const data = await readCmdb();
  const def: ComplianceCheckDef = { id: `cc-${randomUUID().slice(0, 8)}`, label: label.trim(), description };
  data.complianceCheckDefs.push(def);
  await writeCmdb(data);
  return def;
}

export async function deleteComplianceCheckDef(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.complianceCheckDefs.length;
  data.complianceCheckDefs = data.complianceCheckDefs.filter((d) => d.id !== id);
  if (data.complianceCheckDefs.length === before) return false;
  // Remove from all assets
  for (const a of data.assets) {
    if (a.complianceChecks) a.complianceChecks = a.complianceChecks.filter((c) => c.defId !== id);
  }
  await writeCmdb(data);
  return true;
}

export async function setComplianceCheck(assetId: string, defId: string, passed: boolean, actor: string, notes?: string): Promise<boolean> {
  const data = await readCmdb();
  const asset = data.assets.find((a) => a.id === assetId);
  if (!asset) return false;
  if (!asset.complianceChecks) asset.complianceChecks = [];
  const idx = asset.complianceChecks.findIndex((c) => c.defId === defId);
  const check: ComplianceCheck = { defId, passed, checkedAt: new Date().toISOString(), checkedBy: actor, notes };
  if (idx >= 0) asset.complianceChecks[idx] = check; else asset.complianceChecks.push(check);
  await writeCmdb(data);
  return true;
}

export function getComplianceScore(asset: CmdbItem, defs: ComplianceCheckDef[]): { score: number; total: number; percent: number } {
  const checks = asset.complianceChecks || [];
  const total = defs.length;
  const passed = defs.filter((d) => checks.find((c) => c.defId === d.id)?.passed).length;
  return { score: passed, total, percent: total > 0 ? Math.round((passed / total) * 100) : 0 };
}

export function getAggregateCompliance(assets: CmdbItem[], defs: ComplianceCheckDef[]): { avgScore: number; fullCompliance: number; nonCompliant: number } {
  if (assets.length === 0 || defs.length === 0) return { avgScore: 0, fullCompliance: 0, nonCompliant: 0 };
  let totalPercent = 0;
  let full = 0;
  let nonCompliant = 0;
  for (const a of assets) {
    const s = getComplianceScore(a, defs);
    totalPercent += s.percent;
    if (s.percent === 100) full++;
    if (s.percent < 50) nonCompliant++;
  }
  return { avgScore: Math.round(totalPercent / assets.length), fullCompliance: full, nonCompliant };
}

// ── Vulnerability CRUD ───────────────────────────────────────────────

export async function addVulnerability(fields: Omit<VulnerabilityEntry, "id" | "discoveredAt">): Promise<VulnerabilityEntry> {
  const data = await readCmdb();
  const vuln: VulnerabilityEntry = { id: randomUUID(), ...fields, discoveredAt: new Date().toISOString() };
  data.vulnerabilities.push(vuln);
  await writeCmdb(data);
  return vuln;
}

export async function updateVulnerability(id: string, updates: Partial<Omit<VulnerabilityEntry, "id" | "discoveredAt" | "createdBy">>): Promise<VulnerabilityEntry | null> {
  const data = await readCmdb();
  const idx = data.vulnerabilities.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  Object.assign(data.vulnerabilities[idx], updates);
  if (updates.status === "resolved" && !data.vulnerabilities[idx].resolvedAt) {
    data.vulnerabilities[idx].resolvedAt = new Date().toISOString();
  }
  await writeCmdb(data);
  return data.vulnerabilities[idx];
}

export async function deleteVulnerability(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.vulnerabilities.length;
  data.vulnerabilities = data.vulnerabilities.filter((v) => v.id !== id);
  if (data.vulnerabilities.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Change Request CRUD ──────────────────────────────────────────────

export async function addChangeRequest(fields: Omit<ChangeRequest, "id" | "createdAt" | "updatedAt">): Promise<ChangeRequest> {
  const data = await readCmdb();
  const num = data.nextCrNumber || 1;
  const cr: ChangeRequest = {
    id: `RFC-${String(num).padStart(4, "0")}`,
    ...fields,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.changeRequests.push(cr);
  data.nextCrNumber = num + 1;
  await writeCmdb(data);
  return cr;
}

export async function updateChangeRequest(id: string, updates: Partial<Omit<ChangeRequest, "id" | "createdAt" | "createdBy">>): Promise<ChangeRequest | null> {
  const data = await readCmdb();
  const idx = data.changeRequests.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  Object.assign(data.changeRequests[idx], updates, { updatedAt: new Date().toISOString() });
  await writeCmdb(data);
  return data.changeRequests[idx];
}

export async function deleteChangeRequest(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.changeRequests.length;
  data.changeRequests = data.changeRequests.filter((c) => c.id !== id);
  if (data.changeRequests.length === before) return false;
  await writeCmdb(data);
  return true;
}

// ── Service SLA CRUD ─────────────────────────────────────────────────

export async function setServiceSla(serviceId: string, uptimeTarget: number, responseTimeTarget?: number): Promise<ServiceSla> {
  const data = await readCmdb();
  let sla = data.serviceSlas.find((s) => s.serviceId === serviceId);
  if (!sla) {
    sla = { serviceId, uptimeTarget, responseTimeTarget, breaches: [] };
    data.serviceSlas.push(sla);
  } else {
    sla.uptimeTarget = uptimeTarget;
    sla.responseTimeTarget = responseTimeTarget;
  }
  await writeCmdb(data);
  return sla;
}

export async function addSlaBreach(serviceId: string, duration: number, description: string): Promise<SlaBreach | null> {
  const data = await readCmdb();
  const sla = data.serviceSlas.find((s) => s.serviceId === serviceId);
  if (!sla) return null;
  const breach: SlaBreach = { id: randomUUID(), timestamp: new Date().toISOString(), duration, description, resolved: false };
  sla.breaches.push(breach);
  await writeCmdb(data);
  return breach;
}

export async function resolveSlaBreach(serviceId: string, breachId: string): Promise<boolean> {
  const data = await readCmdb();
  const sla = data.serviceSlas.find((s) => s.serviceId === serviceId);
  if (!sla) return false;
  const breach = sla.breaches.find((b) => b.id === breachId);
  if (!breach) return false;
  breach.resolved = true;
  await writeCmdb(data);
  return true;
}

// ── Cost / TCO Helpers ────────────────────────────────────────────────

export function getCostSummary(assets: CmdbItem[]): { totalPurchase: number; totalMonthly: number; totalAnnual: number; currency: string } {
  let totalPurchase = 0;
  let totalMonthly = 0;
  for (const a of assets) {
    if (a.costInfo) {
      totalPurchase += a.costInfo.purchaseCost;
      totalMonthly += a.costInfo.monthlyCost;
    }
  }
  return { totalPurchase, totalMonthly, totalAnnual: totalMonthly * 12, currency: "EUR" };
}

export function getDepreciatedValue(asset: CmdbItem): number | null {
  if (!asset.costInfo || !asset.costInfo.depreciationYears || asset.costInfo.depreciationYears <= 0) return null;
  if (!asset.purchaseDate) return asset.costInfo.purchaseCost;
  const purchaseMs = new Date(asset.purchaseDate).getTime();
  const now = Date.now();
  const yearsElapsed = (now - purchaseMs) / (365.25 * 86400000);
  const remaining = Math.max(0, 1 - yearsElapsed / asset.costInfo.depreciationYears);
  return Math.round(asset.costInfo.purchaseCost * remaining * 100) / 100;
}

// ── Duplicate Detection ──────────────────────────────────────────────

export interface DuplicateGroup {
  field: string;         // "hostname", "ip", "serial"
  value: string;
  assetIds: string[];
  assetNames: string[];
}

export function detectDuplicates(assets: CmdbItem[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  // By hostname
  const byName = new Map<string, CmdbItem[]>();
  for (const a of assets) {
    const key = a.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(a);
  }
  for (const [name, items] of byName) {
    if (items.length > 1) groups.push({ field: "hostname", value: name, assetIds: items.map((a) => a.id), assetNames: items.map((a) => a.name) });
  }
  // By IP
  const byIp = new Map<string, CmdbItem[]>();
  for (const a of assets) {
    for (const ip of a.ipAddresses) {
      if (!ip || ip === "0.0.0.0") continue;
      if (!byIp.has(ip)) byIp.set(ip, []);
      byIp.get(ip)!.push(a);
    }
  }
  for (const [ip, items] of byIp) {
    if (items.length > 1) groups.push({ field: "ip", value: ip, assetIds: items.map((a) => a.id), assetNames: items.map((a) => a.name) });
  }
  return groups;
}

// ── Data Quality Scoring ─────────────────────────────────────────────

export interface DataQualityScore {
  assetId: string;
  assetName: string;
  score: number;         // 0-100
  missing: string[];     // list of missing fields
}

export function scoreDataQuality(asset: CmdbItem): DataQualityScore {
  const checks: [string, boolean][] = [
    ["owner", !!asset.owner.trim()],
    ["type", !!asset.typeId],
    ["location", !!(asset.locationId || asset.location.trim())],
    ["IP address", asset.ipAddresses.length > 0],
    ["OS", !!asset.os.trim()],
    ["purchase date", !!asset.purchaseDate],
    ["warranty expiry", !!asset.warrantyExpiry],
    ["tags", (asset.tags || []).length > 0],
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  const missing = checks.filter(([, ok]) => !ok).map(([field]) => field);
  return { assetId: asset.id, assetName: asset.name, score: Math.round((passed / checks.length) * 100), missing };
}

export function getAggregateDataQuality(assets: CmdbItem[]): { avgScore: number; perfect: number; poor: number } {
  if (assets.length === 0) return { avgScore: 0, perfect: 0, poor: 0 };
  let totalScore = 0;
  let perfect = 0;
  let poor = 0;
  for (const a of assets) {
    const s = scoreDataQuality(a);
    totalScore += s.score;
    if (s.score === 100) perfect++;
    if (s.score < 50) poor++;
  }
  return { avgScore: Math.round(totalScore / assets.length), perfect, poor };
}

// ── Expiry Alerts ────────────────────────────────────────────────────

export interface ExpiryAlert {
  type: "warranty" | "license" | "contract";
  itemId: string;
  itemName: string;
  expiryDate: string;
  daysRemaining: number;
}

export function getExpiryAlerts(data: CmdbData): ExpiryAlert[] {
  const alerts: ExpiryAlert[] = [];
  const today = new Date();
  const ninetyDays = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // Warranty expiry
  for (const a of data.assets) {
    if (a.warrantyExpiry && a.warrantyExpiry >= todayStr && a.warrantyExpiry <= ninetyDays) {
      const days = Math.ceil((new Date(a.warrantyExpiry).getTime() - today.getTime()) / 86400000);
      alerts.push({ type: "warranty", itemId: a.id, itemName: a.name, expiryDate: a.warrantyExpiry, daysRemaining: days });
    }
  }
  // License expiry
  for (const l of data.licenses) {
    if (l.expiryDate && l.expiryDate >= todayStr && l.expiryDate <= ninetyDays) {
      const days = Math.ceil((new Date(l.expiryDate).getTime() - today.getTime()) / 86400000);
      alerts.push({ type: "license", itemId: l.id, itemName: l.name, expiryDate: l.expiryDate, daysRemaining: days });
    }
  }
  // Contract renewal (from costInfo)
  for (const a of data.assets) {
    if (a.costInfo?.renewalDate && a.costInfo.renewalDate >= todayStr && a.costInfo.renewalDate <= ninetyDays) {
      const days = Math.ceil((new Date(a.costInfo.renewalDate).getTime() - today.getTime()) / 86400000);
      alerts.push({ type: "contract", itemId: a.id, itemName: a.name, expiryDate: a.costInfo.renewalDate, daysRemaining: days });
    }
  }
  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ── Bulk CSV Update ─────────────────────────────────────────────────

export async function bulkUpsertCmdbItems(
  rows: CreateCmdbItemFields[],
): Promise<{ created: number; updated: number; errors: string[] }> {
  const data = await readCmdb();
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) { errors.push(`Row ${i + 1}: name required`); continue; }
    if (!row.containerId) { errors.push(`Row ${i + 1}: container required`); continue; }

    // Try to match existing CI by name or IP
    const existing = data.assets.find((a) =>
      a.name.toLowerCase() === row.name.trim().toLowerCase() ||
      (row.ipAddresses && row.ipAddresses.length > 0 && row.ipAddresses.some((ip) => a.ipAddresses.includes(ip)))
    );

    if (existing) {
      // Update existing
      if (row.os) existing.os = row.os.trim();
      if (row.owner) existing.owner = row.owner.trim();
      if (row.location) existing.location = row.location.trim();
      if (row.ipAddresses) existing.ipAddresses = row.ipAddresses;
      if (row.typeId) existing.typeId = row.typeId;
      if (row.status) existing.status = row.status;
      if (row.tags) existing.tags = [...new Set([...existing.tags, ...row.tags])];
      existing.updatedAt = now;
      existing.updatedBy = row.createdBy;
      updated++;
    } else {
      // Create new
      const num = data.nextNumber || 1;
      const asset: CmdbItem = {
        id: `AST-${String(num).padStart(4, "0")}`,
        name: row.name.trim(), containerId: row.containerId,
        status: row.status || "Active", type: row.type?.trim() || "", typeId: row.typeId,
        ipAddresses: row.ipAddresses || [], os: row.os?.trim() || "",
        location: row.location?.trim() || "", owner: row.owner?.trim() || "",
        purchaseDate: row.purchaseDate || "", warrantyExpiry: row.warrantyExpiry || "",
        notes: row.notes?.trim() || "", customFields: row.customFields || {},
        tags: (row.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        history: [{ timestamp: now, user: row.createdBy, action: "created" as const, changes: [] }],
        createdAt: now, updatedAt: now, createdBy: row.createdBy, updatedBy: row.createdBy,
      };
      data.assets.push(asset);
      data.nextNumber = num + 1;
      created++;
    }
  }

  await writeCmdb(data);
  return { created, updated, errors };
}

// ── CMDB Report ────────────────────────────────────────────────────

export function generateReportHtml(data: CmdbData): string {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const newCIs = data.assets.filter((a) => a.createdAt >= sevenDaysAgo);
  const alerts = getExpiryAlerts(data);
  const dq = getAggregateDataQuality(data.assets);
  const compliance = getAggregateCompliance(data.assets, data.complianceCheckDefs.length > 0 ? data.complianceCheckDefs : DEFAULT_COMPLIANCE_CHECKS);
  const openVulns = data.vulnerabilities.filter((v) => v.status === "open");
  const openCRs = data.changeRequests.filter((c) => c.status !== "implemented" && c.status !== "rolled-back");

  return `
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#6366f1">CMDB Report — ${today}</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Total CIs</strong></td><td>${data.assets.length}</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>New this week</strong></td><td>${newCIs.length}</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Data quality</strong></td><td>${dq.avgScore}% avg (${dq.poor} incomplete)</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Compliance</strong></td><td>${compliance.avgScore}% avg (${compliance.nonCompliant} non-compliant)</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Open vulnerabilities</strong></td><td>${openVulns.length}</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Active change requests</strong></td><td>${openCRs.length}</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Expiry alerts (90d)</strong></td><td>${alerts.length}</td></tr>
<tr><td style="padding:6px;border-bottom:1px solid #eee"><strong>Recycle bin</strong></td><td>${data.recycleBin.length} items</td></tr>
</table>
${alerts.length > 0 ? `<h3 style="margin-top:20px">Upcoming Expiries</h3><ul style="font-size:13px">${alerts.slice(0, 10).map((a) => `<li><strong>${a.itemName}</strong> — ${a.type} expires ${a.expiryDate} (${a.daysRemaining}d)</li>`).join("")}</ul>` : ""}
${openVulns.length > 0 ? `<h3>Open Vulnerabilities</h3><ul style="font-size:13px">${openVulns.slice(0, 5).map((v) => `<li>${v.cveId ? v.cveId + " " : ""}${v.title} (${v.severity})</li>`).join("")}</ul>` : ""}
<p style="font-size:11px;color:#999;margin-top:30px">Generated by Doc-it CMDB</p>
</body></html>`;
}

export async function updateReportSettings(settings: Partial<CmdbReportSettings>): Promise<CmdbReportSettings> {
  const data = await readCmdb();
  Object.assign(data.reportSettings, settings);
  await writeCmdb(data);
  return data.reportSettings;
}
