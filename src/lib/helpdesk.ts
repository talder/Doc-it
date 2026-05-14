/**
 * Helpdesk module — ticketing system with groups, SLA, custom fields,
 * rule engine, form designer, and portal page designer.
 *
 * Config stored at config/helpdesk.json.
 * Tickets stored at config/helpdesk-tickets.json (separate for perf).
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { sendMail } from "./email";
import { getUsers } from "./auth";
import { readNotifications, writeNotifications } from "./notifications";
import type { AppNotification } from "./notifications";

// ══════════════════════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────

export type TicketStatus = "Open" | "In Progress" | "Waiting" | "Pending Approval" | "Resolved" | "Closed";
export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export type TicketType = "incident" | "service_request" | "problem";
export type HdFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "textarea" | "url" | "email";
export type RuleMatchType = "all" | "any";
export type RuleConditionOp = "equals" | "not_equals" | "contains" | "not_contains" | "in" | "not_in" | "gt" | "lt";
export type RuleActionType = "assign_group" | "assign_person" | "set_priority" | "set_status" | "send_notification" | "add_tag" | "require_approval";
export type WidgetType = "hero" | "ticket_form" | "my_tickets" | "announcements" | "faq" | "categories" | "search" | "custom_html" | "quick_links" | "service_catalog";
export type TicketLinkRelation = "parent" | "child" | "related" | "duplicate";

export const VALID_STATUSES: TicketStatus[] = ["Open", "In Progress", "Waiting", "Pending Approval", "Resolved", "Closed"];
export const VALID_PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
export const VALID_FIELD_TYPES: HdFieldType[] = ["text", "number", "date", "boolean", "select", "multiselect", "textarea", "url", "email"];
export const VALID_TICKET_TYPES: TicketType[] = ["incident", "service_request", "problem"];

// ── Groups ───────────────────────────────────────────────────────────

export interface HdGroup {
  id: string;
  name: string;
  description: string;
  members: string[];
  email?: string;
  createdAt: string;
}

// ── Categories ───────────────────────────────────────────────────────

export interface HdCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  parentId?: string | null;
  order: number;
}

// ── Custom Field Definitions ─────────────────────────────────────────

export interface HdFieldDef {
  id: string;
  name: string;
  type: HdFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  order: number;
}

// ── Forms ────────────────────────────────────────────────────────────

export interface HdFormField {
  id: string;
  fieldDefId?: string;
  standardField?: "subject" | "description" | "priority" | "category" | "asset";
  label: string;
  required: boolean;
  order: number;
  width: "full" | "half";
  helpText?: string;
}

export interface HdForm {
  id: string;
  name: string;
  description: string;
  fields: HdFormField[];
  isDefault: boolean;
  categoryFilter?: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Rules ────────────────────────────────────────────────────────────

export interface RuleCondition {
  field: string;
  operator: RuleConditionOp;
  value: string | string[];
}

export interface RuleAction {
  type: RuleActionType;
  value: string;
}

export interface HdRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: RuleMatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  order: number;
  stopOnMatch: boolean;
  createdAt: string;
}

// ── SLA ──────────────────────────────────────────────────────────────

export interface SlaPriorityConfig {
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
}

export interface SlaBusinessHours {
  start: string;   // "09:00"
  end: string;     // "17:00"
  days: number[];  // 0=Sun, 1=Mon, ...6=Sat
}

export interface SlaPolicy {
  id: string;
  name: string;
  isDefault: boolean;
  priorities: SlaPriorityConfig[];
  businessHours?: SlaBusinessHours;
  createdAt: string;
}

// ── Approvals ────────────────────────────────────────────────────────

export interface TicketApproval {
  id: string;
  approver: string;
  level: number;
  decision: "Pending" | "Approved" | "Rejected";
  comment?: string;
  decidedAt?: string;
}

// ── Ticket Links ─────────────────────────────────────────────────────

export interface TicketLink {
  ticketId: string;
  relation: TicketLinkRelation;
}

// ── Work Logs ────────────────────────────────────────────────────────

export interface WorkLogEntry {
  id: string;
  agent: string;
  startTime: string;
  durationMinutes: number;
  notes: string;
  billable: boolean;
}

// ── Ticket History (audit trail) ─────────────────────────────────────

export interface TicketHistoryEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

// ── Service Catalog ──────────────────────────────────────────────────

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string;
  icon?: string;
  categoryId?: string;
  formId?: string;
  defaultGroupId?: string;
  defaultAssignee?: string;
  defaultPriority?: TicketPriority;
  slaOverridePolicyId?: string;
  approvalRequired: boolean;
  approvers: string[];
  cost?: number;
  estimatedDays?: number;
  published: boolean;
  order: number;
}

// ── Canned Responses ─────────────────────────────────────────────────

export interface ReplyTemplate {
  id: string;
  name: string;
  content: string;
  category?: string;
}

// ── Escalation Rules ─────────────────────────────────────────────────

export type EscalationTrigger =
  | "sla_response_warning" | "sla_response_breach"
  | "sla_resolution_warning" | "sla_resolution_breach";

export interface EscalationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: EscalationTrigger;
  warningMinutesBefore: number;
  actions: RuleAction[];
  order: number;
}

// ── Requester Organizations ──────────────────────────────────────────

export interface HelpdeskOrg {
  id: string;
  name: string;
  domain: string;
  defaultSlaId?: string;
  defaultGroupId?: string;
}

// ── Recurring Tickets ────────────────────────────────────────────────

export interface RecurringTicketDef {
  id: string;
  template: Omit<CreateTicketFields, "requester" | "requesterType">;
  cron: string;
  enabled: boolean;
  lastRun?: string;
}

// ── Notification Templates ───────────────────────────────────────────

export type HdNotificationEvent =
  | "ticket_created" | "ticket_assigned" | "status_changed"
  | "comment_added" | "sla_warning" | "sla_breached"
  | "escalated" | "approval_requested" | "approval_decided";

export interface HdNotificationTemplate {
  event: HdNotificationEvent;
  subject: string;
  htmlBody: string;
  enabled: boolean;
}

// ── Portal Page Designer ─────────────────────────────────────────────

export interface PageWidget {
  id: string;
  type: WidgetType;
  config: Record<string, unknown>;
  order: number;
  width: "full" | "half" | "third";
}

export interface HdPortalPage {
  id: string;
  name: string;
  slug: string;
  isHomePage: boolean;
  published: boolean;
  widgets: PageWidget[];
  theme?: { primaryColor?: string; logoUrl?: string; headerHtml?: string };
  createdAt: string;
  updatedAt: string;
}

// ── Tickets ──────────────────────────────────────────────────────────

export interface TicketAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface TicketComment {
  id: string;
  author: string;
  authorType: "agent" | "portal";
  content: string;
  isInternal: boolean;
  attachments: TicketAttachment[];
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketType: TicketType;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assignedGroup?: string;
  assignedTo?: string;
  requester: string;
  requesterEmail?: string;
  requesterType: "agent" | "portal";
  assetId?: string;
  affectedAssetIds: string[];
  formId?: string;
  relatedChangeId?: string;
  customFields: Record<string, string | number | boolean | string[]>;
  tags: string[];
  attachments: TicketAttachment[];
  comments: TicketComment[];
  approvals: TicketApproval[];
  linkedTickets: TicketLink[];
  workLogs: WorkLogEntry[];
  history: TicketHistoryEntry[];
  // Problem-specific fields
  rootCause?: string;
  workaround?: string;
  slaResponseDue?: string;
  slaResolutionDue?: string;
  slaResponseMet?: boolean;
  slaResolutionMet?: boolean;
  csatRating?: number;
  csatComment?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

// ── Data Wrappers ────────────────────────────────────────────────────

export interface HelpdeskConfig {
  groups: HdGroup[];
  categories: HdCategory[];
  fieldDefs: HdFieldDef[];
  forms: HdForm[];
  rules: HdRule[];
  slaPolicies: SlaPolicy[];
  portalPages: HdPortalPage[];
  catalogItems: ServiceCatalogItem[];
  replyTemplates: ReplyTemplate[];
  escalationRules: EscalationRule[];
  organizations: HelpdeskOrg[];
  recurringTickets: RecurringTicketDef[];
  notificationTemplates: HdNotificationTemplate[];
  /** IMAP config for email-to-ticket */
  imapConfig?: {
    host: string;
    port: number;
    tls: boolean;
    user: string;
    passEncrypted: string;
    folder: string;
    pollIntervalSec: number;
    enabled: boolean;
  };
  /** Webhook secret for inbound ticket creation */
  webhookSecret?: string;
  /** Space slug used for KB article suggestions & "Convert to Article" */
  kbSpaceSlug?: string;
}

export interface HelpdeskTicketData {
  nextNumber: number;
  tickets: Ticket[];
}

// ══════════════════════════════════════════════════════════════════════
//  Storage
// ══════════════════════════════════════════════════════════════════════

const CONFIG_FILE = "helpdesk.json";
const TICKETS_FILE = "helpdesk-tickets.json";

const EMPTY_CONFIG: HelpdeskConfig = {
  groups: [], categories: [], fieldDefs: [], forms: [], rules: [], slaPolicies: [], portalPages: [],
  catalogItems: [], replyTemplates: [], escalationRules: [], organizations: [],
  recurringTickets: [], notificationTemplates: [],
};
const EMPTY_TICKETS: HelpdeskTicketData = { nextNumber: 1, tickets: [] };

export async function readConfig(): Promise<HelpdeskConfig> {
  return readJsonConfig<HelpdeskConfig>(CONFIG_FILE, { ...EMPTY_CONFIG });
}
async function writeConfig(data: HelpdeskConfig): Promise<void> {
  await writeJsonConfig(CONFIG_FILE, data);
}

export async function readTickets(): Promise<HelpdeskTicketData> {
  return readJsonConfig<HelpdeskTicketData>(TICKETS_FILE, { ...EMPTY_TICKETS });
}
async function writeTickets(data: HelpdeskTicketData): Promise<void> {
  await writeJsonConfig(TICKETS_FILE, data);
}

// ══════════════════════════════════════════════════════════════════════
//  Group CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addGroup(name: string, description: string, members: string[], email?: string): Promise<HdGroup> {
  const cfg = await readConfig();
  const group: HdGroup = { id: randomUUID(), name: name.trim(), description: description.trim(), members, email: email?.trim() || undefined, createdAt: new Date().toISOString() };
  cfg.groups.push(group);
  await writeConfig(cfg);
  return group;
}

export async function updateGroup(id: string, updates: Partial<Omit<HdGroup, "id" | "createdAt">>): Promise<HdGroup | null> {
  const cfg = await readConfig();
  const idx = cfg.groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) cfg.groups[idx].name = updates.name.trim();
  if (updates.description !== undefined) cfg.groups[idx].description = updates.description.trim();
  if (updates.members !== undefined) cfg.groups[idx].members = updates.members;
  if (updates.email !== undefined) cfg.groups[idx].email = updates.email?.trim() || undefined;
  await writeConfig(cfg);
  return cfg.groups[idx];
}

export async function deleteGroup(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.groups.length;
  cfg.groups = cfg.groups.filter((g) => g.id !== id);
  if (cfg.groups.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Category CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addCategory(name: string, description: string, icon?: string): Promise<HdCategory> {
  const cfg = await readConfig();
  const cat: HdCategory = { id: randomUUID(), name: name.trim(), description: description.trim(), icon, order: cfg.categories.length };
  cfg.categories.push(cat);
  await writeConfig(cfg);
  return cat;
}

export async function updateCategory(id: string, updates: Partial<Omit<HdCategory, "id">>): Promise<HdCategory | null> {
  const cfg = await readConfig();
  const idx = cfg.categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) cfg.categories[idx].name = updates.name.trim();
  if (updates.description !== undefined) cfg.categories[idx].description = updates.description.trim();
  if (updates.icon !== undefined) cfg.categories[idx].icon = updates.icon;
  if (updates.order !== undefined) cfg.categories[idx].order = updates.order;
  await writeConfig(cfg);
  return cfg.categories[idx];
}

export async function deleteCategory(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.categories.length;
  cfg.categories = cfg.categories.filter((c) => c.id !== id);
  if (cfg.categories.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Field Definition CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addFieldDef(fields: Omit<HdFieldDef, "id">): Promise<HdFieldDef> {
  const cfg = await readConfig();
  const def: HdFieldDef = { id: randomUUID(), ...fields, name: fields.name.trim() };
  cfg.fieldDefs.push(def);
  await writeConfig(cfg);
  return def;
}

export async function updateFieldDef(id: string, updates: Partial<Omit<HdFieldDef, "id">>): Promise<HdFieldDef | null> {
  const cfg = await readConfig();
  const idx = cfg.fieldDefs.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.fieldDefs[idx], updates);
  if (updates.name) cfg.fieldDefs[idx].name = updates.name.trim();
  await writeConfig(cfg);
  return cfg.fieldDefs[idx];
}

export async function deleteFieldDef(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.fieldDefs.length;
  cfg.fieldDefs = cfg.fieldDefs.filter((d) => d.id !== id);
  if (cfg.fieldDefs.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Form CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addForm(form: Omit<HdForm, "id" | "createdAt" | "updatedAt">): Promise<HdForm> {
  const cfg = await readConfig();
  const now = new Date().toISOString();
  const newForm: HdForm = { id: randomUUID(), ...form, createdAt: now, updatedAt: now };
  if (newForm.isDefault) cfg.forms.forEach((f) => (f.isDefault = false));
  cfg.forms.push(newForm);
  await writeConfig(cfg);
  return newForm;
}

export async function updateForm(id: string, updates: Partial<Omit<HdForm, "id" | "createdAt">>): Promise<HdForm | null> {
  const cfg = await readConfig();
  const idx = cfg.forms.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  if (updates.isDefault) cfg.forms.forEach((f) => (f.isDefault = false));
  Object.assign(cfg.forms[idx], updates, { updatedAt: new Date().toISOString() });
  await writeConfig(cfg);
  return cfg.forms[idx];
}

export async function deleteForm(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.forms.length;
  cfg.forms = cfg.forms.filter((f) => f.id !== id);
  if (cfg.forms.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Rule CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addRule(rule: Omit<HdRule, "id" | "createdAt">): Promise<HdRule> {
  const cfg = await readConfig();
  const newRule: HdRule = { id: randomUUID(), ...rule, createdAt: new Date().toISOString() };
  cfg.rules.push(newRule);
  cfg.rules.sort((a, b) => a.order - b.order);
  await writeConfig(cfg);
  return newRule;
}

export async function updateRule(id: string, updates: Partial<Omit<HdRule, "id" | "createdAt">>): Promise<HdRule | null> {
  const cfg = await readConfig();
  const idx = cfg.rules.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.rules[idx], updates);
  cfg.rules.sort((a, b) => a.order - b.order);
  await writeConfig(cfg);
  return cfg.rules[idx];
}

export async function deleteRule(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.rules.length;
  cfg.rules = cfg.rules.filter((r) => r.id !== id);
  if (cfg.rules.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  SLA Policy CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addSlaPolicy(policy: Omit<SlaPolicy, "id" | "createdAt">): Promise<SlaPolicy> {
  const cfg = await readConfig();
  const newPolicy: SlaPolicy = { id: randomUUID(), ...policy, createdAt: new Date().toISOString() };
  if (newPolicy.isDefault) cfg.slaPolicies.forEach((p) => (p.isDefault = false));
  cfg.slaPolicies.push(newPolicy);
  await writeConfig(cfg);
  return newPolicy;
}

export async function updateSlaPolicy(id: string, updates: Partial<Omit<SlaPolicy, "id" | "createdAt">>): Promise<SlaPolicy | null> {
  const cfg = await readConfig();
  const idx = cfg.slaPolicies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  if (updates.isDefault) cfg.slaPolicies.forEach((p) => (p.isDefault = false));
  Object.assign(cfg.slaPolicies[idx], updates);
  await writeConfig(cfg);
  return cfg.slaPolicies[idx];
}

export async function deleteSlaPolicy(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.slaPolicies.length;
  cfg.slaPolicies = cfg.slaPolicies.filter((p) => p.id !== id);
  if (cfg.slaPolicies.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Portal Page CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addPortalPage(page: Omit<HdPortalPage, "id" | "createdAt" | "updatedAt">): Promise<HdPortalPage> {
  const cfg = await readConfig();
  const now = new Date().toISOString();
  const newPage: HdPortalPage = { id: randomUUID(), ...page, published: page.published ?? false, createdAt: now, updatedAt: now };
  if (newPage.isHomePage) cfg.portalPages.forEach((p) => (p.isHomePage = false));
  cfg.portalPages.push(newPage);
  await writeConfig(cfg);
  return newPage;
}

export async function updatePortalPage(id: string, updates: Partial<Omit<HdPortalPage, "id" | "createdAt">>): Promise<HdPortalPage | null> {
  const cfg = await readConfig();
  const idx = cfg.portalPages.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  if (updates.isHomePage) cfg.portalPages.forEach((p) => (p.isHomePage = false));
  Object.assign(cfg.portalPages[idx], updates, { updatedAt: new Date().toISOString() });
  await writeConfig(cfg);
  return cfg.portalPages[idx];
}

export async function deletePortalPage(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = cfg.portalPages.length;
  cfg.portalPages = cfg.portalPages.filter((p) => p.id !== id);
  if (cfg.portalPages.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Service Catalog CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addCatalogItem(item: Omit<ServiceCatalogItem, "id">): Promise<ServiceCatalogItem> {
  const cfg = await readConfig();
  const newItem: ServiceCatalogItem = { id: randomUUID(), ...item };
  if (!cfg.catalogItems) cfg.catalogItems = [];
  cfg.catalogItems.push(newItem);
  await writeConfig(cfg);
  return newItem;
}

export async function updateCatalogItem(id: string, updates: Partial<Omit<ServiceCatalogItem, "id">>): Promise<ServiceCatalogItem | null> {
  const cfg = await readConfig();
  const idx = (cfg.catalogItems ?? []).findIndex((c) => c.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.catalogItems[idx], updates);
  await writeConfig(cfg);
  return cfg.catalogItems[idx];
}

export async function deleteCatalogItem(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = (cfg.catalogItems ?? []).length;
  cfg.catalogItems = (cfg.catalogItems ?? []).filter((c) => c.id !== id);
  if (cfg.catalogItems.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Reply Template CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addReplyTemplate(tpl: Omit<ReplyTemplate, "id">): Promise<ReplyTemplate> {
  const cfg = await readConfig();
  const newTpl: ReplyTemplate = { id: randomUUID(), ...tpl };
  if (!cfg.replyTemplates) cfg.replyTemplates = [];
  cfg.replyTemplates.push(newTpl);
  await writeConfig(cfg);
  return newTpl;
}

export async function updateReplyTemplate(id: string, updates: Partial<Omit<ReplyTemplate, "id">>): Promise<ReplyTemplate | null> {
  const cfg = await readConfig();
  const idx = (cfg.replyTemplates ?? []).findIndex((t) => t.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.replyTemplates[idx], updates);
  await writeConfig(cfg);
  return cfg.replyTemplates[idx];
}

export async function deleteReplyTemplate(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = (cfg.replyTemplates ?? []).length;
  cfg.replyTemplates = (cfg.replyTemplates ?? []).filter((t) => t.id !== id);
  if (cfg.replyTemplates.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Escalation Rule CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addEscalationRule(rule: Omit<EscalationRule, "id">): Promise<EscalationRule> {
  const cfg = await readConfig();
  const newRule: EscalationRule = { id: randomUUID(), ...rule };
  if (!cfg.escalationRules) cfg.escalationRules = [];
  cfg.escalationRules.push(newRule);
  cfg.escalationRules.sort((a, b) => a.order - b.order);
  await writeConfig(cfg);
  return newRule;
}

export async function updateEscalationRule(id: string, updates: Partial<Omit<EscalationRule, "id">>): Promise<EscalationRule | null> {
  const cfg = await readConfig();
  const idx = (cfg.escalationRules ?? []).findIndex((r) => r.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.escalationRules[idx], updates);
  cfg.escalationRules.sort((a, b) => a.order - b.order);
  await writeConfig(cfg);
  return cfg.escalationRules[idx];
}

export async function deleteEscalationRule(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = (cfg.escalationRules ?? []).length;
  cfg.escalationRules = (cfg.escalationRules ?? []).filter((r) => r.id !== id);
  if (cfg.escalationRules.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Organization CRUD
// ══════════════════════════════════════════════════════════════════════

export async function addOrganization(org: Omit<HelpdeskOrg, "id">): Promise<HelpdeskOrg> {
  const cfg = await readConfig();
  const newOrg: HelpdeskOrg = { id: randomUUID(), ...org };
  if (!cfg.organizations) cfg.organizations = [];
  cfg.organizations.push(newOrg);
  await writeConfig(cfg);
  return newOrg;
}

export async function updateOrganization(id: string, updates: Partial<Omit<HelpdeskOrg, "id">>): Promise<HelpdeskOrg | null> {
  const cfg = await readConfig();
  const idx = (cfg.organizations ?? []).findIndex((o) => o.id === id);
  if (idx === -1) return null;
  Object.assign(cfg.organizations[idx], updates);
  await writeConfig(cfg);
  return cfg.organizations[idx];
}

export async function deleteOrganization(id: string): Promise<boolean> {
  const cfg = await readConfig();
  const before = (cfg.organizations ?? []).length;
  cfg.organizations = (cfg.organizations ?? []).filter((o) => o.id !== id);
  if (cfg.organizations.length === before) return false;
  await writeConfig(cfg);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Config Settings (IMAP, KB, Webhook, Notification Templates)
// ══════════════════════════════════════════════════════════════════════

export async function updateHelpdeskSettings(updates: {
  imapConfig?: HelpdeskConfig["imapConfig"];
  webhookSecret?: string;
  kbSpaceSlug?: string;
  notificationTemplates?: HdNotificationTemplate[];
}): Promise<void> {
  const cfg = await readConfig();
  if (updates.imapConfig !== undefined) cfg.imapConfig = updates.imapConfig;
  if (updates.webhookSecret !== undefined) cfg.webhookSecret = updates.webhookSecret;
  if (updates.kbSpaceSlug !== undefined) cfg.kbSpaceSlug = updates.kbSpaceSlug;
  if (updates.notificationTemplates !== undefined) cfg.notificationTemplates = updates.notificationTemplates;
  await writeConfig(cfg);
}

// ══════════════════════════════════════════════════════════════════════
//  Ticket CRUD
// ══════════════════════════════════════════════════════════════════════

export interface CreateTicketFields {
  subject: string;
  description: string;
  ticketType?: TicketType;
  priority?: TicketPriority;
  category?: string;
  assignedGroup?: string;
  assignedTo?: string;
  requester: string;
  requesterEmail?: string;
  requesterType: "agent" | "portal";
  assetId?: string;
  affectedAssetIds?: string[];
  relatedChangeId?: string;
  formId?: string;
  customFields?: Record<string, string | number | boolean | string[]>;
  tags?: string[];
  attachments?: TicketAttachment[];
  catalogItemId?: string;
}

export async function createTicket(fields: CreateTicketFields): Promise<Ticket> {
  const data = await readTickets();
  const cfg = await readConfig();
  const num = data.nextNumber || 1;
  const tType = fields.ticketType || "incident";
  const prefix = tType === "service_request" ? "SR" : tType === "problem" ? "PRB" : "INC";
  const id = `${prefix}-${String(num).padStart(4, "0")}`;
  const now = new Date().toISOString();

  // Apply service catalog defaults if a catalog item was referenced
  let effectivePriority = fields.priority || "Medium";
  let effectiveGroup = fields.assignedGroup;
  let effectiveAssignee = fields.assignedTo;
  const catalogItem = fields.catalogItemId
    ? (cfg.catalogItems ?? []).find((c) => c.id === fields.catalogItemId)
    : undefined;
  if (catalogItem) {
    if (!effectiveGroup && catalogItem.defaultGroupId) effectiveGroup = catalogItem.defaultGroupId;
    if (!effectiveAssignee && catalogItem.defaultAssignee) effectiveAssignee = catalogItem.defaultAssignee;
    if (!fields.priority && catalogItem.defaultPriority) effectivePriority = catalogItem.defaultPriority;
  }

  const ticket: Ticket = {
    id,
    ticketType: tType,
    subject: fields.subject.trim(),
    description: fields.description,
    status: "Open",
    priority: effectivePriority,
    category: fields.category || "",
    assignedGroup: effectiveGroup,
    assignedTo: effectiveAssignee,
    requester: fields.requester,
    requesterEmail: fields.requesterEmail,
    requesterType: fields.requesterType,
    assetId: fields.assetId,
    affectedAssetIds: fields.affectedAssetIds || [],
    relatedChangeId: fields.relatedChangeId,
    formId: fields.formId,
    customFields: fields.customFields || {},
    tags: fields.tags || [],
    attachments: fields.attachments || [],
    comments: [],
    approvals: [],
    linkedTickets: [],
    workLogs: [],
    history: [],
    createdAt: now,
    updatedAt: now,
  };

  // Apply rule engine
  applyRules(ticket, cfg.rules);

  // Apply catalog-level approval chain
  if (catalogItem?.approvalRequired && catalogItem.approvers.length > 0) {
    ticket.status = "Pending Approval";
    ticket.approvals = catalogItem.approvers.map((a, i) => ({
      id: randomUUID(), approver: a, level: i + 1, decision: "Pending" as const,
    }));
  }

  // Apply SLA (catalog override or default)
  const slaPolicy = catalogItem?.slaOverridePolicyId
    ? cfg.slaPolicies.find((p) => p.id === catalogItem.slaOverridePolicyId)
    : cfg.slaPolicies.find((p) => p.isDefault);
  if (slaPolicy) applySla(ticket, slaPolicy);

  // Apply org-specific SLA if requester email matches an org domain
  if (fields.requesterEmail && !catalogItem?.slaOverridePolicyId) {
    const domain = fields.requesterEmail.split("@")[1]?.toLowerCase();
    const org = domain ? (cfg.organizations ?? []).find((o) => o.domain.toLowerCase() === domain) : undefined;
    if (org?.defaultSlaId) {
      const orgSla = cfg.slaPolicies.find((p) => p.id === org.defaultSlaId);
      if (orgSla) applySla(ticket, orgSla);
    }
    if (org?.defaultGroupId && !ticket.assignedGroup) {
      ticket.assignedGroup = org.defaultGroupId;
    }
  }

  data.tickets.push(ticket);
  data.nextNumber = num + 1;
  await writeTickets(data);

  // Fire-and-forget notifications (email + in-app)
  notifyTicketCreated(ticket, cfg).catch(() => {});
  pushHelpdeskNotif(ticket.assignedTo, `New ticket ${ticket.id}: ${ticket.subject}`, ticket.id).catch(() => {});
  if (ticket.assignedGroup) {
    const grp = cfg.groups.find((g) => g.id === ticket.assignedGroup);
    if (grp) {
      for (const m of grp.members) {
        if (m !== ticket.assignedTo) pushHelpdeskNotif(m, `New ticket ${ticket.id} for ${grp.name}`, ticket.id).catch(() => {});
      }
    }
  }

  return ticket;
}

export async function updateTicket(id: string, updates: Partial<Omit<Ticket, "id" | "createdAt" | "comments">>, actor?: string): Promise<Ticket | null> {
  const data = await readTickets();
  const idx = data.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const t = data.tickets[idx];
  const wasResolved = t.status === "Resolved" || t.status === "Closed";
  const oldStatus = t.status;
  const oldAssignee = t.assignedTo;

  // Record history for tracked fields
  const now = new Date().toISOString();
  const trackedFields: (keyof typeof updates)[] = ["status", "priority", "assignedTo", "assignedGroup", "category"];
  if (!t.history) t.history = [];
  for (const field of trackedFields) {
    if (updates[field] !== undefined && updates[field] !== (t as unknown as Record<string, unknown>)[field]) {
      t.history.push({ field, oldValue: (t as unknown as Record<string, unknown>)[field], newValue: updates[field], changedBy: actor || "system", changedAt: now });
    }
  }

  Object.assign(t, updates, { updatedAt: now });

  // Track resolution/close timestamps
  if (!wasResolved && (t.status === "Resolved" || t.status === "Closed")) {
    if (!t.resolvedAt) t.resolvedAt = now;
    if (t.status === "Closed" && !t.closedAt) t.closedAt = now;
    if (t.slaResolutionDue && !t.slaResolutionMet) {
      t.slaResolutionMet = now <= t.slaResolutionDue;
    }
  }

  await writeTickets(data);

  // In-app notifications for status changes and reassignment
  if (updates.status && updates.status !== oldStatus) {
    pushHelpdeskNotif(t.assignedTo, `${t.id} status changed to ${t.status}`, t.id).catch(() => {});
    if (t.requesterType === "agent" && t.requester !== t.assignedTo) {
      pushHelpdeskNotif(t.requester, `${t.id} status changed to ${t.status}`, t.id).catch(() => {});
    }
  }
  if (updates.assignedTo && updates.assignedTo !== oldAssignee) {
    pushHelpdeskNotif(updates.assignedTo, `Ticket ${t.id} assigned to you: ${t.subject}`, t.id).catch(() => {});
  }

  return t;
}

export async function deleteTicket(id: string): Promise<boolean> {
  const data = await readTickets();
  const before = data.tickets.length;
  data.tickets = data.tickets.filter((t) => t.id !== id);
  if (data.tickets.length === before) return false;
  await writeTickets(data);
  return true;
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const data = await readTickets();
  return data.tickets.find((t) => t.id === id) || null;
}

export async function addComment(ticketId: string, comment: Omit<TicketComment, "id" | "createdAt">): Promise<TicketComment | null> {
  const data = await readTickets();
  const ticket = data.tickets.find((t) => t.id === ticketId);
  if (!ticket) return null;

  const newComment: TicketComment = {
    id: randomUUID(),
    ...comment,
    createdAt: new Date().toISOString(),
  };
  ticket.comments.push(newComment);
  ticket.updatedAt = new Date().toISOString();

  // Mark SLA response met on first agent reply
  if (comment.authorType === "agent" && !comment.isInternal && ticket.slaResponseDue && ticket.slaResponseMet === undefined) {
    ticket.slaResponseMet = new Date().toISOString() <= ticket.slaResponseDue;
  }

  await writeTickets(data);

  // Notify requester on public reply
  if (comment.authorType === "agent" && !comment.isInternal) {
    notifyCommentAdded(ticket, newComment).catch(() => {});
  }

  return newComment;
}

// ══════════════════════════════════════════════════════════════════════
//  Search & Filtering
// ══════════════════════════════════════════════════════════════════════

export interface TicketFilters {
  q?: string;
  status?: string;
  priority?: string;
  ticketType?: string;
  assignedTo?: string;
  assignedGroup?: string;
  category?: string;
  requester?: string;
  tag?: string;
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  let result = tickets;
  if (filters.status) result = result.filter((t) => t.status === filters.status);
  if (filters.priority) result = result.filter((t) => t.priority === filters.priority);
  if (filters.ticketType) result = result.filter((t) => t.ticketType === filters.ticketType);
  if (filters.assignedTo) result = result.filter((t) => t.assignedTo === filters.assignedTo);
  if (filters.assignedGroup) result = result.filter((t) => t.assignedGroup === filters.assignedGroup);
  if (filters.category) result = result.filter((t) => t.category === filters.category);
  if (filters.requester) result = result.filter((t) => t.requester === filters.requester);
  if (filters.tag) result = result.filter((t) => t.tags.includes(filters.tag!));
  if (filters.q && filters.q.length >= 2) {
    const q = filters.q.toLowerCase();
    result = result.filter((t) =>
      t.id.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.requester.toLowerCase().includes(q) ||
      (t.assignedTo?.toLowerCase().includes(q) ?? false) ||
      t.category.toLowerCase().includes(q),
    );
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════
//  Rule Engine
// ══════════════════════════════════════════════════════════════════════

function evaluateCondition(ticket: Ticket, cond: RuleCondition): boolean {
  let fieldVal: string | string[] | number | boolean | undefined;

  // Standard fields
  switch (cond.field) {
    case "category": fieldVal = ticket.category; break;
    case "priority": fieldVal = ticket.priority; break;
    case "subject_contains": fieldVal = ticket.subject; break;
    case "description_contains": fieldVal = ticket.description; break;
    case "requester": fieldVal = ticket.requester; break;
    default:
      // Custom field
      fieldVal = ticket.customFields[cond.field];
  }

  const val = String(fieldVal ?? "").toLowerCase();
  const condVal = Array.isArray(cond.value) ? cond.value.map((v) => v.toLowerCase()) : cond.value.toLowerCase();

  switch (cond.operator) {
    case "equals": return val === condVal;
    case "not_equals": return val !== condVal;
    case "contains": return val.includes(condVal as string);
    case "not_contains": return !val.includes(condVal as string);
    case "in": return Array.isArray(condVal) && condVal.includes(val);
    case "not_in": return Array.isArray(condVal) && !condVal.includes(val);
    case "gt": return Number(fieldVal) > Number(cond.value);
    case "lt": return Number(fieldVal) < Number(cond.value);
    default: return false;
  }
}

function applyRules(ticket: Ticket, rules: HdRule[]): void {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.order - b.order);

  for (const rule of sorted) {
    const matches = rule.matchType === "all"
      ? rule.conditions.every((c) => evaluateCondition(ticket, c))
      : rule.conditions.some((c) => evaluateCondition(ticket, c));

    if (matches) {
      for (const action of rule.actions) {
        switch (action.type) {
          case "assign_group": ticket.assignedGroup = action.value; break;
          case "assign_person": ticket.assignedTo = action.value; break;
          case "set_priority": ticket.priority = action.value as TicketPriority; break;
          case "set_status": ticket.status = action.value as TicketStatus; break;
          case "add_tag":
            if (!ticket.tags.includes(action.value)) ticket.tags.push(action.value);
            break;
          case "require_approval":
            // value = comma-separated approver usernames
            ticket.status = "Pending Approval";
            ticket.approvals = action.value.split(",").map((a, i) => ({
              id: randomUUID(), approver: a.trim(), level: i + 1, decision: "Pending" as const,
            }));
            break;
          // send_notification handled post-creation
        }
      }
      if (rule.stopOnMatch) break;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  SLA Calculator
// ══════════════════════════════════════════════════════════════════════

function applySla(ticket: Ticket, policy: SlaPolicy): void {
  const pc = policy.priorities.find((p) => p.priority === ticket.priority);
  if (!pc) return;

  const now = new Date();
  if (pc.responseTimeMinutes > 0) {
    ticket.slaResponseDue = new Date(now.getTime() + pc.responseTimeMinutes * 60000).toISOString();
  }
  if (pc.resolutionTimeMinutes > 0) {
    ticket.slaResolutionDue = new Date(now.getTime() + pc.resolutionTimeMinutes * 60000).toISOString();
  }
}

export function getSlaStatus(ticket: Ticket): { response: "met" | "breached" | "pending" | "na"; resolution: "met" | "breached" | "pending" | "na" } {
  const now = new Date().toISOString();
  return {
    response: !ticket.slaResponseDue ? "na"
      : ticket.slaResponseMet === true ? "met"
      : ticket.slaResponseMet === false ? "breached"
      : now > ticket.slaResponseDue ? "breached" : "pending",
    resolution: !ticket.slaResolutionDue ? "na"
      : ticket.slaResolutionMet === true ? "met"
      : ticket.slaResolutionMet === false ? "breached"
      : now > ticket.slaResolutionDue ? "breached" : "pending",
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Email Notifications (fire-and-forget)
// ══════════════════════════════════════════════════════════════════════

async function notifyTicketCreated(ticket: Ticket, cfg: HelpdeskConfig): Promise<void> {
  // Notify assigned person
  if (ticket.assignedTo) {
    const users = await getUsers();
    const assignee = users.find((u) => u.username === ticket.assignedTo);
    if (assignee?.email) {
      await sendMail(assignee.email, `[Helpdesk] New ticket assigned: ${ticket.id} - ${ticket.subject}`,
        `<p>A new ticket has been assigned to you:</p>
         <ul>
           <li><strong>ID:</strong> ${ticket.id}</li>
           <li><strong>Subject:</strong> ${ticket.subject}</li>
           <li><strong>Priority:</strong> ${ticket.priority}</li>
           <li><strong>Requester:</strong> ${ticket.requester}</li>
         </ul>
         <p>Log in to the helpdesk to view and respond.</p>`);
    }
  }
  // Notify assigned group email
  if (ticket.assignedGroup) {
    const group = cfg.groups.find((g) => g.id === ticket.assignedGroup);
    if (group?.email) {
      await sendMail(group.email, `[Helpdesk] New ticket for ${group.name}: ${ticket.id}`,
        `<p>A new ticket has been submitted for group <strong>${group.name}</strong>:</p>
         <ul>
           <li><strong>ID:</strong> ${ticket.id}</li>
           <li><strong>Subject:</strong> ${ticket.subject}</li>
           <li><strong>Priority:</strong> ${ticket.priority}</li>
         </ul>`);
    }
  }
}

async function notifyCommentAdded(ticket: Ticket, comment: TicketComment): Promise<void> {
  // Notify requester
  if (ticket.requesterEmail) {
    await sendMail(ticket.requesterEmail, `[Helpdesk] Update on ${ticket.id}: ${ticket.subject}`,
      `<p>Your ticket <strong>${ticket.id}</strong> has a new response:</p>
       <blockquote style="border-left:3px solid #6366f1;padding-left:12px;color:#555">
         ${comment.content.slice(0, 500)}
       </blockquote>
       <p>Log in to view the full response.</p>`);
  }
  // In-app notification for assignee
  pushHelpdeskNotif(
    ticket.assignedTo,
    `New comment on ${ticket.id}: ${comment.content.slice(0, 80)}`,
    ticket.id,
  ).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════
//  In-App Helpdesk Notifications
// ══════════════════════════════════════════════════════════════════════

async function pushHelpdeskNotif(username: string | undefined, message: string, ticketId: string): Promise<void> {
  if (!username) return;
  try {
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "helpdesk" as AppNotification["type"],
      message,
      from: "helpdesk",
      spaceSlug: "",
      docName: ticketId,
      category: "helpdesk",
      createdAt: new Date().toISOString(),
      read: false,
      meta: { ticketId },
    };
    const existing = await readNotifications(username);
    existing.unshift(notif);
    if (existing.length > 100) existing.length = 100;
    await writeNotifications(username, existing);
  } catch { /* fire-and-forget */ }
}

// ══════════════════════════════════════════════════════════════════════
//  Work Log helpers
// ══════════════════════════════════════════════════════════════════════

export async function addWorkLog(ticketId: string, log: Omit<WorkLogEntry, "id">): Promise<WorkLogEntry | null> {
  const data = await readTickets();
  const ticket = data.tickets.find((t) => t.id === ticketId);
  if (!ticket) return null;
  if (!ticket.workLogs) ticket.workLogs = [];
  const entry: WorkLogEntry = { id: randomUUID(), ...log };
  ticket.workLogs.push(entry);
  ticket.updatedAt = new Date().toISOString();
  await writeTickets(data);
  return entry;
}

// ══════════════════════════════════════════════════════════════════════
//  Ticket Linking & Merging
// ══════════════════════════════════════════════════════════════════════

export async function linkTickets(sourceId: string, targetId: string, relation: TicketLinkRelation): Promise<boolean> {
  const data = await readTickets();
  const src = data.tickets.find((t) => t.id === sourceId);
  const tgt = data.tickets.find((t) => t.id === targetId);
  if (!src || !tgt) return false;
  if (!src.linkedTickets) src.linkedTickets = [];
  if (!tgt.linkedTickets) tgt.linkedTickets = [];
  // Add bidirectional link
  const inverseRelation: TicketLinkRelation = relation === "parent" ? "child" : relation === "child" ? "parent" : relation;
  if (!src.linkedTickets.some((l) => l.ticketId === targetId)) src.linkedTickets.push({ ticketId: targetId, relation });
  if (!tgt.linkedTickets.some((l) => l.ticketId === sourceId)) tgt.linkedTickets.push({ ticketId: sourceId, relation: inverseRelation });
  await writeTickets(data);
  return true;
}

export async function mergeTickets(sourceId: string, targetId: string, actor: string): Promise<boolean> {
  const data = await readTickets();
  const src = data.tickets.find((t) => t.id === sourceId);
  const tgt = data.tickets.find((t) => t.id === targetId);
  if (!src || !tgt) return false;
  // Copy comments from source to target
  for (const c of src.comments) tgt.comments.push({ ...c, content: `[Merged from ${sourceId}] ${c.content}` });
  // Close source as duplicate
  src.status = "Closed";
  src.closedAt = new Date().toISOString();
  src.updatedAt = new Date().toISOString();
  if (!src.linkedTickets) src.linkedTickets = [];
  if (!tgt.linkedTickets) tgt.linkedTickets = [];
  src.linkedTickets.push({ ticketId: targetId, relation: "duplicate" });
  tgt.linkedTickets.push({ ticketId: sourceId, relation: "duplicate" });
  // Add merge history
  if (!src.history) src.history = [];
  src.history.push({ field: "merged_into", oldValue: null, newValue: targetId, changedBy: actor, changedAt: new Date().toISOString() });
  tgt.updatedAt = new Date().toISOString();
  await writeTickets(data);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Approval helpers
// ══════════════════════════════════════════════════════════════════════

export async function decideApproval(
  ticketId: string, approver: string, decision: "Approved" | "Rejected", comment?: string,
): Promise<Ticket | null> {
  const data = await readTickets();
  const ticket = data.tickets.find((t) => t.id === ticketId);
  if (!ticket || !ticket.approvals?.length) return null;
  const approval = ticket.approvals.find((a) => a.approver === approver && a.decision === "Pending");
  if (!approval) return null;
  approval.decision = decision;
  approval.comment = comment;
  approval.decidedAt = new Date().toISOString();
  // If all approvals decided, update status
  const allDecided = ticket.approvals.every((a) => a.decision !== "Pending");
  if (allDecided) {
    const anyRejected = ticket.approvals.some((a) => a.decision === "Rejected");
    ticket.status = anyRejected ? "Closed" : "Open";
  }
  ticket.updatedAt = new Date().toISOString();
  await writeTickets(data);
  // Notify requester
  pushHelpdeskNotif(ticket.requester, `${ticket.id} approval ${decision.toLowerCase()} by ${approver}`, ticket.id).catch(() => {});
  return ticket;
}
