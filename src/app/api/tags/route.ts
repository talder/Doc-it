import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleSpaces } from "@/lib/permissions";
import { getSpaceDir } from "@/lib/config";
import { buildTagsIndex } from "@/lib/tags";
import { parseFrontmatter } from "@/lib/frontmatter";
import { listEnhancedTablesMeta } from "@/lib/enhanced-table";
import fs from "fs/promises";
import path from "path";

const EXCLUDED = ["attachments", ".git", ".DS_Store", ".databases"];

async function scanDocsForTags(
  dir: string,
  categoryPath = ""
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
      try {
        const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const { metadata } = parseFrontmatter(raw);
        const fmTags: string[] = (metadata.tags || []).map((t: string) => t.toLowerCase());
        if (fmTags.length > 0) {
          const docName = `${categoryPath ? categoryPath + "/" : ""}${entry.name.replace(/\.md$/, "")}`;
          results.push({ name: docName, tags: fmTags });
        }
      } catch {}
    } else if (entry.isDirectory() && !EXCLUDED.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      results.push(...(await scanDocsForTags(path.join(dir, entry.name), subPath)));
    }
  }
  return results;
}

/** GET /api/tags — aggregated unique tag names across all accessible spaces. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const spaces = await getAccessibleSpaces(user);
  const allTags = new Set<string>();

  for (const space of spaces) {
    const spaceDir = getSpaceDir(space.slug);
    const docs = await scanDocsForTags(spaceDir);
    const dbDocs = (await listEnhancedTablesMeta(space.slug))
      .filter((db) => db.tags?.length)
      .map((db) => ({ name: `[db] ${db.title}`, tags: db.tags!.map((t) => t.toLowerCase()) }));

    const index = buildTagsIndex([...docs, ...dbDocs]);
    for (const tagName of Object.keys(index)) {
      allTags.add(tagName);
    }
  }

  const sorted = Array.from(allTags).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ tags: sorted });
}
