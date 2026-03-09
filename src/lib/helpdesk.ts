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

// ══════════════════════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────

export type TicketStatus = "Open" | "In Progress" | "Waiting" | "Resolved" | "Closed";
export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export type HdFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "textarea" | "url" | "email";
export type RuleMatchType = "all" | "any";
export type RuleConditionOp = "equals" | "not_equals" | "contains" | "not_contains" | "in" | "not_in" | "gt" | "lt";
export type RuleActionType = "assign_group" | "assign_person" | "set_priority" | "set_status" | "send_notification" | "add_tag";
export type WidgetType = "hero" | "ticket_form" | "my_tickets" | "announcements" | "faq" | "categories" | "search" | "custom_html" | "quick_links";

export const VALID_STATUSES: TicketStatus[] = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];
export const VALID_PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
export const VALID_FIELD_TYPES: HdFieldType[] = ["text", "number", "date", "boolean", "select", "multiselect", "textarea", "url", "email"];

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
  formId?: string;
  customFields: Record<string, string | number | boolean | string[]>;
  tags: string[];
  attachments: TicketAttachment[];
  comments: TicketComment[];
  slaResponseDue?: string;
  slaResolutionDue?: string;
  slaResponseMet?: boolean;
  slaResolutionMet?: boolean;
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
//  Ticket CRUD
// ══════════════════════════════════════════════════════════════════════

export interface CreateTicketFields {
  subject: string;
  description: string;
  priority?: TicketPriority;
  category?: string;
  assignedGroup?: string;
  assignedTo?: string;
  requester: string;
  requesterEmail?: string;
  requesterType: "agent" | "portal";
  assetId?: string;
  formId?: string;
  customFields?: Record<string, string | number | boolean | string[]>;
  tags?: string[];
  attachments?: TicketAttachment[];
}

export async function createTicket(fields: CreateTicketFields): Promise<Ticket> {
  const data = await readTickets();
  const cfg = await readConfig();
  const num = data.nextNumber || 1;
  const id = `TKT-${String(num).padStart(4, "0")}`;
  const now = new Date().toISOString();

  const ticket: Ticket = {
    id,
    subject: fields.subject.trim(),
    description: fields.description,
    status: "Open",
    priority: fields.priority || "Medium",
    category: fields.category || "",
    assignedGroup: fields.assignedGroup,
    assignedTo: fields.assignedTo,
    requester: fields.requester,
    requesterEmail: fields.requesterEmail,
    requesterType: fields.requesterType,
    assetId: fields.assetId,
    formId: fields.formId,
    customFields: fields.customFields || {},
    tags: fields.tags || [],
    attachments: fields.attachments || [],
    comments: [],
    createdAt: now,
    updatedAt: now,
  };

  // Apply rule engine
  applyRules(ticket, cfg.rules);

  // Apply SLA
  const defaultSla = cfg.slaPolicies.find((p) => p.isDefault);
  if (defaultSla) applySla(ticket, defaultSla);

  data.tickets.push(ticket);
  data.nextNumber = num + 1;
  await writeTickets(data);

  // Fire-and-forget notifications
  notifyTicketCreated(ticket, cfg).catch(() => {});

  return ticket;
}

export async function updateTicket(id: string, updates: Partial<Omit<Ticket, "id" | "createdAt" | "comments">>): Promise<Ticket | null> {
  const data = await readTickets();
  const idx = data.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const t = data.tickets[idx];
  const wasResolved = t.status === "Resolved" || t.status === "Closed";

  Object.assign(t, updates, { updatedAt: new Date().toISOString() });

  // Track resolution/close timestamps
  if (!wasResolved && (t.status === "Resolved" || t.status === "Closed")) {
    if (!t.resolvedAt) t.resolvedAt = new Date().toISOString();
    if (t.status === "Closed" && !t.closedAt) t.closedAt = new Date().toISOString();
    // Check SLA resolution
    if (t.slaResolutionDue && !t.slaResolutionMet) {
      t.slaResolutionMet = new Date().toISOString() <= t.slaResolutionDue;
    }
  }

  await writeTickets(data);
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
}
