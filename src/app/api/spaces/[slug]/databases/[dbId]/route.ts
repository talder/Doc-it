import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readDatabase, writeDatabase, deleteDatabase } from "@/lib/database";

type Params = { params: Promise<{ slug: string; dbId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readDatabase(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });
  return NextResponse.json(db);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readDatabase(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const updates = await request.json();

  // Allow updating: title, columns, views
  if (updates.title !== undefined) db.title = updates.title;
  if (updates.columns !== undefined) db.columns = updates.columns;
  if (updates.views !== undefined) db.views = updates.views;
  // Allow full row replacement (for reorder, bulk ops)
  if (updates.rows !== undefined) db.rows = updates.rows;
  db.updatedAt = new Date().toISOString();

  await writeDatabase(slug, dbId, db);
  return NextResponse.json(db);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const ok = await deleteDatabase(slug, dbId);
  if (!ok) return NextResponse.json({ error: "Database not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
