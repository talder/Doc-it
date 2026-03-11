import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, getArchiveCategoryDir, getTrashDir, ensureDir } from "@/lib/config";
import { invalidateSpaceCache } from "@/lib/space-cache";
import { auditLog } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; path: string[] }> };

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
