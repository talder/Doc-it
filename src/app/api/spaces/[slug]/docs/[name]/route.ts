import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const catDir = getCategoryDir(slug, category);
  const filePath = path.join(catDir, `${name}.md`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return NextResponse.json({ name, content, category, space: slug });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { content, category } = await request.json();
  if (category === undefined) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }

  const catDir = getCategoryDir(slug, category);
  const filePath = path.join(catDir, `${name}.md`);

  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await fs.writeFile(filePath, content, "utf-8");
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const catDir = getCategoryDir(slug, category);
  const filePath = path.join(catDir, `${name}.md`);

  try {
    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}
