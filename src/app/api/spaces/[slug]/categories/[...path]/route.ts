import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, getArchiveCategoryDir, getTrashDir, ensureDir } from "@/lib/config";
import { invalidateSpaceCache } from "@/lib/space-cache";
import { auditLog } from "@/lib/audit";
import { parseFrontmatter } from "@/lib/frontmatter";
import { listEnhancedTables } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string; path: string[] }> };

// ── Category details (GET) ──────────────────────────────────────────────────

const EXCLUDED_SCAN = ["attachments", ".git", ".DS_Store", ".databases"];

interface DocDetail {
  name: string;
  category: string;
  tags: string[];
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  isTemplate?: boolean;
}

async function scanDocsInDir(
  dir: string,
  categoryPath: string,
): Promise<DocDetail[]> {
  const docs: DocDetail[] = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return docs; }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const isMd = entry.name.endsWith(".md");
    const isMdt = entry.name.endsWith(".mdt");
    if (!isMd && !isMdt) continue;

    const name = entry.name.replace(/\.(md|mdt)$/, "");
    const doc: DocDetail = { name, category: categoryPath, tags: [], isTemplate: isMdt || undefined };

    try {
      const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
      const { metadata } = parseFrontmatter(raw);
      doc.tags = metadata.tags || [];
      doc.createdBy = metadata.createdBy;
      doc.createdAt = metadata.createdAt;
      doc.updatedAt = metadata.updatedAt;
      doc.updatedBy = metadata.updatedBy;
    } catch { /* skip unreadable */ }

    docs.push(doc);
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

async function countDocsRecursive(dir: string): Promise<number> {
  let count = 0;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return 0; }
  for (const e of entries) {
    if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".mdt"))) count++;
    else if (e.isDirectory() && !EXCLUDED_SCAN.includes(e.name)) count += await countDocsRecursive(path.join(dir, e.name));
  }
  return count;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug, path: pathParts } = await params;
  const categoryPath = pathParts.join("/");

  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const spaceDir = getSpaceDir(slug);
  const catDir = path.join(spaceDir, categoryPath);

  try {
    const stat = await fs.stat(catDir);
    if (!stat.isDirectory()) throw new Error();
  } catch {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Direct docs
  const docs = await scanDocsInDir(catDir, categoryPath);

  // Subcategories with doc counts + their direct docs
  const subCategories: { name: string; path: string; docCount: number }[] = [];
  const subDocs: Record<string, DocDetail[]> = {};

  let dirEntries: import("fs").Dirent[] = [];
  try { dirEntries = await fs.readdir(catDir, { withFileTypes: true }); }
  catch { dirEntries = []; }

  const subDirs = dirEntries
    .filter((e) => e.isDirectory() && !EXCLUDED_SCAN.includes(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const sub of subDirs) {
    const subPath = `${categoryPath}/${sub.name}`;
    const subDir = path.join(catDir, sub.name);
    const docCount = await countDocsRecursive(subDir);
    subCategories.push({ name: sub.name, path: subPath, docCount });
    subDocs[subPath] = await scanDocsInDir(subDir, subPath);
  }

  // Enhanced tables
  const allDbs = await listEnhancedTables(slug);
  const databases = allDbs.map((db) => ({
    id: db.id,
    title: db.title,
    tags: db.tags || [],
    rowCount: Array.isArray(db.rows) ? db.rows.length : 0,
    createdAt: db.createdAt,
    createdBy: db.createdBy,
  }));

  let totalDocs = docs.length;
  for (const sc of subCategories) totalDocs += sc.docCount;

  return NextResponse.json({
    category: {
      name: categoryPath.split("/").pop() || categoryPath,
      path: categoryPath,
      totalDocs,
      subCategoryCount: subCategories.length,
      databaseCount: databases.length,
    },
    docs,
    subCategories,
    subDocs,
    databases,
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, path: pathParts } = await params;
  const categoryPath = pathParts.join("/");

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { newName } = await request.json();
  if (!newName) return NextResponse.json({ error: "New name required" }, { status: 400 });

  const safeName = newName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!safeName) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const spaceDir = getSpaceDir(slug);
  const oldDir = path.join(spaceDir, categoryPath);
  const parentDir = path.dirname(oldDir);
  const newDir = path.join(parentDir, safeName);

  try {
    await fs.access(oldDir);
  } catch {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  try {
    await fs.access(newDir);
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  } catch {
    // Good, doesn't exist
  }

  await fs.rename(oldDir, newDir);
  invalidateSpaceCache(slug);

  const parentPath = pathParts.slice(0, -1).join("/");
  const newPath = parentPath ? `${parentPath}/${safeName}` : safeName;

  return NextResponse.json({ name: safeName, path: newPath });
}

const EXCLUDED_DIRS = ["attachments", ".git", ".DS_Store", ".databases"];

interface TrashEntry {
  id: string;
  name: string;
  category: string;
  filename: string;
  deletedBy: string;
  deletedAt: string;
  isTemplate?: boolean;
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { slug, path: pathParts } = await params;
  const categoryPath = pathParts.join("/");

  let deleter: { username: string };
  try {
    ({ user: deleter } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const catDir = path.join(spaceDir, categoryPath);

  try {
    await fs.access(catDir);
  } catch {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Soft-delete: walk the category tree and move every doc to the trash
  const trashDir = path.join(getTrashDir(), slug);
  await ensureDir(trashDir);
  const manifestPath = path.join(trashDir, "manifest.json");
  let manifest: { items: TrashEntry[] } = { items: [] };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  } catch {}

  const now = new Date().toISOString();

  async function trashDocsInDir(dir: string, relCatPath: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdt"))) {
        const filePath = path.join(dir, entry.name);
        const docName = entry.name.replace(/\.(md|mdt)$/, "");
        const isTemplate = entry.name.endsWith(".mdt");
        const trashId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        try {
          const content = await fs.readFile(filePath, "utf-8");
          await fs.writeFile(path.join(trashDir, trashId), content, "utf-8");
          manifest.items.unshift({
            id: trashId,
            name: docName,
            category: relCatPath || "General",
            filename: entry.name,
            deletedBy: deleter.username,
            deletedAt: now,
            ...(isTemplate ? { isTemplate: true } : {}),
          });
        } catch {}
      } else if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
        await trashDocsInDir(
          path.join(dir, entry.name),
          relCatPath ? `${relCatPath}/${entry.name}` : entry.name
        );
      }
    }
  }

  await trashDocsInDir(catDir, categoryPath);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  await fs.rm(catDir, { recursive: true });
  invalidateSpaceCache(slug);
  auditLog(req, { event: "document.delete", outcome: "success", actor: deleter.username, spaceSlug: slug, resource: categoryPath, resourceType: "category", details: { softDelete: true } });
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug, path: pathParts } = await params;
  const categoryPath = pathParts.join("/");

  let archiver;
  try {
    ({ user: archiver } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const catDir = path.join(spaceDir, categoryPath);
  const archiveCatDir = getArchiveCategoryDir(slug, categoryPath);

  try {
    await fs.access(catDir);
  } catch {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Ensure destination parent dir exists
  await ensureDir(path.dirname(archiveCatDir));

  // If destination already exists, append timestamp to avoid collision
  let dest = archiveCatDir;
  try {
    await fs.access(dest);
    dest = `${archiveCatDir}_${Date.now()}`;
  } catch {
    // Good — destination does not exist
  }

  await fs.rename(catDir, dest);
  invalidateSpaceCache(slug);
  auditLog(req, {
    event: "category.archive",
    outcome: "success",
    actor: archiver.username,
    spaceSlug: slug,
    resource: categoryPath,
    resourceType: "category",
  });
  return NextResponse.json({ success: true });
}
