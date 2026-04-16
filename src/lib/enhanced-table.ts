import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSpaceDir, getStorageRoot, ensureDir } from "./config";
import type { EnhancedTable, DbColumn } from "./types";

export function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function getEnhancedTableDir(spaceSlug: string): string {
  return path.join(getSpaceDir(spaceSlug), ".databases");
}

function dbPath(spaceSlug: string, dbId: string): string {
  return path.join(getEnhancedTableDir(spaceSlug), `${dbId}.db.json`);
}

function indexPath(spaceSlug: string): string {
  return path.join(getEnhancedTableDir(spaceSlug), "_index.json");
}

/**
 * Lightweight metadata for table listing (no row data loaded).
 */
export interface EnhancedTableMeta {
  id: string;
  title: string;
  rowCount: number;
  columnCount: number;
  columns: { id: string; name: string; type: string }[];
  views: { id: string; name: string; type: string }[];
  tags: string[];
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}

/** Extract metadata from a full EnhancedTable object. */
function extractMeta(db: EnhancedTable): EnhancedTableMeta {
  return {
    id: db.id,
    title: db.title || "",
    rowCount: Array.isArray(db.rows) ? db.rows.length : 0,
    columnCount: Array.isArray(db.columns) ? db.columns.length : 0,
    columns: (db.columns || []).map((c) => ({ id: c.id, name: c.name, type: c.type })),
    views: (db.views || []).map((v) => ({ id: v.id, name: v.name, type: v.type })),
    tags: db.tags || [],
    createdAt: db.createdAt,
    createdBy: db.createdBy,
    updatedAt: db.updatedAt,
  };
}

/** Read the metadata index. Returns a map of dbId → meta. */
async function readIndex(spaceSlug: string): Promise<Record<string, EnhancedTableMeta>> {
  try {
    const raw = await fs.readFile(indexPath(spaceSlug), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write the metadata index atomically. */
async function writeIndex(spaceSlug: string, index: Record<string, EnhancedTableMeta>): Promise<void> {
  const dir = getEnhancedTableDir(spaceSlug);
  await ensureDir(dir);
  await fs.writeFile(indexPath(spaceSlug), JSON.stringify(index), "utf-8");
}

/** Update one entry in the index (called after write). */
async function updateIndexEntry(spaceSlug: string, db: EnhancedTable): Promise<void> {
  const index = await readIndex(spaceSlug);
  index[db.id] = extractMeta(db);
  await writeIndex(spaceSlug, index);
}

/** Remove one entry from the index (called after delete). */
async function removeIndexEntry(spaceSlug: string, dbId: string): Promise<void> {
  const index = await readIndex(spaceSlug);
  delete index[dbId];
  await writeIndex(spaceSlug, index);
}

/**
 * List enhanced tables — reads only the lightweight _index.json file.
 * Falls back to scanning .db.json files if the index doesn't exist yet.
 */
export async function listEnhancedTablesMeta(spaceSlug: string): Promise<EnhancedTableMeta[]> {
  const dir = getEnhancedTableDir(spaceSlug);
  await ensureDir(dir);

  // Fast path: read from index
  const index = await readIndex(spaceSlug);
  if (Object.keys(index).length > 0) {
    return Object.values(index).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }

  // Slow path: index missing or empty — rebuild from .db.json files
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const rebuilt: Record<string, EnhancedTableMeta> = {};
  for (const f of files) {
    if (!f.endsWith(".db.json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.id) {
        rebuilt[parsed.id] = {
          id: parsed.id,
          title: parsed.title || f.replace(".db.json", ""),
          rowCount: Array.isArray(parsed.rows) ? parsed.rows.length : 0,
          columnCount: Array.isArray(parsed.columns) ? parsed.columns.length : 0,
          columns: (parsed.columns || []).map((c: any) => ({ id: c.id, name: c.name, type: c.type })),
          views: (parsed.views || []).map((v: any) => ({ id: v.id, name: v.name, type: v.type })),
          tags: parsed.tags || [],
          createdAt: parsed.createdAt,
          createdBy: parsed.createdBy,
          updatedAt: parsed.updatedAt,
        };
      }
    } catch { /* skip corrupt */ }
  }
  // Persist the rebuilt index for next time
  if (Object.keys(rebuilt).length > 0) {
    await writeIndex(spaceSlug, rebuilt).catch(() => {});
  }
  return Object.values(rebuilt).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

/** @deprecated Use listEnhancedTablesMeta for listing. This loads full row data. */
export async function listEnhancedTables(spaceSlug: string): Promise<EnhancedTable[]> {
  const dir = getEnhancedTableDir(spaceSlug);
  await ensureDir(dir);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const dbs: EnhancedTable[] = [];
  for (const f of files) {
    if (!f.endsWith(".db.json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.id) {
        if (!parsed.title) parsed.title = f.replace(".db.json", "");
        if (!Array.isArray(parsed.rows)) parsed.rows = [];
        if (!Array.isArray(parsed.columns)) parsed.columns = [];
        if (!Array.isArray(parsed.views)) parsed.views = [];
        dbs.push(parsed);
      }
    } catch { /* skip corrupt */ }
  }
  return dbs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

export async function readEnhancedTable(spaceSlug: string, dbId: string): Promise<EnhancedTable | null> {
  try {
    const raw = await fs.readFile(dbPath(spaceSlug, dbId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeEnhancedTable(spaceSlug: string, dbId: string, db: EnhancedTable): Promise<void> {
  const dir = getEnhancedTableDir(spaceSlug);
  await ensureDir(dir);
  await fs.writeFile(dbPath(spaceSlug, dbId), JSON.stringify(db, null, 2), "utf-8");
  // Update the lightweight index (non-blocking — don't let index errors break writes)
  updateIndexEntry(spaceSlug, db).catch(() => {});
}

export async function deleteEnhancedTable(spaceSlug: string, dbId: string): Promise<boolean> {
  try {
    await fs.unlink(dbPath(spaceSlug, dbId));
    removeIndexEntry(spaceSlug, dbId).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Move an enhanced table .db.json file to archive/.databases/ */
export async function archiveEnhancedTable(spaceSlug: string, dbId: string): Promise<boolean> {
  const src = dbPath(spaceSlug, dbId);
  const archiveDir = path.join(getStorageRoot(), "archive", spaceSlug, ".databases");
  await ensureDir(archiveDir);
  const dest = path.join(archiveDir, `${dbId}.db.json`);
  try {
    await fs.rename(src, dest);
    return true;
  } catch {
    return false;
  }
}

/** List archived enhanced tables */
export async function listArchivedEnhancedTables(spaceSlug: string): Promise<EnhancedTable[]> {
  const archiveDir = path.join(getStorageRoot(), "archive", spaceSlug, ".databases");
  try {
    const files = await fs.readdir(archiveDir);
    const dbs: EnhancedTable[] = [];
    for (const f of files) {
      if (!f.endsWith(".db.json")) continue;
      try {
        const raw = await fs.readFile(path.join(archiveDir, f), "utf-8");
        dbs.push(JSON.parse(raw));
      } catch { /* skip corrupt */ }
    }
    return dbs.sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

/** Unarchive an enhanced table (move archive -> active) */
export async function unarchiveEnhancedTable(spaceSlug: string, dbId: string): Promise<boolean> {
  const archiveDir = path.join(getStorageRoot(), "archive", spaceSlug, ".databases");
  const src = path.join(archiveDir, `${dbId}.db.json`);
  const destDir = getEnhancedTableDir(spaceSlug);
  await ensureDir(destDir);
  const dest = path.join(destDir, `${dbId}.db.json`);
  try {
    await fs.rename(src, dest);
    return true;
  } catch {
    return false;
  }
}

// ── Revision history (read-only — snapshots are no longer created on write) ───

function getHistoryDir(spaceSlug: string, dbId: string): string {
  return path.join(getStorageRoot(), "history", spaceSlug, ".databases", dbId);
}

export interface TableRevision {
  filename: string;
  timestamp: string;
  rowCount: number;
  columnCount: number;
}

/**
 * List revision snapshots for a table, newest first.
 */
export async function listTableRevisions(spaceSlug: string, dbId: string): Promise<TableRevision[]> {
  const histDir = getHistoryDir(spaceSlug, dbId);
  let files: string[];
  try {
    files = (await fs.readdir(histDir)).filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
  const revisions: TableRevision[] = [];
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(histDir, f), "utf-8");
      const parsed = JSON.parse(raw);
      // Use the table's updatedAt if available, otherwise derive from filename
      const timestamp = parsed.updatedAt || f.replace(".json", "").replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
      revisions.push({
        filename: f,
        timestamp,
        rowCount: Array.isArray(parsed.rows) ? parsed.rows.length : 0,
        columnCount: Array.isArray(parsed.columns) ? parsed.columns.length : 0,
      });
    } catch { /* skip corrupt */ }
  }
  return revisions;
}

/**
 * Restore a table from a specific revision snapshot.
 */
export async function restoreTableRevision(spaceSlug: string, dbId: string, filename: string): Promise<boolean> {
  const histDir = getHistoryDir(spaceSlug, dbId);
  const revPath = path.join(histDir, filename);
  try {
    const raw = await fs.readFile(revPath, "utf-8");
    const parsed = JSON.parse(raw) as EnhancedTable;
    // Write restores through the normal path (which creates a new snapshot of the pre-restore state)
    await writeEnhancedTable(spaceSlug, dbId, parsed);
    return true;
  } catch {
    return false;
  }
}

// ── Webhook helpers ───────────────────────────────────────────────────────────

/**
 * Fire matching webhooks for a table event. Non-blocking — errors are silently ignored.
 */
export function fireWebhooks(
  db: EnhancedTable,
  event: "create" | "update" | "delete",
  row: { id: string; cells: Record<string, unknown> },
  spaceSlug: string,
): void {
  if (!db.webhooks || db.webhooks.length === 0) return;
  for (const wh of db.webhooks) {
    if (!wh.enabled) continue;
    if (!wh.events.includes(event)) continue;
    // Fire-and-forget HTTP POST
    const payload = {
      event,
      tableId: db.id,
      tableTitle: db.title,
      spaceSlug,
      row,
      timestamp: new Date().toISOString(),
    };
    fetch(wh.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { /* silently ignore webhook failures */ });
  }
}

// ── Relation helpers ──────────────────────────────────────────────────────────

/**
 * Resolve display labels for a set of row IDs in a target table.
 * Returns a map of rowId -> display label string.
 */
export async function resolveRelationLabels(
  spaceSlug: string,
  dbId: string,
  rowIds: string[],
  displayColumnId?: string,
): Promise<Record<string, string>> {
  const db = await readEnhancedTable(spaceSlug, dbId);
  if (!db) return {};

  // Pick the display column: explicit, or first text column, or first column
  let displayCol: DbColumn | undefined;
  if (displayColumnId) displayCol = db.columns.find((c) => c.id === displayColumnId);
  if (!displayCol) displayCol = db.columns.find((c) => c.type === "text");
  if (!displayCol) displayCol = db.columns[0];
  if (!displayCol) return {};

  const idSet = new Set(rowIds);
  const labels: Record<string, string> = {};
  for (const row of db.rows) {
    if (!idSet.has(row.id)) continue;
    const raw = row.cells[displayCol.id];
    labels[row.id] = raw != null ? String(raw) : "";
  }
  return labels;
}

/**
 * Add a source row ID to the reverse relation column on a target table's row.
 */
export async function syncBidirectionalAdd(
  targetSpace: string,
  targetDbId: string,
  reverseColId: string,
  targetRowId: string,
  sourceRowId: string,
): Promise<void> {
  const db = await readEnhancedTable(targetSpace, targetDbId);
  if (!db) return;
  const row = db.rows.find((r) => r.id === targetRowId);
  if (!row) return;
  const current = row.cells[reverseColId];
  const arr = Array.isArray(current) ? [...current] : current ? [current] : [];
  if (!arr.includes(sourceRowId)) {
    arr.push(sourceRowId);
    row.cells[reverseColId] = arr;
    db.updatedAt = new Date().toISOString();
    await writeEnhancedTable(targetSpace, targetDbId, db);
  }
}

/**
 * Remove a source row ID from the reverse relation column on a target table's row.
 */
export async function syncBidirectionalRemove(
  targetSpace: string,
  targetDbId: string,
  reverseColId: string,
  targetRowId: string,
  sourceRowId: string,
): Promise<void> {
  const db = await readEnhancedTable(targetSpace, targetDbId);
  if (!db) return;
  const row = db.rows.find((r) => r.id === targetRowId);
  if (!row) return;
  const current = row.cells[reverseColId];
  const arr = Array.isArray(current) ? current.filter((id: string) => id !== sourceRowId) : [];
  row.cells[reverseColId] = arr;
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(targetSpace, targetDbId, db);
}

/**
 * When a row is deleted, clean up all bidirectional reverse references.
 */
export async function cleanupBidirectionalOnRowDelete(
  spaceSlug: string,
  db: EnhancedTable,
  row: { id: string; cells: Record<string, unknown> },
): Promise<void> {
  for (const col of db.columns) {
    if (col.type !== "relation" || !col.relation?.bidirectional || !col.relation.reverseColumnId) continue;
    const { targetSpace, targetDbId, reverseColumnId } = col.relation;
    const linked = row.cells[col.id];
    const ids = Array.isArray(linked) ? linked : linked ? [linked] : [];
    for (const targetRowId of ids) {
      await syncBidirectionalRemove(targetSpace, targetDbId, reverseColumnId, String(targetRowId), row.id);
    }
  }
}
