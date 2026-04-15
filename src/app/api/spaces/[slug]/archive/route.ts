import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getArchiveSpaceDir } from "@/lib/config";
import { listArchivedEnhancedTables } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string }> };

const EXCLUDED = [".git", ".DS_Store", "attachments"];

interface ArchivedDoc {
  name: string;
  category: string;
  archivedAt: string;
}

async function scanArchive(dir: string, categoryPath: string = ""): Promise<ArchivedDoc[]> {
  const results: ArchivedDoc[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const stat = await fs.stat(path.join(dir, entry.name));
      results.push({
        name: entry.name.replace(/\.md$/, ""),
        category: categoryPath || "General",
        archivedAt: stat.mtime.toISOString(),
      });
    } else if (entry.isDirectory() && !EXCLUDED.includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const subResults = await scanArchive(path.join(dir, entry.name), subPath);
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

  const type = _req.nextUrl.searchParams.get("type");
  if (type === "enhanced-tables") {
    const dbs = await listArchivedEnhancedTables(slug);
    return NextResponse.json(dbs.map((db) => {
      const { rows, ...rest } = db;
      return { ...rest, rowCount: Array.isArray(rows) ? rows.length : 0 };
    }));
  }

  const archiveDir = getArchiveSpaceDir(slug);
  const docs = await scanArchive(archiveDir);

  return NextResponse.json(docs);
}
