import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, getCategoryDir, ensureDir } from "@/lib/config";
import type { DocFile } from "@/lib/types";

const EXCLUDED = ["attachments", ".git", ".DS_Store"];

type Params = { params: Promise<{ slug: string }> };

async function scanDocs(dir: string, space: string, categoryPath: string = ""): Promise<DocFile[]> {
  const docs: DocFile[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return docs;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = entry.name.replace(/\.md$/, "");
      docs.push({ name, filename: entry.name, category: categoryPath, space });
    } else if (entry.isDirectory() && !EXCLUDED.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const subDocs = await scanDocs(path.join(dir, entry.name), space, subPath);
      docs.push(...subDocs);
    }
  }

  return docs;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const category = request.nextUrl.searchParams.get("category");
  const spaceDir = getSpaceDir(slug);

  let docs: DocFile[];
  if (category) {
    const catDir = getCategoryDir(slug, category);
    docs = await scanDocs(catDir, slug, category);
    // Only return direct docs, not subdirectory docs
    docs = docs.filter((d) => d.category === category);
  } else {
    docs = await scanDocs(spaceDir, slug);
  }

  return NextResponse.json(docs);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { name, category, content } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Category required" }, { status: 400 });

  const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!safeName) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const catDir = getCategoryDir(slug, category);
  await ensureDir(catDir);

  const filePath = path.join(catDir, `${safeName}.md`);

  try {
    await fs.access(filePath);
    return NextResponse.json({ error: "Document already exists" }, { status: 409 });
  } catch {
    // Good
  }

  await fs.writeFile(
    filePath,
    content || `# ${safeName}\n\nStart writing here...\n`,
    "utf-8"
  );

  return NextResponse.json(
    { name: safeName, filename: `${safeName}.md`, category, space: slug },
    { status: 201 }
  );
}
