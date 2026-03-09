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
} from "@/lib/helpdesk";

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

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
