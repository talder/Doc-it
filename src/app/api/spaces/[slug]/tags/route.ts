import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir } from "@/lib/config";
import { extractHashtags, buildTagsIndex } from "@/lib/tags";

const EXCLUDED = ["attachments", ".git", ".DS_Store"];

type Params = { params: Promise<{ slug: string }> };

async function scanDocsForTags(
  dir: string,
  categoryPath: string = ""
): Promise<{ name: string; tags: string[] }[]> {
  const results: { name: string; tags: string[] }[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const content = await fs.readFile(path.join(dir, entry.name), "utf-8");
      const docName = `${categoryPath ? categoryPath + "/" : ""}${entry.name.replace(/\.md$/, "")}`;
      const tags = extractHashtags(content);
      if (tags.length > 0) {
        results.push({ name: docName, tags });
      }
    } else if (entry.isDirectory() && !EXCLUDED.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const subResults = await scanDocsForTags(path.join(dir, entry.name), subPath);
      results.push(...subResults);
    }
  }

  return results;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const docs = await scanDocsForTags(spaceDir);
  const tagsIndex = buildTagsIndex(docs);

  return NextResponse.json(tagsIndex);
}

// POST: force reindex all tags (same logic, explicit trigger)
export async function POST(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const docs = await scanDocsForTags(spaceDir);
  const tagsIndex = buildTagsIndex(docs);

  return NextResponse.json(tagsIndex);
}
