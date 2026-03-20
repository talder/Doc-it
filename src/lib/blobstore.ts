/**
 * Global content-addressed blobstore.
 *
 * Every unique file is stored once at config/blobstore/{sha256}.
 * Duplicate uploads are detected by comparing SHA-256 hashes.
 * attachment_refs rows record per-upload metadata (original name, space, doc).
 * Blobs are hard-deleted only when their reference count drops to zero.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { getDb, getBlobstoreDir, getDocsDir } from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlobRow {
  sha256: string;
  size: number;
  mime: string;
  text_content: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface AttachmentRefRow {
  id: string;
  sha256: string;
  original_name: string;
  space_slug: string;
  doc_category: string;
  doc_name: string;
  uploaded_by: string;
  created_at: string;
}

export interface MigrationStats {
  processed: number;
  duplicates: number;
  bytesSaved: number;
  errors: number;
  messages: string[];
}

// ── MIME helper ───────────────────────────────────────────────────────────────

export function mimeFromFilename(filename: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".avif": "image/avif",
    ".txt":  "text/plain",
    ".csv":  "text/csv",
    ".md":   "text/markdown",
    ".json": "application/json",
    ".xml":  "application/xml",
    ".zip":  "application/zip",
    ".gz":   "application/gzip",
    ".tar":  "application/x-tar",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":  "application/vnd.ms-excel",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt":  "application/vnd.ms-powerpoint",
    ".mp4":  "video/mp4",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".webm": "video/webm",
  };
  return map[ext] ?? fallback;
}

// ── Core hash ─────────────────────────────────────────────────────────────────

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ── Blob & ref queries ────────────────────────────────────────────────────────

export function findExistingRefs(sha256: string): AttachmentRefRow[] {
  return getDb()
    .prepare("SELECT * FROM attachment_refs WHERE sha256 = ?")
    .all(sha256) as AttachmentRefRow[];
}

export function readRef(id: string): AttachmentRefRow | null {
  return getDb()
    .prepare("SELECT * FROM attachment_refs WHERE id = ?")
    .get(id) as AttachmentRefRow | null;
}

export function getBlob(sha256: string): BlobRow | null {
  return getDb()
    .prepare("SELECT * FROM blobs WHERE sha256 = ?")
    .get(sha256) as BlobRow | null;
}

export async function readBlobBytes(sha256: string): Promise<Buffer> {
  return fs.readFile(path.join(getBlobstoreDir(), sha256));
}

/**
 * Write a blob to disk and register it in the blobs table.
 * No-op if the blob already exists (idempotent).
 */
export async function storeBlob(
  sha256: string,
  buffer: Buffer,
  mime: string,
  uploadedBy: string,
): Promise<void> {
  const blobDir = getBlobstoreDir();
  if (!fsSync.existsSync(blobDir)) {
    await fs.mkdir(blobDir, { recursive: true });
  }

  const blobPath = path.join(blobDir, sha256);
  if (!fsSync.existsSync(blobPath)) {
    await fs.writeFile(blobPath, buffer);
  }

  // Extract text for PDFs (text layer only; no OCR)
  let textContent: string | null = null;
  if (mime === "application/pdf") {
    textContent = (await extractPdfText(buffer)) || null;
  }

  getDb()
    .prepare(`
      INSERT OR IGNORE INTO blobs (sha256, size, mime, text_content, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(sha256, buffer.length, mime, textContent, uploadedBy, new Date().toISOString());
}

/**
 * Create an attachment reference row and return it.
 */
export function createRef(
  id: string,
  sha256: string,
  originalName: string,
  spaceSlug: string,
  docCategory: string,
  docName: string,
  uploadedBy: string,
): AttachmentRefRow {
  const now = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT INTO attachment_refs
        (id, sha256, original_name, space_slug, doc_category, doc_name, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, sha256, originalName, spaceSlug, docCategory, docName, uploadedBy, now);
  return {
    id, sha256, original_name: originalName, space_slug: spaceSlug,
    doc_category: docCategory, doc_name: docName, uploaded_by: uploadedBy, created_at: now,
  };
}

/**
 * Rename ALL existing references for a given sha256 to the chosen name.
 * Called system-wide when a user confirms a name choice on a duplicate upload.
 */
export function updateAllRefsName(sha256: string, newName: string): void {
  getDb()
    .prepare("UPDATE attachment_refs SET original_name = ? WHERE sha256 = ?")
    .run(newName, sha256);
}

/**
 * Remove a reference. If no other references point to the same blob,
 * also delete the physical blob file and its blob row.
 */
export function deleteRefAndMaybeBlob(id: string): void {
  const db = getDb();
  const ref = readRef(id);
  if (!ref) return;

  db.prepare("DELETE FROM attachment_refs WHERE id = ?").run(id);

  const { c } = db
    .prepare("SELECT COUNT(*) as c FROM attachment_refs WHERE sha256 = ?")
    .get(ref.sha256) as { c: number };

  if (c === 0) {
    const blobPath = path.join(getBlobstoreDir(), ref.sha256);
    try { fsSync.rmSync(blobPath, { force: true }); } catch { /* gone */ }
    db.prepare("DELETE FROM blobs WHERE sha256 = ?").run(ref.sha256);
  }
}

// ── PDF text extraction ───────────────────────────────────────────────────────

/**
 * Extract selectable text from a PDF using pdfjs-dist (text layer only).
 * Scanned/image PDFs return an empty string — OCR is out of scope.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to keep this out of the Edge/client bundle
    const pdfjs = await import("pdfjs-dist");
    // Disable worker — we run synchronously in Node.js
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } })
      .GlobalWorkerOptions.workerSrc = "";

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    } as Parameters<typeof pdfjs.getDocument>[0]);

    const pdf = await loadingTask.promise;
    const parts: string[] = [];

    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ");
      parts.push(text);
    }

    return parts.join("\n").trim().slice(0, 500_000); // 500 KB cap
  } catch {
    return "";
  }
}

// ── Aggressive migration ──────────────────────────────────────────────────────

const SKIP_DIRS = new Set([".git", ".databases", ".DS_Store", "trash"]);

/**
 * Walk all legacy attachment directories, hash each file, register it in the
 * blobstore, and delete the original (aggressive mode).
 *
 * Uses the stored filename as the ref ID so that all existing TipTap nodes
 * — which embed the old filename in their attrs — continue to resolve
 * correctly via the download route's blobstore-first lookup.
 */
export async function migrateAttachmentsAggressive(
  onProgress: (msg: string) => void = () => {},
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    processed: 0, duplicates: 0, bytesSaved: 0, errors: 0, messages: [],
  };
  const addMsg = (msg: string) => { stats.messages.push(msg); onProgress(msg); };

  const docsRoot = getDocsDir();
  addMsg(`Starting aggressive blobstore migration from ${docsRoot}`);

  let spaces: string[];
  try {
    spaces = (await fs.readdir(docsRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    addMsg("Could not read docs directory — nothing to migrate.");
    return stats;
  }

  for (const spaceSlug of spaces) {
    addMsg(`Space: ${spaceSlug}`);
    await _walkAndMigrate(
      path.join(docsRoot, spaceSlug), spaceSlug, "", stats, addMsg,
    );
  }

  addMsg(
    `Done — ${stats.processed} migrated, ${stats.duplicates} duplicates, ` +
    `${(stats.bytesSaved / 1_048_576).toFixed(1)} MB saved, ${stats.errors} errors`,
  );
  return stats;
}

async function _walkAndMigrate(
  dir: string,
  spaceSlug: string,
  categoryPath: string,
  stats: MigrationStats,
  addMsg: (m: string) => void,
): Promise<void> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    if (!entry.isDirectory()) continue;

    if (entry.name === "attachments") {
      await _migrateAttDir(
        path.join(dir, "attachments"), spaceSlug, categoryPath, stats, addMsg,
      );
    } else {
      const sub = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      await _walkAndMigrate(path.join(dir, entry.name), spaceSlug, sub, stats, addMsg);
    }
  }
}

async function _migrateAttDir(
  attDir: string,
  spaceSlug: string,
  categoryPath: string,
  stats: MigrationStats,
  addMsg: (m: string) => void,
): Promise<void> {
  let files: string[];
  try {
    files = (await fs.readdir(attDir, { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch { return; }

  const db = getDb();

  for (const filename of files) {
    const filePath = path.join(attDir, filename);
    try {
      const buffer = await fs.readFile(filePath);
      const sha256 = hashBuffer(buffer);
      const mime = mimeFromFilename(filename);

      const existing = db
        .prepare("SELECT sha256 FROM blobs WHERE sha256 = ?")
        .get(sha256) as { sha256: string } | undefined;

      if (existing) {
        stats.duplicates++;
        stats.bytesSaved += buffer.length;
        addMsg(`Dup: ${spaceSlug}/${categoryPath}/attachments/${filename}`);
      } else {
        await storeBlob(sha256, buffer, mime, "migration");
      }

      // Use the stored filename as the ref ID — preserves existing TipTap node URLs
      const refExists = db
        .prepare("SELECT id FROM attachment_refs WHERE id = ?")
        .get(filename) as { id: string } | undefined;

      if (!refExists) {
        // Strip the 8-char hex shortId prefix added at upload time
        const originalName = filename.replace(/^[0-9a-f]{8}-/, "");
        createRef(filename, sha256, originalName, spaceSlug, categoryPath, "_migrated", "migration");
      }

      // Aggressive: remove the legacy file now that the blob is safe
      await fs.unlink(filePath);
      stats.processed++;
    } catch (err) {
      stats.errors++;
      addMsg(`Error: ${filePath} — ${String(err)}`);
    }
  }
}
