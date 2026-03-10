/**
 * Space data scan functions shared between individual API routes and the
 * combined /api/spaces/[slug]/init endpoint.
 *
 * Keeping these here (rather than inline in route files) means:
 *   1. The init route can run all scans in a single Promise.all.
 *   2. No code duplication across route files.
 */

import fs from "fs/promises";
import path from "path";
import { getCategoryDir, getSpaceDir } from "./config";
import { parseFrontmatter } from "./frontmatter";
import { extractHashtags, buildTagsIndex } from "./tags";
import { fromSafeB64 } from "./base64";
import type { Category, DocFile, TagsIndex, TemplateInfo, TplField } from "./types";

const EXCLUDED_DIRS = ["attachments", ".git", ".DS_Store", ".databases"];

// ── Docs ───────────────────────────────────────────────────────────────────────

export async function scanDocs(
  dir: string,
  space: string,
  categoryPath = ""
): Promise<DocFile[]> {
  const docs: DocFile[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return docs;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      docs.push({ name: entry.name.replace(/\.md$/, ""), filename: entry.name, category: categoryPath, space });
    } else if (entry.isFile() && entry.name.endsWith(".mdt")) {
      docs.push({ name: entry.name.replace(/\.mdt$/, ""), filename: entry.name, category: categoryPath, space, isTemplate: true });
    } else if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const sub = await scanDocs(path.join(dir, entry.name), space, subPath);
      docs.push(...sub);
    }
  }
  return docs;
}

export async function scanDocsInCategory(slug: string, category: string): Promise<DocFile[]> {
  const catDir = getCategoryDir(slug, category);
  const all = await scanDocs(catDir, slug, category);
  return all.filter((d) => d.category === category);
}

// ── Categories ─────────────────────────────────────────────────────────────────

export async function buildCategoryTree(
  dir: string,
  basePath = "",
  level = 0
): Promise<Category[]> {
  const categories: Category[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return categories;
  }
  const dirs = entries
    .filter((e) => e.isDirectory() && !EXCLUDED_DIRS.includes(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const d of dirs) {
    const catPath = basePath ? `${basePath}/${d.name}` : d.name;
    const catDir = path.join(dir, d.name);
    const files = await fs.readdir(catDir, { withFileTypes: true });
    const count = files.filter((f) => f.isFile() && f.name.endsWith(".md")).length;
    categories.push({ name: d.name, path: catPath, parent: basePath || undefined, level, count });
    const subCats = await buildCategoryTree(catDir, catPath, level + 1);
    categories.push(...subCats);
  }
  return categories;
}

// ── Tags ───────────────────────────────────────────────────────────────────────

async function scanDocsForTags(
  dir: string,
  categoryPath = ""
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
      const fmTags = ((metadata.tags as string[]) || []).map((t) => t.toLowerCase());
      const allTags = [...new Set([...inlineTags, ...fmTags])];
      if (allTags.length > 0) results.push({ name: docName, tags: allTags });
    } else if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const sub = await scanDocsForTags(path.join(dir, entry.name), subPath);
      results.push(...sub);
    }
  }
  return results;
}

export async function getTagsIndex(slug: string): Promise<TagsIndex> {
  const spaceDir = getSpaceDir(slug);
  const docs = await scanDocsForTags(spaceDir);
  return buildTagsIndex(docs);
}

// ── Templates ──────────────────────────────────────────────────────────────────

function extractFields(content: string): TplField[] {
  const fields: TplField[] = [];
  const seen = new Set<string>();
  const regex = /data-tpl-field="([A-Za-z0-9+/=]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const field = fromSafeB64(match[1]) as TplField;
      if (field?.name && !seen.has(field.name)) { seen.add(field.name); fields.push(field); }
    } catch { /* skip malformed */ }
  }
  return fields;
}

export async function scanTemplates(
  dir: string,
  space: string,
  categoryPath = ""
): Promise<TemplateInfo[]> {
  const templates: TemplateInfo[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return templates;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".mdt")) {
      const name = entry.name.replace(/\.mdt$/, "");
      try {
        const content = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const fields = extractFields(content);
        templates.push({ name, filename: entry.name, category: categoryPath, space, fields });
      } catch { /* skip unreadable */ }
    } else if (entry.isDirectory() && !["attachments", ".git", ".DS_Store"].includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const sub = await scanTemplates(path.join(dir, entry.name), space, subPath);
      templates.push(...sub);
    }
  }
  return templates;
}
