import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { readDatabase, writeDatabase, getDatabaseDir } from "@/lib/database";
import { ensureDir, getTrashDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

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
  invalidateSpaceCache(slug);
  return NextResponse.json(db);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  let user;
  try { ({ user } = await requireSpaceRole(slug, "writer")); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readDatabase(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  // Move to trash instead of permanent delete
  const trashDir = path.join(getTrashDir(), slug);
  await ensureDir(trashDir);
  const trashId = `${Date.now()}-${dbId}`;
  const srcPath = path.join(getDatabaseDir(slug), `${dbId}.db.json`);
  const trashFile = path.join(trashDir, trashId);

  try {
    const content = await fs.readFile(srcPath, "utf-8");
    await fs.writeFile(trashFile, content, "utf-8");
    await fs.unlink(srcPath);
  } catch {
    return NextResponse.json({ error: "Failed to move to trash" }, { status: 500 });
  }

  // Update trash manifest
  const manifestPath = path.join(trashDir, "manifest.json");
  let manifest: { items: Array<Record<string, unknown>> } = { items: [] };
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch { /* new manifest */ }

  manifest.items.push({
    id: trashId,
    name: db.title,
    category: "",
    filename: `${dbId}.db.json`,
    deletedBy: user.username,
    deletedAt: new Date().toISOString(),
    itemType: "database",
    dbId,
  });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  invalidateSpaceCache(slug);
  auditLog(_request, { event: "database.delete", outcome: "success", actor: user.username, spaceSlug: slug, resource: dbId, resourceType: "database", details: { action: "trash", title: db.title } });
  return NextResponse.json({ success: true });
}
