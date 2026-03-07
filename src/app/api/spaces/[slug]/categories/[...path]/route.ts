import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir } from "@/lib/config";

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

  const parentPath = pathParts.slice(0, -1).join("/");
  const newPath = parentPath ? `${parentPath}/${safeName}` : safeName;

  return NextResponse.json({ name: safeName, path: newPath });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug, path: pathParts } = await params;
  const categoryPath = pathParts.join("/");

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const catDir = path.join(spaceDir, categoryPath);

  try {
    await fs.rm(catDir, { recursive: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
}
