import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { ensureDir, readJsonConfig, getTrashDir, getCategoryDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string }> };

const getTrashRoot = getTrashDir;

interface TrashEntry {
  id: string;
  name: string;
  category: string;
  filename: string;
  deletedBy: string;
  deletedAt: string;
  isTemplate?: boolean;
}

interface TrashManifest {
  items: TrashEntry[];
}

interface TrashConfig {
  retentionDays: number;
}

function getTrashSpaceDir(slug: string) {
  return path.join(getTrashRoot(), slug);
}

function getTrashManifestPath(slug: string) {
  return path.join(getTrashRoot(), slug, "manifest.json");
}

async function readManifest(slug: string): Promise<TrashManifest> {
  try {
    const data = await fs.readFile(getTrashManifestPath(slug), "utf-8");
    return JSON.parse(data);
  } catch {
    return { items: [] };
  }
}

async function writeManifest(slug: string, manifest: TrashManifest) {
  const dir = getTrashSpaceDir(slug);
  await ensureDir(dir);
  await fs.writeFile(getTrashManifestPath(slug), JSON.stringify(manifest, null, 2), "utf-8");
}

/** Auto-purge items older than retention period */
async function purgeExpired(slug: string, manifest: TrashManifest, retentionDays: number): Promise<TrashManifest> {
  const cutoff = Date.now() - retentionDays * 86400000;
  const keep: TrashEntry[] = [];
  const dir = getTrashSpaceDir(slug);

  for (const item of manifest.items) {
    if (new Date(item.deletedAt).getTime() < cutoff) {
      // Permanently remove file
      try { await fs.unlink(path.join(dir, item.id)); } catch {}
    } else {
      keep.push(item);
    }
  }

  if (keep.length !== manifest.items.length) {
    const updated = { items: keep };
    await writeManifest(slug, updated);
    return updated;
  }
  return manifest;
}

/** GET /api/spaces/[slug]/trash — list trashed items */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const config = await readJsonConfig<TrashConfig>("trash.json", { retentionDays: 30 });
  let manifest = await readManifest(slug);
  manifest = await purgeExpired(slug, manifest, config.retentionDays);

  return NextResponse.json({
    items: manifest.items,
    retentionDays: config.retentionDays,
  });
}

/** POST /api/spaces/[slug]/trash — action: "restore" | "delete" */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { action, id } = await request.json();
  if (!action || !id) {
    return NextResponse.json({ error: "action and id required" }, { status: 400 });
  }

  const manifest = await readManifest(slug);
  const idx = manifest.items.findIndex((i) => i.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Item not found in trash" }, { status: 404 });
  }

  const item = manifest.items[idx];
  const trashDir = getTrashSpaceDir(slug);
  const trashFile = path.join(trashDir, item.id);

  if (action === "restore") {
    // Move file back to original location
    const docsDir = getCategoryDir(slug, item.category);
    await ensureDir(docsDir);
    const destPath = path.join(docsDir, item.filename);
    try {
      const content = await fs.readFile(trashFile, "utf-8");
      await fs.writeFile(destPath, content, "utf-8");
      await fs.unlink(trashFile);
    } catch (err) {
      return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
    }
    manifest.items.splice(idx, 1);
    await writeManifest(slug, manifest);
    invalidateSpaceCache(slug);
    auditLog(request, { event: "document.unarchive", outcome: "success", actor: user.username, spaceSlug: slug, resource: `${item.category}/${item.name}`, resourceType: "document", details: { action: "restore-from-trash" } });
    return NextResponse.json({ success: true });
  }

  if (action === "delete") {
    // Permanently delete
    try { await fs.unlink(trashFile); } catch {}
    manifest.items.splice(idx, 1);
    await writeManifest(slug, manifest);
    auditLog(request, { event: "document.delete", outcome: "success", actor: user.username, spaceSlug: slug, resource: `${item.category}/${item.name}`, resourceType: "document", details: { action: "permanent-delete" } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
