import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSpaceDir, getStorageRoot, ensureDir } from "./config";
import type { EnhancedTable } from "./types";

export function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function getEnhancedTableDir(spaceSlug: string): string {
  return path.join(getSpaceDir(spaceSlug), ".databases");
}

function dbPath(spaceSlug: string, dbId: string): string {
  return path.join(getEnhancedTableDir(spaceSlug), `${dbId}.db.json`);
}

export async function listEnhancedTables(spaceSlug: string): Promise<EnhancedTable[]> {
  const dir = getEnhancedTableDir(spaceSlug);
  await ensureDir(dir);
  const files = await fs.readdir(dir);
  const dbs: EnhancedTable[] = [];
  for (const f of files) {
    if (!f.endsWith(".db.json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf-8");
      dbs.push(JSON.parse(raw));
    } catch { /* skip corrupt */ }
  }
  return dbs.sort((a, b) => a.title.localeCompare(b.title));
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
}

export async function deleteEnhancedTable(spaceSlug: string, dbId: string): Promise<boolean> {
  try {
    await fs.unlink(dbPath(spaceSlug, dbId));
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
