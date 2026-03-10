import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, getArchiveCategoryDir, ensureDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string; name: string }> };

// POST: archive a document (move docs -> archive)
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const { category } = await request.json();

  let archiver;
  try {
    ({ user: archiver } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  if (!category) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }

  const srcDir = getCategoryDir(slug, category);
  const srcPath = path.join(srcDir, `${name}.md`);
  const destDir = getArchiveCategoryDir(slug, category);
  const destPath = path.join(destDir, `${name}.md`);

  try {
    await fs.access(srcPath);
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await ensureDir(destDir);
  await fs.rename(srcPath, destPath);
  invalidateSpaceCache(slug);
  auditLog(request, { event: "document.archive", outcome: "success", actor: archiver.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document" });
  return NextResponse.json({ success: true });
}
