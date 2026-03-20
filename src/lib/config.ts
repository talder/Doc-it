import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

const CONFIG_DIR = path.join(process.cwd(), "config");
const DB_PATH = path.join(CONFIG_DIR, "docit.db");

/** Path to the root-level config file that sets the storage location. */
const DOCIT_CONFIG_FILE = path.join(process.cwd(), "docit.config.json");

interface DocitConfig {
  storageRoot?: string;
}

// Lazily resolved and cached. null = not yet read.
let _storageRoot: string | null = null;

/** Returns the storage root (base dir for docs/, archive/, history/, trash/).
 *  Reads docit.config.json synchronously on first call, then caches.
 *  Defaults to process.cwd() when the file is absent or storageRoot is unset. */
export function getStorageRoot(): string {
  if (_storageRoot !== null) return _storageRoot;
  try {
    const raw = fsSync.readFileSync(DOCIT_CONFIG_FILE, "utf-8");
    const cfg = JSON.parse(raw) as DocitConfig;
    if (cfg.storageRoot && path.isAbsolute(cfg.storageRoot)) {
      _storageRoot = cfg.storageRoot;
      return _storageRoot;
    }
  } catch {
    // File missing or invalid — fall through to default
  }
  _storageRoot = process.cwd();
  return _storageRoot;
}

/** Invalidate the cached storage root so the next call re-reads the file. */
export function invalidateStorageCache(): void {
  _storageRoot = null;
}

/** Read the current docit.config.json (or return defaults). */
export function readStorageConfig(): DocitConfig {
  try {
    const raw = fsSync.readFileSync(DOCIT_CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as DocitConfig;
  } catch {
    return {};
  }
}

/** Write storageRoot to docit.config.json and invalidate the cache. */
export async function saveStorageConfig(storageRoot: string): Promise<void> {
  const current = readStorageConfig();
  const updated: DocitConfig = { ...current, storageRoot };
  await fs.writeFile(DOCIT_CONFIG_FILE, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  invalidateStorageCache();
}

// ── SQLite singleton ──────────────────────────────────────────────────────────

let _db: BetterSqlite3.Database | null = null;
let _migrated = false;

export function getDb(): BetterSqlite3.Database {
  if (_db) return _db;

  // Ensure config directory exists (sync — runs once)
  if (!fsSync.existsSync(CONFIG_DIR)) {
    fsSync.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");

  // Create KV table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // ── Global blobstore tables ────────────────────────────────────────────
  _db.exec(`
    CREATE TABLE IF NOT EXISTS blobs (
      sha256       TEXT PRIMARY KEY,
      size         INTEGER NOT NULL,
      mime         TEXT NOT NULL,
      text_content TEXT,
      uploaded_by  TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachment_refs (
      id           TEXT PRIMARY KEY,
      sha256       TEXT NOT NULL REFERENCES blobs(sha256),
      original_name TEXT NOT NULL,
      space_slug   TEXT NOT NULL,
      doc_category TEXT NOT NULL DEFAULT '',
      doc_name     TEXT NOT NULL DEFAULT '',
      uploaded_by  TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_att_refs_sha256
      ON attachment_refs(sha256);
    CREATE INDEX IF NOT EXISTS idx_att_refs_space
      ON attachment_refs(space_slug, doc_category, doc_name);
  `);

  return _db;
}

// ── Auto-migration from JSON files ────────────────────────────────────────────

/**
 * On first access, scan the config/ directory for existing .json files
 * and import them into the SQLite KV table. Each file becomes one row
 * with the relative path as key. Runs once per process.
 */
function migrateJsonFiles(): void {
  if (_migrated) return;
  _migrated = true;

  const db = getDb();

  // Check if migration already happened (any rows exist)
  const count = db.prepare("SELECT COUNT(*) as c FROM kv").get() as { c: number };
  if (count.c > 0) return;

  // Recursively find all .json files under config/
  const jsonFiles = findJsonFiles(CONFIG_DIR, CONFIG_DIR);
  if (jsonFiles.length === 0) return;

  const insert = db.prepare("INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const { relPath, content } of jsonFiles) {
      insert.run(relPath, content);
    }
  });
  tx();
}

function findJsonFiles(dir: string, root: string): { relPath: string; content: string }[] {
  const results: { relPath: string; content: string }[] = [];
  if (!fsSync.existsSync(dir)) return results;

  const entries = fsSync.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip the db file's directory artifacts
      results.push(...findJsonFiles(full, root));
    } else if (entry.name.endsWith(".json")) {
      try {
        const content = fsSync.readFileSync(full, "utf-8");
        // Validate it's actually JSON
        JSON.parse(content);
        const relPath = path.relative(root, full);
        results.push({ relPath, content });
      } catch {
        // Skip files that aren't valid JSON
      }
    }
  }
  return results;
}

// ── Directory helpers ─────────────────────────────────────────────────────────

export function getConfigDir() {
  return CONFIG_DIR;
}

/** Path to the global content-addressed blobstore (inside config/). */
export function getBlobstoreDir(): string {
  return path.join(CONFIG_DIR, "blobstore");
}

export function getDocsDir() {
  return path.join(getStorageRoot(), "docs");
}

export function getSpaceDir(spaceSlug: string) {
  return path.join(getStorageRoot(), "docs", spaceSlug);
}

export function getCategoryDir(spaceSlug: string, categoryPath: string) {
  return path.join(getStorageRoot(), "docs", spaceSlug, categoryPath);
}

export function getAttachmentsDir(spaceSlug: string, categoryPath: string) {
  return path.join(getStorageRoot(), "docs", spaceSlug, categoryPath, "attachments");
}

export function getArchiveDir() {
  return path.join(getStorageRoot(), "archive");
}

export function getArchiveSpaceDir(spaceSlug: string) {
  return path.join(getStorageRoot(), "archive", spaceSlug);
}

export function getArchiveCategoryDir(spaceSlug: string, categoryPath: string) {
  return path.join(getStorageRoot(), "archive", spaceSlug, categoryPath);
}

export function getHistoryDir(spaceSlug: string, categoryPath: string, docName: string) {
  return path.join(getStorageRoot(), "history", spaceSlug, categoryPath, docName);
}

export function getTrashDir() {
  return path.join(getStorageRoot(), "trash");
}

export function getDocStatusFilePath(spaceSlug: string) {
  return path.join(getStorageRoot(), "docs", spaceSlug, ".doc-status.json");
}

export async function readDocStatusMap(spaceSlug: string): Promise<import("./types").DocStatusMap> {
  const file = getDocStatusFilePath(spaceSlug);
  try {
    const data = await fs.readFile(file, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function writeDocStatusMap(
  spaceSlug: string,
  map: import("./types").DocStatusMap,
): Promise<void> {
  const file = getDocStatusFilePath(spaceSlug);
  await fs.writeFile(file, JSON.stringify(map, null, 2), "utf-8");
}

export function getCustomizationPath(spaceSlug: string) {
  return path.join(getStorageRoot(), "docs", spaceSlug, ".customization.json");
}

export async function readCustomization(spaceSlug: string): Promise<import("./types").SpaceCustomization> {
  const file = getCustomizationPath(spaceSlug);
  try {
    const data = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(data);
    return {
      docIcons: parsed.docIcons || {},
      docColors: parsed.docColors || {},
      categoryIcons: parsed.categoryIcons || {},
      categoryColors: parsed.categoryColors || {},
      tagColors: parsed.tagColors || {},
    };
  } catch {
    return { docIcons: {}, docColors: {}, categoryIcons: {}, categoryColors: {}, tagColors: {} };
  }
}

export async function writeCustomization(
  spaceSlug: string,
  data: import("./types").SpaceCustomization,
): Promise<void> {
  const file = getCustomizationPath(spaceSlug);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function ensureConfigDir() {
  await ensureDir(CONFIG_DIR);
}

// ── SQLite-backed JSON config read/write ──────────────────────────────────────

export async function readJsonConfig<T>(filename: string, defaultValue: T): Promise<T> {
  migrateJsonFiles();
  const db = getDb();
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(filename) as
    | { value: string }
    | undefined;
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeJsonConfig<T>(filename: string, data: T) {
  migrateJsonFiles();
  const db = getDb();
  const json = JSON.stringify(data, null, 2);
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    filename,
    json,
  );
}
