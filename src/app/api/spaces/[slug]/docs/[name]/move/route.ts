import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, ensureDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  let mover;
  try {
    ({ user: mover } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { fromCategory, toCategory } = await request.json();
  if (fromCategory === undefined || toCategory === undefined) {
    return NextResponse.json({ error: "fromCategory and toCategory required" }, { status: 400 });
  }

  const fromDir = getCategoryDir(slug, fromCategory);
  const toDir = getCategoryDir(slug, toCategory);
  await ensureDir(toDir);

  const fromPath = path.join(fromDir, `${name}.md`);
  const toPath = path.join(toDir, `${name}.md`);

  try {
    await fs.access(fromPath);
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    await fs.access(toPath);
    return NextResponse.json({ error: "Document already exists in target category" }, { status: 409 });
  } catch {
    // Good
  }

  await fs.rename(fromPath, toPath);
  auditLog(request, { event: "document.move", outcome: "success", actor: mover.username, spaceSlug: slug, resource: `${fromCategory}/${name}`, resourceType: "document", details: { toCategory } });
  return NextResponse.json({ success: true, category: toCategory });
}
