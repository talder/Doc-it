import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, ensureDir } from "@/lib/config";
import { parseFrontmatter, stringifyFrontmatter } from "@/lib/frontmatter";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string; name: string }> };

/** Resolve the file path for a doc, preferring the specified extension or auto-detecting. */
async function resolveDocPath(
  catDir: string,
  name: string,
  preferTemplate?: boolean
): Promise<{ filePath: string; isTemplate: boolean } | null> {
  if (preferTemplate) {
    const mdt = path.join(catDir, `${name}.mdt`);
    try { await fs.access(mdt); return { filePath: mdt, isTemplate: true }; } catch {}
  }
  const md = path.join(catDir, `${name}.md`);
  try { await fs.access(md); return { filePath: md, isTemplate: false }; } catch {}
  // fallback: try the other extension
  const mdt = path.join(catDir, `${name}.mdt`);
  try { await fs.access(mdt); return { filePath: mdt, isTemplate: true }; } catch {}
  return null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";
  const isTemplate = request.nextUrl.searchParams.get("isTemplate") === "true";

  let reader;
  try {
    ({ user: reader } = await requireSpaceRole(slug, "reader"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const catDir = getCategoryDir(slug, category);
  const resolved = await resolveDocPath(catDir, name, isTemplate);

  if (!resolved) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    const raw = await fs.readFile(resolved.filePath, "utf-8");
    const stat = await fs.stat(resolved.filePath);
    const { body, metadata } = parseFrontmatter(raw);
    // Backfill missing timestamps from filesystem for legacy docs
    if (!metadata.createdAt) metadata.createdAt = (stat.birthtime || stat.mtime).toISOString();
    if (!metadata.updatedAt) metadata.updatedAt = stat.mtime.toISOString();
    auditLog(request, { event: "document.read", outcome: "success", actor: reader.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document" });
    return NextResponse.json({
      name,
      content: body,
      metadata,
      fileSize: stat.size,
      category,
      space: slug,
      isTemplate: resolved.isTemplate,
    });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const saveStart = Date.now();
  const { content, category, isTemplate, metadata } = await request.json();
  console.log(`[doc-save] parse body: ${Date.now()-saveStart}ms, content size: ${content?.length || 0}`);
  if (category === undefined) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }

  const catDir = getCategoryDir(slug, category);
  const resolved = await resolveDocPath(catDir, name, !!isTemplate);

  if (!resolved) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Read existing frontmatter to preserve metadata not sent by client
  let existingMeta = {};
  try {
    const existing = await fs.readFile(resolved.filePath, "utf-8");
    existingMeta = parseFrontmatter(existing).metadata;
  } catch { /* new file or unreadable */ }

  // Backfill createdAt/createdBy for legacy docs on first save
  const existingTyped = existingMeta as Record<string, unknown>;
  let createdAt = existingTyped.createdAt as string | undefined;
  let createdBy = existingTyped.createdBy as string | undefined;
  if (!createdAt) {
    try {
      const stat = await fs.stat(resolved.filePath);
      createdAt = (stat.birthtime || stat.mtime).toISOString();
    } catch {
      createdAt = new Date().toISOString();
    }
  }
  if (!createdBy) createdBy = user.username;

  const merged = {
    ...existingMeta,
    ...(metadata || {}),
    createdAt,
    createdBy,
    updatedAt: new Date().toISOString(),
    updatedBy: user.username,
  };

  const fileContent = stringifyFrontmatter(content, merged);
  await fs.writeFile(resolved.filePath, fileContent, "utf-8");
  console.log(`[doc-save] total: ${Date.now()-saveStart}ms`);
  auditLog(request, { event: "document.update", outcome: "success", actor: user.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document" });
  return NextResponse.json({ success: true, metadata: merged });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";
  const isTemplate = request.nextUrl.searchParams.get("isTemplate") === "true";

  let deleter;
  try {
    ({ user: deleter } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const catDir = getCategoryDir(slug, category);
  const resolved = await resolveDocPath(catDir, name, isTemplate);

  if (!resolved) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    // Soft delete: move to trash
    const TRASH_DIR = path.join(process.cwd(), "trash", slug);
    await ensureDir(TRASH_DIR);
    const trashId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const content = await fs.readFile(resolved.filePath, "utf-8");
    await fs.writeFile(path.join(TRASH_DIR, trashId), content, "utf-8");

    // Update trash manifest
    const manifestPath = path.join(TRASH_DIR, "manifest.json");
    let manifest: { items: { id: string; name: string; category: string; filename: string; deletedBy: string; deletedAt: string; isTemplate?: boolean }[] } = { items: [] };
    try {
      const raw = await fs.readFile(manifestPath, "utf-8");
      manifest = JSON.parse(raw);
    } catch {}
    manifest.items.unshift({
      id: trashId,
      name,
      category,
      filename: path.basename(resolved.filePath),
      deletedBy: deleter.username,
      deletedAt: new Date().toISOString(),
      ...(resolved.isTemplate ? { isTemplate: true } : {}),
    });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    await fs.unlink(resolved.filePath);
    invalidateSpaceCache(slug);
    auditLog(request, { event: "document.delete", outcome: "success", actor: deleter.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document", details: { softDelete: true } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}
