import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSpaceDir, getStorageRoot, ensureDir } from "./config";
import type { Database } from "./types";

export function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function getDatabaseDir(spaceSlug: string): string {
  return path.join(getSpaceDir(spaceSlug), ".databases");
}

function dbPath(spaceSlug: string, dbId: string): string {
  return path.join(getDatabaseDir(spaceSlug), `${dbId}.db.json`);
}

export async function listDatabases(spaceSlug: string): Promise<Database[]> {
  const dir = getDatabaseDir(spaceSlug);
  await ensureDir(dir);
  const files = await fs.readdir(dir);
  const dbs: Database[] = [];
  for (const f of files) {
    if (!f.endsWith(".db.json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf-8");
      dbs.push(JSON.parse(raw));
    } catch { /* skip corrupt */ }
  }
  return dbs.sort((a, b) => a.title.localeCompare(b.title));
}

export async function readDatabase(spaceSlug: string, dbId: string): Promise<Database | null> {
  try {
    const raw = await fs.readFile(dbPath(spaceSlug, dbId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeDatabase(spaceSlug: string, dbId: string, db: Database): Promise<void> {
  const dir = getDatabaseDir(spaceSlug);
  await ensureDir(dir);
  await fs.writeFile(dbPath(spaceSlug, dbId), JSON.stringify(db, null, 2), "utf-8");
}

export async function deleteDatabase(spaceSlug: string, dbId: string): Promise<boolean> {
  try {
    await fs.unlink(dbPath(spaceSlug, dbId));
    return true;
  } catch {
    return false;
  }
}

/** Move a database .db.json file to archive/.databases/ */
export async function archiveDatabase(spaceSlug: string, dbId: string): Promise<boolean> {
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

/** List archived databases */
export async function listArchivedDatabases(spaceSlug: string): Promise<Database[]> {
  const archiveDir = path.join(getStorageRoot(), "archive", spaceSlug, ".databases");
  try {
    const files = await fs.readdir(archiveDir);
    const dbs: Database[] = [];
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

/** Unarchive a database (move archive -> active) */
export async function unarchiveDatabase(spaceSlug: string, dbId: string): Promise<boolean> {
  const archiveDir = path.join(getStorageRoot(), "archive", spaceSlug, ".databases");
  const src = path.join(archiveDir, `${dbId}.db.json`);
  const destDir = getDatabaseDir(spaceSlug);
  await ensureDir(destDir);
  const dest = path.join(destDir, `${dbId}.db.json`);
  try {
    await fs.rename(src, dest);
    return true;
  } catch {
    return false;
  }
}
