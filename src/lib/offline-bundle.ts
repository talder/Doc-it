/**
 * Offline Bundle Generator
 *
 * Builds a self-decrypting HTML file inside a ZIP archive containing all
 * documents and databases from the user's accessible spaces.
 *
 * Encryption: AES-256-GCM / PBKDF2(SHA-256, 100 000 iterations)
 * Archive:    ZIP STORE (no compression; pure Node.js, no extra deps)
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { marked } from "marked";
import { getAccessibleSpaces } from "./permissions";
import { listDatabases } from "./database";
import { parseFrontmatter } from "./frontmatter";
import { getSpaceDir, getAttachmentsDir } from "./config";
import { buildReaderHtml, type BundleMeta } from "./offline-reader-template";
import type { User } from "./types";

// Callout blockquote renderer for the offline bundle (> [!info] etc.)
const _CALLOUT_TYPES = new Set(["info", "warning", "success", "danger"]);
const _CALLOUT_ICON: Record<string, string> = {
  info: "&#8505;", warning: "&#9888;", success: "&#10003;", danger: "&#9888;",
};
marked.use({
  renderer: {
    blockquote({ tokens }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (this as any).parser.parse(tokens) as string;
      const match = inner.match(/^\s*<p>\s*\[!(\w+)\]/i);
      if (match && _CALLOUT_TYPES.has(match[1].toLowerCase())) {
        const type = match[1].toLowerCase();
        const body = inner.replace(/^\s*<p>\s*\[!\w+\]\s*(<br\s*\/?>)?\s*/, "<p>").trim();
        return `<div class="ob-callout ob-callout-${type}"><span class="ob-callout-icon">${_CALLOUT_ICON[type]}</span><div class="ob-callout-body">${body || "<p></p>"}</div></div>\n`;
      }
      return `<blockquote>${inner}</blockquote>\n`;
    },
  },
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface OfflineDoc {
  name: string;
  category: string;
  html: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  tags?: string[];
}

interface OfflineCategory {
  name: string;
  path: string;
  parent?: string;
  level: number;
}

interface OfflineDb {
  id: string;
  title: string;
  columns: unknown[];
  rows: unknown[];
  updatedAt: string;
}

interface OfflineSpace {
  slug: string;
  name: string;
  categories: OfflineCategory[];
  documents: OfflineDoc[];
  databases: OfflineDb[];
}

interface OfflinePayload {
  generatedAt: string;
  generatedBy: string;
  spaces: OfflineSpace[];
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateOfflineBundle(
  user: User,
  passphrase: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const spaces = await getAccessibleSpaces(user);

  const offlineSpaces: OfflineSpace[] = [];
  let totalDocs = 0;
  let totalDbs = 0;

  // Collect all attachments/PDFs here so they can be encrypted separately
  // (keeps the main payload small → fast unlock in the browser)
  const attachments = new Map<string, { name: string; data: Buffer }>();

  for (const space of spaces) {
    const spaceDir = getSpaceDir(space.slug);
    const categories = await scanCategories(spaceDir);
    const documents = await scanAndRenderDocs(space.slug, spaceDir, "", [], attachments);
    const databases = await loadDatabases(space.slug);

    totalDocs += documents.length;
    totalDbs += databases.length;

    offlineSpaces.push({
      slug: space.slug,
      name: space.name,
      categories,
      documents,
      databases,
    });
  }

  const now = new Date();
  const payload: OfflinePayload = {
    generatedAt: now.toISOString(),
    generatedBy: user.username,
    spaces: offlineSpaces,
  };

  const enc = encryptBundle(JSON.stringify(payload), attachments, passphrase);

  const dateStr = now.toISOString().slice(0, 10);
  const htmlFilename = `doc-it-offline-${user.username}-${dateStr}.html`;
  const zipFilename = `doc-it-offline-${user.username}-${dateStr}.zip`;

  const meta: BundleMeta = {
    generatedAt: now.toISOString(),
    generatedBy: user.username,
    spacesCount: spaces.length,
    docsCount: totalDocs,
    dbsCount: totalDbs,
    filename: htmlFilename,
  };

  const htmlContent = buildReaderHtml(enc.mainEnc, enc.attachmentMeta, meta);
  const readmeContent = buildReadme(meta);

  const zipBuffer = createZip([
    { name: htmlFilename, data: Buffer.from(htmlContent, "utf-8") },
    { name: "README.txt", data: Buffer.from(readmeContent, "utf-8") },
  ]);

  return { buffer: zipBuffer, filename: zipFilename };
}

// ── Directory scanners ────────────────────────────────────────────────────────

const EXCLUDED = new Set([
  "attachments",
  ".git",
  ".DS_Store",
  ".databases",
  ".doc-status.json",
  ".customization.json",
  ".tags.json",
]);

async function scanCategories(
  dir: string,
  basePath = "",
  level = 0,
): Promise<OfflineCategory[]> {
  const categories: OfflineCategory[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return categories;
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !EXCLUDED.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const d of dirs) {
    const catPath = basePath ? `${basePath}/${d.name}` : d.name;
    categories.push({
      name: d.name,
      path: catPath,
      parent: basePath || undefined,
      level,
    });
    const sub = await scanCategories(path.join(dir, d.name), catPath, level + 1);
    categories.push(...sub);
  }
  return categories;
}

async function scanAndRenderDocs(
  spaceSlug: string,
  dir: string,
  categoryPath = "",
  acc: OfflineDoc[] = [],
  attachments: Map<string, { name: string; data: Buffer }> = new Map(),
): Promise<OfflineDoc[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue;

    if (entry.isFile() && entry.name.endsWith(".md")) {
      const docName = entry.name.slice(0, -3);
      try {
        const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const { body, metadata } = parseFrontmatter(raw);
        let html = await marked(body);
        html = await embedImages(html, spaceSlug, categoryPath);
        html = await resolveSpecialNodes(html, spaceSlug, categoryPath, attachments);
        acc.push({
          name: docName,
          category: categoryPath,
          html,
          createdAt: metadata.createdAt,
          createdBy: metadata.createdBy,
          updatedAt: metadata.updatedAt,
          updatedBy: metadata.updatedBy,
          tags: metadata.tags,
        });
      } catch {
        // skip unreadable files silently
      }
    } else if (entry.isDirectory() && !EXCLUDED.has(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      await scanAndRenderDocs(spaceSlug, path.join(dir, entry.name), subPath, acc, attachments);
    }
  }
  return acc;
}

// ── Special node resolver (draw.io / attachments / PDF embeds) ───────────────

function _escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _escAttr(s: string): string {
  return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function resolveSpecialNodes(
  html: string,
  spaceSlug: string,
  category: string,
  attachments: Map<string, { name: string; data: Buffer }>,
): Promise<string> {
  let m: RegExpExecArray | null;

  // 0. Excalidraw: <!-- excalidraw:{drawingId} -->
  const excRe = /<!--\s*excalidraw:([\w-]+)\s*-->/g;
  const excMatches: { full: string; id: string }[] = [];
  while ((m = excRe.exec(html)) !== null) excMatches.push({ full: m[0], id: m[1] });
  for (const { full, id } of excMatches) {
    const svgPath = path.join(getSpaceDir(spaceSlug), ".excalidraw", `${id}.svg`);
    let replacement: string;
    try {
      const data = await fs.readFile(svgPath);
      replacement = `<img src="data:image/svg+xml;base64,${data.toString("base64")}" class="ob-drawio" alt="Excalidraw drawing" />`;
    } catch {
      replacement = `<div class="ob-drawio-placeholder">&#9643; Excalidraw drawing (file unavailable)</div>`;
    }
    html = html.replace(full, replacement);
  }

  // 1. Draw.io WITH embedded SVG: <!-- drawio:{b64-xml}|{b64-svg} -->
  html = html.replace(
    /<!--\s*drawio:([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)\s*-->/g,
    (_match, _xmlB64, svgB64) =>
      `<img src="data:image/svg+xml;base64,${svgB64}" class="ob-drawio" alt="Draw.io diagram" />`,
  );

  // ── 2. Draw.io WITHOUT SVG: <!-- drawio:{b64-xml} --> ────────────────────────
  html = html.replace(
    /<!--\s*drawio:([A-Za-z0-9+/=]+)\s*-->/g,
    () =>
      `<div class="ob-drawio-placeholder">&#9643; Draw.io diagram (no SVG preview available)</div>`,
  );

  // ── 3. Attachments: <!-- attachment:{b64-json} --> ───────────────────────────
  const attachRe = /<!--\s*attachment:([A-Za-z0-9+/=]+)\s*-->/g;
  const attachMatches: { full: string; b64: string }[] = [];
  while ((m = attachRe.exec(html)) !== null) attachMatches.push({ full: m[0], b64: m[1] });

  for (const { full, b64 } of attachMatches) {
    let replacement: string;
    try {
      const attrs = JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as {
        filename: string; originalName: string; mimeType: string; size: number;
        category: string; spaceSlug: string; url: string;
      };
      const cat = attrs.category || category;
      const slug = attrs.spaceSlug || spaceSlug;
      const filePath = path.join(getAttachmentsDir(slug, cat), attrs.filename);
      const displayName = attrs.originalName || attrs.filename;
      const sizeStr = attrs.size ? ` &middot; ${_formatSize(attrs.size)}` : "";

      let dlBtn: string;
      try {
        const data = await fs.readFile(filePath);
        const attId = `att-${crypto.randomBytes(8).toString("hex")}`;
        attachments.set(attId, { name: displayName, data });
        dlBtn = `<button class="ob-att-dl" onclick="decryptDownload('${attId}',this)">&#11123; Download</button>`;
      } catch {
        dlBtn = `<span class="ob-att-na">File unavailable offline</span>`;
      }

      replacement =
        `<div class="ob-attachment">` +
        `<span class="ob-att-icon">&#128206;</span>` +
        `<span class="ob-att-name">${_escHtml(displayName)}${sizeStr}</span>` +
        dlBtn +
        `</div>`;
    } catch {
      replacement = `<div class="ob-attachment"><span class="ob-att-icon">&#128206;</span><span class="ob-att-name">Attachment</span></div>`;
    }
    html = html.replace(full, replacement);
  }

  // ── 4. PDF embeds: <!-- pdf-embed:{b64-json} --> ─────────────────────────────
  const pdfRe = /<!--\s*pdf-embed:([A-Za-z0-9+/=]+)\s*-->/g;
  const pdfMatches: { full: string; b64: string }[] = [];
  while ((m = pdfRe.exec(html)) !== null) pdfMatches.push({ full: m[0], b64: m[1] });

  for (const { full, b64 } of pdfMatches) {
    let replacement: string;
    try {
      const attrs = JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as {
        filename: string; originalName: string; category: string;
        spaceSlug: string; url: string;
      };
      const cat = attrs.category || category;
      const slug = attrs.spaceSlug || spaceSlug;
      const filePath = path.join(getAttachmentsDir(slug, cat), attrs.filename);
      const displayName = attrs.originalName || attrs.filename;

      let dlBtn: string;
      try {
        const data = await fs.readFile(filePath);
        const attId = `att-${crypto.randomBytes(8).toString("hex")}`;
        attachments.set(attId, { name: displayName, data });
        dlBtn = `<button class="ob-att-dl" onclick="decryptDownload('${attId}',this)">&#11123; Download PDF</button>`;
      } catch {
        dlBtn = `<span class="ob-att-na">File unavailable offline</span>`;
      }
      replacement =
        `<div class="ob-pdf">` +
        `<span class="ob-pdf-icon">&#128196;</span>` +
        `<span class="ob-pdf-name">${_escHtml(displayName)}</span>` +
        dlBtn +
        `</div>`;
    } catch {
      replacement = `<div class="ob-pdf"><span>PDF embed</span></div>`;
    }
    html = html.replace(full, replacement);
  }

  // 5. Linked-doc references: <!-- linked-doc:{b64-json} -->
  html = html.replace(
    /<!--\s*linked-doc:([A-Za-z0-9+/=]+)\s*-->/g,
    (_match, b64) => {
      try {
        const a = JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as {
          docName: string; docCategory: string;
        };
        const loc = [a.docCategory, a.docName].filter(Boolean).join(" / ");
        return `<div class="ob-linked-doc">&#128196;&nbsp;<strong>${_escHtml(a.docName || "Linked document")}</strong>&nbsp;<span class="ob-att-na">${_escHtml(loc)}</span></div>`;
      } catch {
        return `<div class="ob-linked-doc">&#128196; Linked document</div>`;
      }
    },
  );

  // 6. Inline database blocks: <!-- database:{b64-json} -->
  html = html.replace(
    /<!--\s*database:([A-Za-z0-9+/=]+)\s*-->/g,
    () => `<div class="ob-drawio-placeholder">&#128203;&nbsp;Inline database &mdash; see the Databases section in the sidebar</div>`,
  );

  return html;
}

// ── Image embedding

async function embedImages(
  html: string,
  spaceSlug: string,
  category: string,
): Promise<string> {
  // Match <img src="..."> — handle both single and double quoted src
  const imgRe = /<img([^>]*?)src="([^"]*)"([^>]*?)>/gi;
  const replacements: Array<[string, string]> = [];

  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const [full, pre, src, post] = m;
    const dataUri = await resolveToDataUri(src, spaceSlug, category);
    if (dataUri) {
      replacements.push([full, `<img${pre}src="${dataUri}"${post}>`]);
    }
  }

  for (const [orig, replacement] of replacements) {
    html = html.replace(orig, replacement);
  }
  return html;
}

async function resolveToDataUri(
  src: string,
  spaceSlug: string,
  category: string,
): Promise<string | null> {
  try {
    // /api/spaces/{slug}/attachments/{filename}?category={cat}
    const attachMatch = src.match(/\/api\/spaces\/([^/]+)\/attachments\/([^?#]+)/);
    if (attachMatch) {
      const slug = attachMatch[1];
      const filename = decodeURIComponent(attachMatch[2]);
      const catMatch = src.match(/[?&]category=([^&#]+)/);
      const cat = catMatch ? decodeURIComponent(catMatch[1]) : category;
      const filePath = path.join(getAttachmentsDir(slug, cat), filename);
      const data = await fs.readFile(filePath);
      return `data:${mimeFromExt(filename)};base64,${data.toString("base64")}`;
    }

    // /api/spaces/{slug}/assets/excalidraw/{id}
    const excMatch = src.match(/\/api\/spaces\/([^/]+)\/assets\/excalidraw\/([^?#/]+)/);
    if (excMatch) {
      const slug = excMatch[1];
      const id = excMatch[2];
      const svgPath = path.join(getSpaceDir(slug), ".excalidraw", `${id}.svg`);
      const data = await fs.readFile(svgPath);
      return `data:image/svg+xml;base64,${data.toString("base64")}`;
    }

    // /api/assets/excalidraw/{id}  (global assets)
    const globalExcMatch = src.match(/\/api\/assets\/excalidraw\/([^?#/]+)/);
    if (globalExcMatch) {
      const id = globalExcMatch[1];
      const svgPath = path.join(process.cwd(), "public", "excalidraw", `${id}.svg`);
      const data = await fs.readFile(svgPath);
      return `data:image/svg+xml;base64,${data.toString("base64")}`;
    }

    return null;
  } catch {
    return null; // file missing — leave src as-is
  }
}

function mimeFromExt(filename: string, fallback?: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    // images
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
    ".tiff": "image/tiff",
    // documents
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".md": "text/markdown",
    // office
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    // archives
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".7z": "application/x-7z-compressed",
    // draw.io
    ".drawio": "application/xml",
    ".dio": "application/xml",
    // media
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".webm": "video/webm",
  };
  return map[ext] ?? fallback ?? "application/octet-stream";
}

// ── Database loader ───────────────────────────────────────────────────────────

async function loadDatabases(spaceSlug: string): Promise<OfflineDb[]> {
  const dbs = await listDatabases(spaceSlug);
  return dbs.map((db) => ({
    id: db.id,
    title: db.title,
    columns: db.columns,
    rows: db.rows,
    updatedAt: db.updatedAt,
  }));
}

// ── Encryption (AES-256-GCM / PBKDF2) ────────────────────────────────────────
//
// Main payload wire format : salt(16) | iv(12) | authTag(16) | ciphertext
// Per-attachment format    : iv(12)   | authTag(16) | ciphertext
//   (no salt — attachments share the key derived from the main payload)
//
// Web Crypto API expects ciphertext+authTag concatenated; we split them on the
// server so the client can reassemble correctly before calling subtle.decrypt().

interface EncryptedBundle {
  mainEnc: string;
  attachmentMeta: Record<string, { name: string; enc: string; size: number }>;
}

function encryptBundle(
  mainJson: string,
  rawAttachments: Map<string, { name: string; data: Buffer }>,
  passphrase: string,
): EncryptedBundle {
  // Derive key once — shared between main payload and all attachments
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256");

  // Encrypt main payload (documents, databases, small images only)
  const mainIv = crypto.randomBytes(12);
  const mainCipher = crypto.createCipheriv("aes-256-gcm", key, mainIv);
  const mainCt = Buffer.concat([mainCipher.update(Buffer.from(mainJson, "utf-8")), mainCipher.final()]);
  const mainEnc = Buffer.concat([salt, mainIv, mainCipher.getAuthTag(), mainCt]).toString("base64");

  // Encrypt each attachment individually — browser decrypts on demand
  const attachmentMeta: Record<string, { name: string; enc: string; size: number }> = {};
  for (const [id, att] of rawAttachments) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(att.data), cipher.final()]);
    attachmentMeta[id] = {
      name: att.name,
      enc: Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64"),
      size: att.data.length,
    };
  }

  return { mainEnc, attachmentMeta };
}

// ── README.txt ────────────────────────────────────────────────────────────────

function buildReadme(meta: BundleMeta): string {
  const d = new Date(meta.generatedAt);
  const dateStr = d.toUTCString();
  return [
    "doc-it Offline Bundle",
    "=====================",
    "",
    `Generated : ${dateStr}`,
    `By        : ${meta.generatedBy}`,
    `Spaces    : ${meta.spacesCount}`,
    `Documents : ${meta.docsCount}`,
    `Databases : ${meta.dbsCount}`,
    "",
    "HOW TO USE",
    "----------",
    "1. Unzip this archive to a folder on your computer.",
    `2. Open the file "${meta.filename}" in any modern web browser`,
    "   (Chrome, Firefox, Edge, or Safari — version 2020 or later).",
    "3. Enter the passphrase you set when generating this bundle.",
    "4. Navigate documents using the left sidebar.",
    "   Use the search bar (top-right) to find specific content.",
    "",
    "IMPORTANT",
    "---------",
    "- This bundle is READ-ONLY. No changes can be saved.",
    "- Content reflects a snapshot taken at generation time.",
    "- Keep this file and your passphrase secure.",
    "- The bundle is encrypted with AES-256-GCM (PBKDF2, 100 000 iterations).",
    "  Without the correct passphrase, the content cannot be accessed.",
    "",
    "SUPPORTED BROWSERS",
    "------------------",
    "Any browser supporting the Web Crypto API:",
    "  Chrome 37+  |  Firefox 34+  |  Safari 11+  |  Edge 79+",
    "",
    "NIS2 / COMPLIANCE NOTE",
    "----------------------",
    "This offline bundle was generated for emergency access and",
    "business continuity under NIS2 requirements.",
    "The generation event has been recorded in the doc-it audit log.",
    "",
    "For questions contact your doc-it administrator.",
  ].join("\r\n");
}

// ── Minimal ZIP STORE writer (no external deps) ───────────────────────────────
//
// Uses the ZIP STORE method (compression = 0) for simplicity.
// CRC-32 is computed with a pure-JS implementation.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function dosDateTime(): [number, number] {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

function createZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDirParts: Buffer[] = [];
  const [dosTime, dosDate] = dosDateTime();
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf-8");
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      u16(20),              // version needed
      u16(0),               // flags
      u16(0),               // compression: STORE
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(size),            // compressed size
      u32(size),            // uncompressed size
      u16(nameBuf.length),  // filename length
      u16(0),               // extra field length
      nameBuf,
    ]);

    // Central directory entry
    const cdEntry = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      u16(20),              // version made by
      u16(20),              // version needed
      u16(0),               // flags
      u16(0),               // compression: STORE
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(size),            // compressed size
      u32(size),            // uncompressed size
      u16(nameBuf.length),  // filename length
      u16(0),               // extra field length
      u16(0),               // comment length
      u16(0),               // disk number start
      u16(0),               // internal attributes
      u32(0),               // external attributes
      u32(offset),          // relative offset of local header
      nameBuf,
    ]);

    parts.push(localHeader, file.data);
    centralDirParts.push(cdEntry);
    offset += localHeader.length + size;
  }

  const centralDir = Buffer.concat(centralDirParts);

  // End of central directory record
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
    u16(0),                       // disk number
    u16(0),                       // start disk
    u16(files.length),            // entries on disk
    u16(files.length),            // total entries
    u32(centralDir.length),       // central directory size
    u32(offset),                  // central directory offset
    u16(0),                       // comment length
  ]);

  return Buffer.concat([...parts, centralDir, eocd]);
}
