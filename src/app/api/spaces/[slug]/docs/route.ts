import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, getCategoryDir, ensureDir } from "@/lib/config";
import { stringifyFrontmatter } from "@/lib/frontmatter";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";
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
    } else if (entry.isFile() && entry.name.endsWith(".mdt")) {
      const name = entry.name.replace(/\.mdt$/, "");
      docs.push({ name, filename: entry.name, category: categoryPath, space, isTemplate: true });
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
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { name, category, content, isTemplate } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Category required" }, { status: 400 });

  const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!safeName) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const ext = isTemplate ? ".mdt" : ".md";
  const catDir = getCategoryDir(slug, category);
  await ensureDir(catDir);

  const filePath = path.join(catDir, `${safeName}${ext}`);

  try {
    await fs.access(filePath);
    return NextResponse.json({ error: "Document already exists" }, { status: 409 });
  } catch {
    // Good — file does not exist yet
  }

  const defaultBody = isTemplate
    ? `# ${safeName}\n\nDescribe what this template is for, then add your content and **Template Fields** via the / command.\n`
    : `# ${safeName}\n\nStart writing here...\n`;

  const now = new Date().toISOString();
  const metadata = {
    createdAt: now,
    createdBy: user.username,
    updatedAt: now,
    updatedBy: user.username,
  };
  const fileContent = stringifyFrontmatter(content || defaultBody, metadata);
  await fs.writeFile(filePath, fileContent, "utf-8");
  invalidateSpaceCache(slug);

  auditLog(request, { event: "document.create", outcome: "success", actor: user.username, spaceSlug: slug, resource: `${category}/${safeName}`, resourceType: "document", details: { category, isTemplate: !!isTemplate } });
  return NextResponse.json(
    { name: safeName, filename: `${safeName}${ext}`, category, space: slug, isTemplate: !!isTemplate },
    { status: 201 }
  );
}
