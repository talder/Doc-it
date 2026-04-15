import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable, writeEnhancedTable, generateId } from "@/lib/enhanced-table";
import type { DbWebhook } from "@/lib/types";

type Params = { params: Promise<{ slug: string; dbId: string }> };

/**
 * GET /api/spaces/:slug/enhanced-tables/:dbId/webhooks
 * Returns the table's webhook list.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "admin"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  return NextResponse.json({ webhooks: db.webhooks || [] });
}

/**
 * POST /api/spaces/:slug/enhanced-tables/:dbId/webhooks
 * Body: { url, events, enabled? }
 * Creates a new webhook.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "admin"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const { url, events, enabled } = await request.json();
  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "Missing url or events" }, { status: 400 });
  }

  const webhook: DbWebhook = {
    id: generateId(),
    url,
    events,
    enabled: enabled !== false,
  };

  db.webhooks = [...(db.webhooks || []), webhook];
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json(webhook, { status: 201 });
}

/**
 * PUT /api/spaces/:slug/enhanced-tables/:dbId/webhooks
 * Body: { id, url?, events?, enabled? }
 * Updates an existing webhook.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "admin"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const { id, url, events, enabled } = await request.json();
  const idx = (db.webhooks || []).findIndex((w) => w.id === id);
  if (idx === -1) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  if (url !== undefined) db.webhooks![idx].url = url;
  if (events !== undefined) db.webhooks![idx].events = events;
  if (enabled !== undefined) db.webhooks![idx].enabled = enabled;
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json(db.webhooks![idx]);
}

/**
 * DELETE /api/spaces/:slug/enhanced-tables/:dbId/webhooks
 * Body: { id }
 * Deletes a webhook.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "admin"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const { id } = await request.json();
  db.webhooks = (db.webhooks || []).filter((w) => w.id !== id);
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json({ success: true });
}
