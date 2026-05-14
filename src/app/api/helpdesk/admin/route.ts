import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readConfig,
  addGroup, updateGroup, deleteGroup,
  addCategory, updateCategory, deleteCategory,
  addFieldDef, updateFieldDef, deleteFieldDef,
  addForm, updateForm, deleteForm,
  addRule, updateRule, deleteRule,
  addSlaPolicy, updateSlaPolicy, deleteSlaPolicy,
  addPortalPage, updatePortalPage, deletePortalPage,
  addCatalogItem, updateCatalogItem, deleteCatalogItem,
  addReplyTemplate, updateReplyTemplate, deleteReplyTemplate,
  addEscalationRule, updateEscalationRule, deleteEscalationRule,
  addOrganization, updateOrganization, deleteOrganization,
  addSavedFilter, updateSavedFilter, deleteSavedFilter,
  addTicketTemplate, updateTicketTemplate, deleteTicketTemplate,
  addContract, updateContract, deleteContract,
  addScheduledReport, updateScheduledReport, deleteScheduledReport,
  updateHelpdeskSettings,
} from "@/lib/helpdesk";
import type { EscalationTrigger } from "@/lib/helpdesk";

/** GET /api/helpdesk/admin — full helpdesk config */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const config = await readConfig();
  return NextResponse.json(config);
}

/** POST /api/helpdesk/admin — action-based admin mutations */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { action } = body;

  switch (action) {
    // ── Groups ──
    case "createGroup": {
      const { name, description, members, email } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const group = await addGroup(name, description || "", members || [], email);
      return NextResponse.json({ group });
    }
    case "updateGroup": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const group = await updateGroup(id, updates);
      if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ group });
    }
    case "deleteGroup": {
      const ok = await deleteGroup(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Categories ──
    case "createCategory": {
      const { name, description, icon } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const cat = await addCategory(name, description || "", icon);
      return NextResponse.json({ category: cat });
    }
    case "updateCategory": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const cat = await updateCategory(id, updates);
      if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ category: cat });
    }
    case "deleteCategory": {
      const ok = await deleteCategory(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Field Definitions ──
    case "createFieldDef": {
      const { name, type, required, options, placeholder, defaultValue, order } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const def = await addFieldDef({ name, type: type || "text", required: !!required, options, placeholder, defaultValue, order: order ?? 0 });
      return NextResponse.json({ fieldDef: def });
    }
    case "updateFieldDef": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const def = await updateFieldDef(id, updates);
      if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ fieldDef: def });
    }
    case "deleteFieldDef": {
      const ok = await deleteFieldDef(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Forms ──
    case "createForm": {
      const { name, description, fields, isDefault, categoryFilter } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const form = await addForm({ name, description: description || "", fields: fields || [], isDefault: !!isDefault, categoryFilter });
      return NextResponse.json({ form });
    }
    case "updateForm": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const form = await updateForm(id, updates);
      if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ form });
    }
    case "deleteForm": {
      const ok = await deleteForm(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Rules ──
    case "createRule": {
      const { name, enabled, matchType, conditions, actions, order, stopOnMatch } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const rule = await addRule({ name, enabled: enabled !== false, matchType: matchType || "all", conditions: conditions || [], actions: actions || [], order: order ?? 0, stopOnMatch: !!stopOnMatch });
      return NextResponse.json({ rule });
    }
    case "updateRule": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const rule = await updateRule(id, updates);
      if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ rule });
    }
    case "deleteRule": {
      const ok = await deleteRule(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── SLA Policies ──
    case "createSlaPolicy": {
      const { name, isDefault, priorities, businessHours } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const policy = await addSlaPolicy({ name, isDefault: !!isDefault, priorities: priorities || [], businessHours });
      return NextResponse.json({ policy });
    }
    case "updateSlaPolicy": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const policy = await updateSlaPolicy(id, updates);
      if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ policy });
    }
    case "deleteSlaPolicy": {
      const ok = await deleteSlaPolicy(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Portal Pages ──
    case "createPortalPage": {
      const { name, slug, isHomePage, widgets, theme, published } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const page = await addPortalPage({ name, slug: slug || name.toLowerCase().replace(/\s+/g, "-"), isHomePage: !!isHomePage, published: !!published, widgets: widgets || [], theme });
      return NextResponse.json({ page });
    }
    case "updatePortalPage": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const page = await updatePortalPage(id, updates);
      if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ page });
    }
    case "deletePortalPage": {
      const ok = await deletePortalPage(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Service Catalog Items ──
    case "createCatalogItem": {
      const { name, description, icon, categoryId, formId, defaultGroupId, defaultAssignee, defaultPriority, slaOverridePolicyId, approvalRequired, approvers, cost, estimatedDays, published, order } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const item = await addCatalogItem({ name, description: description || "", icon, categoryId, formId, defaultGroupId, defaultAssignee, defaultPriority, slaOverridePolicyId, approvalRequired: !!approvalRequired, approvers: approvers || [], cost, estimatedDays, published: !!published, order: order ?? 0 });
      return NextResponse.json({ catalogItem: item });
    }
    case "updateCatalogItem": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const item = await updateCatalogItem(id, updates);
      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ catalogItem: item });
    }
    case "deleteCatalogItem": {
      const ok = await deleteCatalogItem(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Reply Templates ──
    case "createReplyTemplate": {
      const { name, content, category: tplCat } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const tpl = await addReplyTemplate({ name, content: content || "", category: tplCat });
      return NextResponse.json({ replyTemplate: tpl });
    }
    case "updateReplyTemplate": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const tpl = await updateReplyTemplate(id, updates);
      if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ replyTemplate: tpl });
    }
    case "deleteReplyTemplate": {
      const ok = await deleteReplyTemplate(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Escalation Rules ──
    case "createEscalationRule": {
      const { name, enabled, trigger, warningMinutesBefore, actions: ruleActions, order } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const rule = await addEscalationRule({ name, enabled: enabled !== false, trigger: trigger as EscalationTrigger, warningMinutesBefore: Number(warningMinutesBefore || 15), actions: ruleActions || [], order: order ?? 0 });
      return NextResponse.json({ escalationRule: rule });
    }
    case "updateEscalationRule": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const rule = await updateEscalationRule(id, updates);
      if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ escalationRule: rule });
    }
    case "deleteEscalationRule": {
      const ok = await deleteEscalationRule(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Organizations ──
    case "createOrganization": {
      const { name, domain, defaultSlaId, defaultGroupId } = body;
      if (!name?.trim() || !domain?.trim()) return NextResponse.json({ error: "Name and domain required" }, { status: 400 });
      const org = await addOrganization({ name, domain, defaultSlaId, defaultGroupId });
      return NextResponse.json({ organization: org });
    }
    case "updateOrganization": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const org = await updateOrganization(id, updates);
      if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ organization: org });
    }
    case "deleteOrganization": {
      const ok = await deleteOrganization(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Saved Filters ──
    case "createSavedFilter": {
      const { name, owner, shared, filters } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const filter = await addSavedFilter({ name, owner: owner || user.username, shared: !!shared, filters: filters || {} });
      return NextResponse.json({ savedFilter: filter });
    }
    case "updateSavedFilter": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const filter = await updateSavedFilter(id, updates);
      if (!filter) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ savedFilter: filter });
    }
    case "deleteSavedFilter": {
      const ok = await deleteSavedFilter(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Ticket Templates ──
    case "createTicketTemplate": {
      const { name, description, ticketType, priority, category, assignedGroup, subject, templateBody, tags, order } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const tpl = await addTicketTemplate({ name, description: description || "", ticketType, priority, category, assignedGroup, subject, body: templateBody, tags, order: order ?? 0 });
      return NextResponse.json({ ticketTemplate: tpl });
    }
    case "updateTicketTemplate": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const tpl = await updateTicketTemplate(id, updates);
      if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ticketTemplate: tpl });
    }
    case "deleteTicketTemplate": {
      const ok = await deleteTicketTemplate(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Support Contracts ──
    case "createContract": {
      const { name, orgId, startDate, endDate, maxTickets, slaOverridePolicyId, notes, active } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const contract = await addContract({ name, orgId, startDate: startDate || new Date().toISOString().slice(0, 10), endDate: endDate || "", maxTickets: maxTickets ?? 0, slaOverridePolicyId, notes: notes || "", active: active !== false });
      return NextResponse.json({ contract });
    }
    case "updateContract": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const contract = await updateContract(id, updates);
      if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ contract });
    }
    case "deleteContract": {
      const ok = await deleteContract(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Scheduled Reports ──
    case "createScheduledReport": {
      const { name, enabled, schedule, time, dayOfWeek, dayOfMonth, recipients, filters } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
      const report = await addScheduledReport({ name, enabled: enabled !== false, schedule: schedule || "daily", time: time || "08:00", dayOfWeek, dayOfMonth, recipients: recipients || [], filters });
      return NextResponse.json({ scheduledReport: report });
    }
    case "updateScheduledReport": {
      const { id, ...updates } = body; delete updates.action;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const report = await updateScheduledReport(id, updates);
      if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ scheduledReport: report });
    }
    case "deleteScheduledReport": {
      const ok = await deleteScheduledReport(body.id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Settings (IMAP, KB, Webhooks, Notification Templates, Slack, LDAP, etc.) ──
    case "updateSettings": {
      const { imapConfig, webhookSecret, kbSpaceSlug, notificationTemplates, slackConfig, ldapConfig, csatEmailEnabled, priorityMatrix } = body;
      await updateHelpdeskSettings({ imapConfig, webhookSecret, kbSpaceSlug, notificationTemplates, slackConfig, ldapConfig, csatEmailEnabled, priorityMatrix });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
