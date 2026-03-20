import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir } from "@/lib/config";

interface BacklinkEntry {
  name: string;
  category: string;
}

const LINKED_DOC_RE = /<!--\s*linked-doc:([A-Za-z0-9+/=]+)\s*-->/g;

/** Recursively walk a directory and collect all .md files as {name, category, filePath} */
async function collectMdFiles(
  dir: string,
  categoryPath = "",
): Promise<{ name: string; category: string; filePath: string }[]> {
  const results: { name: string; category: string; filePath: string }[] = [];
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      results.push(...await collectMdFiles(abs, sub));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push({
        name: entry.name.slice(0, -3),
        category: categoryPath,
        filePath: abs,
      });
    }
  }
  return results;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requireSpaceRole(slug, "reader");

  const { searchParams } = new URL(request.url);
  const targetDoc = searchParams.get("doc");
  const targetCategory = searchParams.get("category") ?? "";

  if (!targetDoc) return NextResponse.json({ error: "Missing doc param" }, { status: 400 });

  const spaceDir = getSpaceDir(slug);
  const files = await collectMdFiles(spaceDir);
  const backlinks: BacklinkEntry[] = [];

  for (const file of files) {
    // Skip the document itself
    if (file.name === targetDoc && file.category === targetCategory) continue;
    try {
      const content = await fs.readFile(file.filePath, "utf-8");
      LINKED_DOC_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      let found = false;
      while (!found && (m = LINKED_DOC_RE.exec(content)) !== null) {
        try {
          const attrs = JSON.parse(Buffer.from(m[1], "base64").toString("utf-8")) as {
            docName: string; docCategory: string;
          };
          if (attrs.docName === targetDoc && attrs.docCategory === targetCategory) {
            found = true;
          }
        } catch { /* malformed comment — skip */ }
      }
      if (found) backlinks.push({ name: file.name, category: file.category });
    } catch { /* unreadable file — skip */ }
  }

  return NextResponse.json({ backlinks });
}
