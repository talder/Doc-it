import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, getArchiveCategoryDir, ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; name: string }> };

// POST: unarchive a document (move archive -> docs)
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const { category } = await request.json();

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  if (!category) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }

  const srcDir = getArchiveCategoryDir(slug, category);
  const srcPath = path.join(srcDir, `${name}.md`);
  const destDir = getCategoryDir(slug, category);
  const destPath = path.join(destDir, `${name}.md`);

  try {
    await fs.access(srcPath);
  } catch {
    return NextResponse.json({ error: "Archived document not found" }, { status: 404 });
  }

  await ensureDir(destDir);
  await fs.rename(srcPath, destPath);

  return NextResponse.json({ success: true });
}
