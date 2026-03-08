import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getAttachmentsDir, ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; filename: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, filename } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const category = request.nextUrl.searchParams.get("category") || "General";
  const dir = getAttachmentsDir(slug, category);
  const annotPath = path.join(dir, `${filename}.annotations.json`);

  try {
    const data = await fs.readFile(annotPath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json([]);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, filename } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const category = request.nextUrl.searchParams.get("category") || "General";
  const annotations = await request.json();

  const dir = getAttachmentsDir(slug, category);
  await ensureDir(dir);
  const annotPath = path.join(dir, `${filename}.annotations.json`);
  await fs.writeFile(annotPath, JSON.stringify(annotations, null, 2), "utf-8");

  return NextResponse.json({ success: true });
}
