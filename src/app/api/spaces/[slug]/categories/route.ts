import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, ensureDir } from "@/lib/config";
import type { Category } from "@/lib/types";

const EXCLUDED = ["attachments", ".git", ".DS_Store", ".databases"];

type Params = { params: Promise<{ slug: string }> };

async function buildCategoryTree(
  dir: string,
  basePath: string = "",
  level: number = 0
): Promise<Category[]> {
  const categories: Category[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return categories;
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !EXCLUDED.includes(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const d of dirs) {
    const catPath = basePath ? `${basePath}/${d.name}` : d.name;
    const catDir = path.join(dir, d.name);

    const files = await fs.readdir(catDir, { withFileTypes: true });
    const count = files.filter((f) => f.isFile() && f.name.endsWith(".md")).length;

    categories.push({
      name: d.name,
      path: catPath,
      parent: basePath || undefined,
      level,
      count,
    });

    const subCats = await buildCategoryTree(catDir, catPath, level + 1);
    categories.push(...subCats);
  }

  return categories;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const categories = await buildCategoryTree(spaceDir);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { name, parent } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!safeName) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const spaceDir = getSpaceDir(slug);
  const catDir = parent
    ? path.join(spaceDir, parent, safeName)
    : path.join(spaceDir, safeName);

  try {
    await fs.access(catDir);
    return NextResponse.json({ error: "Category already exists" }, { status: 409 });
  } catch {
    // Doesn't exist, good
  }

  await ensureDir(catDir);
  const catPath = parent ? `${parent}/${safeName}` : safeName;

  return NextResponse.json({ name: safeName, path: catPath }, { status: 201 });
}
