import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, readCustomization, writeCustomization } from "@/lib/config";
import { extractHashtags, buildTagsIndex, normalizeTag } from "@/lib/tags";
import { parseFrontmatter, stringifyFrontmatter } from "@/lib/frontmatter";
import { invalidateSpaceCache } from "@/lib/space-cache";
import { listEnhancedTablesMeta, listEnhancedTables, readEnhancedTable, writeEnhancedTable, getEnhancedTableDir } from "@/lib/enhanced-table";
import type { EnhancedTable } from "@/lib/types";

const EXCLUDED = ["attachments", ".git", ".DS_Store"];

type Params = { params: Promise<{ slug: string }> };

async function scanDocsForTags(
  dir: string,
  categoryPath: string = ""
): Promise<{ name: string; tags: string[] }[]> {
  const results: { name: string; tags: string[] }[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
      const { body, metadata } = parseFrontmatter(raw);
      const docName = `${categoryPath ? categoryPath + "/" : ""}${entry.name.replace(/\.md$/, "")}`;
      const inlineTags = extractHashtags(body);
      const fmTags = (metadata.tags || []).map((t) => t.toLowerCase());
      const allTags = [...new Set([...inlineTags, ...fmTags])];
      if (allTags.length > 0) {
        results.push({ name: docName, tags: allTags });
      }
    } else if (entry.isDirectory() && !EXCLUDED.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const subResults = await scanDocsForTags(path.join(dir, entry.name), subPath);
      results.push(...subResults);
    }
  }

  return results;
}

/** Scan enhanced tables for tags and return as { name, tags } entries. */
async function scanDbsForTags(slug: string): Promise<{ name: string; tags: string[] }[]> {
  const dbs = await listEnhancedTablesMeta(slug);
  return dbs
    .filter((db) => db.tags && db.tags.length > 0)
    .map((db) => ({ name: `[db] ${db.title}`, tags: db.tags!.map((t) => t.toLowerCase()) }));
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const docs = await scanDocsForTags(spaceDir);
  const dbDocs = await scanDbsForTags(slug);
  const tagsIndex = buildTagsIndex([...docs, ...dbDocs]);

  return NextResponse.json(tagsIndex);
}

// POST: force reindex all tags (same logic, explicit trigger)
export async function POST(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const docs = await scanDocsForTags(spaceDir);
  const dbDocs = await scanDbsForTags(slug);
  const tagsIndex = buildTagsIndex([...docs, ...dbDocs]);

  return NextResponse.json(tagsIndex);
}

// ── Helpers for rename / delete ──────────────────────────────────────────────

const EXCLUDED_DIRS = ["attachments", ".git", ".DS_Store", ".databases"];

async function walkMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    } else if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
      results.push(...(await walkMdFiles(full)));
    }
  }
  return results;
}

function replaceTagInBody(body: string, oldTag: string, newTag: string | null): string {
  let result = body;
  // Replace data-tag="oldTag" attributes
  result = result.replace(
    new RegExp(`data-tag="${escapeRegex(oldTag)}"`, "g"),
    newTag ? `data-tag="${newTag}"` : "",
  );
  // Replace <span data-tag="oldTag">#oldTag</span> entirely when deleting
  if (!newTag) {
    result = result.replace(
      new RegExp(`<span\\s+data-tag="${escapeRegex(oldTag)}">[^<]*</span>`, "g"),
      "",
    );
  } else {
    // Update the display text inside tag spans
    result = result.replace(
      new RegExp(`(<span\\s+data-tag="${escapeRegex(newTag)}">)#${escapeRegex(oldTag)}(</span>)`, "g"),
      `$1#${newTag}$2`,
    );
  }
  // Replace standalone #oldTag in text (word boundary)
  const hashPattern = new RegExp(`(^|[\\s(])#${escapeRegex(oldTag)}(?=[\\s.,;:!?)\\]\\n]|$)`, "gm");
  result = result.replace(hashPattern, newTag ? `$1#${newTag}` : "$1");
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// PATCH: rename a tag across all documents
export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { oldName, newName } = await req.json();
  if (!oldName || !newName) {
    return NextResponse.json({ error: "oldName and newName required" }, { status: 400 });
  }
  const oldNorm = normalizeTag(oldName);
  const newNorm = normalizeTag(newName);
  if (!oldNorm || !newNorm || oldNorm === newNorm) {
    return NextResponse.json({ error: "Invalid tag names" }, { status: 400 });
  }

  const spaceDir = getSpaceDir(slug);
  const files = await walkMdFiles(spaceDir);
  let updated = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, "utf-8");
    const { body, metadata } = parseFrontmatter(raw);
    let changed = false;

    // Update frontmatter tags
    if (metadata.tags) {
      const idx = metadata.tags.indexOf(oldNorm);
      if (idx !== -1) {
        metadata.tags[idx] = newNorm;
        // Deduplicate
        metadata.tags = [...new Set(metadata.tags)];
        changed = true;
      }
    }

    // Update inline tags in body
    const newBody = replaceTagInBody(body, oldNorm, newNorm);
    if (newBody !== body) changed = true;

    if (changed) {
      await fs.writeFile(file, stringifyFrontmatter(newBody, metadata), "utf-8");
      updated++;
    }
  }

  // Rename tag in enhanced tables
  const dbs = await listEnhancedTables(slug);
  for (const db of dbs) {
    if (db.tags && db.tags.includes(oldNorm)) {
      db.tags = [...new Set(db.tags.map((t) => t === oldNorm ? newNorm : t))];
      await writeEnhancedTable(slug, db.id, db);
      updated++;
    }
  }

  // Move tag color
  const cust = await readCustomization(slug);
  if (cust.tagColors[oldNorm]) {
    cust.tagColors[newNorm] = cust.tagColors[oldNorm];
    delete cust.tagColors[oldNorm];
    await writeCustomization(slug, cust);
  }

  invalidateSpaceCache(slug);
  return NextResponse.json({ ok: true, updated });
}

// DELETE: remove a tag from all documents and enhanced tables
export async function DELETE(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { tagName } = await req.json();
  if (!tagName) {
    return NextResponse.json({ error: "tagName required" }, { status: 400 });
  }
  const norm = normalizeTag(tagName);
  if (!norm) {
    return NextResponse.json({ error: "Invalid tag name" }, { status: 400 });
  }

  const spaceDir = getSpaceDir(slug);
  const files = await walkMdFiles(spaceDir);
  let updated = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, "utf-8");
    const { body, metadata } = parseFrontmatter(raw);
    let changed = false;

    // Remove from frontmatter tags
    if (metadata.tags) {
      const before = metadata.tags.length;
      metadata.tags = metadata.tags.filter((t) => t !== norm);
      if (metadata.tags.length !== before) changed = true;
      if (metadata.tags.length === 0) delete metadata.tags;
    }

    // Remove inline tags from body
    const newBody = replaceTagInBody(body, norm, null);
    if (newBody !== body) changed = true;

    if (changed) {
      await fs.writeFile(file, stringifyFrontmatter(newBody, metadata), "utf-8");
      updated++;
    }
  }

  // Remove tag from enhanced tables
  const dbs = await listEnhancedTables(slug);
  for (const db of dbs) {
    if (db.tags && db.tags.includes(norm)) {
      db.tags = db.tags.filter((t) => t !== norm);
      if (db.tags.length === 0) delete db.tags;
      await writeEnhancedTable(slug, db.id, db);
      updated++;
    }
  }

  // Remove tag color
  const cust = await readCustomization(slug);
  if (cust.tagColors[norm]) {
    delete cust.tagColors[norm];
    await writeCustomization(slug, cust);
  }

  invalidateSpaceCache(slug);
  return NextResponse.json({ ok: true, updated });
}
