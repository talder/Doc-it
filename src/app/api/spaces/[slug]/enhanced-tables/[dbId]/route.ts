import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable, writeEnhancedTable, getEnhancedTableDir, generateId } from "@/lib/enhanced-table";
import { ensureDir, getTrashDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string; dbId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });
  return NextResponse.json(db);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const updates = await request.json();

  // ── Bidirectional relation column lifecycle ──────────────────────────────
  if (updates.columns !== undefined) {
    const oldCols = db.columns;
    const newCols: typeof db.columns = updates.columns;

    // Detect new bidirectional relation columns → create reverse column on target
    for (const nc of newCols) {
      if (nc.type !== "relation" || !nc.relation?.bidirectional) continue;
      const existed = oldCols.find((o) => o.id === nc.id);
      if (existed?.relation?.reverseColumnId) {
        // Already has a reverse column — preserve it
        nc.relation.reverseColumnId = existed.relation.reverseColumnId;
        continue;
      }
      // Create reverse column on the target table
      const targetDb = await readEnhancedTable(nc.relation.targetSpace, nc.relation.targetDbId);
      if (targetDb) {
        const reverseId = generateId();
        targetDb.columns.push({
          id: reverseId,
          name: `↩ ${db.title}`,
          type: "relation",
          width: 150,
          relation: {
            targetSpace: slug,
            targetDbId: dbId,
            displayColumnId: undefined,
            limit: "many",
            bidirectional: true,
            reverseColumnId: nc.id,
          },
        });
        // Add reverse column to all target views' columnOrder
        targetDb.views = targetDb.views.map((v) => ({
          ...v,
          columnOrder: [...(v.columnOrder || targetDb.columns.map((c) => c.id)), reverseId],
        }));
        targetDb.updatedAt = new Date().toISOString();
        await writeEnhancedTable(nc.relation.targetSpace, nc.relation.targetDbId, targetDb);
        nc.relation.reverseColumnId = reverseId;
      }
    }

    // Detect removed bidirectional relation columns → remove reverse column from target
    for (const oc of oldCols) {
      if (oc.type !== "relation" || !oc.relation?.bidirectional || !oc.relation.reverseColumnId) continue;
      const stillExists = newCols.find((nc) => nc.id === oc.id);
      if (stillExists) continue;
      // Column was deleted — remove the reverse column from the target table
      const targetDb = await readEnhancedTable(oc.relation.targetSpace, oc.relation.targetDbId);
      if (targetDb) {
        const revId = oc.relation.reverseColumnId;
        targetDb.columns = targetDb.columns.filter((c) => c.id !== revId);
        targetDb.views = targetDb.views.map((v) => ({
          ...v,
          columnOrder: (v.columnOrder || []).filter((id) => id !== revId),
          hiddenColumns: (v.hiddenColumns || []).filter((id) => id !== revId),
        }));
        // Clean reverse column data from all rows
        for (const row of targetDb.rows) delete row.cells[revId];
        targetDb.updatedAt = new Date().toISOString();
        await writeEnhancedTable(oc.relation.targetSpace, oc.relation.targetDbId, targetDb);
      }
    }
  }

  // Allow updating: title, columns, views, tags
  if (updates.title !== undefined) db.title = updates.title;
  if (updates.columns !== undefined) db.columns = updates.columns;
  if (updates.views !== undefined) db.views = updates.views;
  if (updates.tags !== undefined) db.tags = updates.tags;
  // Allow full row replacement (for reorder, bulk ops)
  if (updates.rows !== undefined) db.rows = updates.rows;
  db.updatedAt = new Date().toISOString();

  await writeEnhancedTable(slug, dbId, db);
  invalidateSpaceCache(slug);
  return NextResponse.json(db);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  let user;
  try { ({ user } = await requireSpaceRole(slug, "writer")); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  // Move to trash instead of permanent delete
  const trashDir = path.join(getTrashDir(), slug);
  await ensureDir(trashDir);
  const trashId = `${Date.now()}-${dbId}`;
  const srcPath = path.join(getEnhancedTableDir(slug), `${dbId}.db.json`);
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
