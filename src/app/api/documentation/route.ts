import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join } from "path";

export interface DocTreeItem {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: DocTreeItem[];
}

const DOCS_DIR = join(process.cwd(), "documentation");
const EXCLUDED = ["take-screenshots.mjs", "screenshots"];

function buildTree(dir: string, relBase: string): DocTreeItem[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return [];
  }

  const result: DocTreeItem[] = [];
  for (const entry of entries) {
    if (EXCLUDED.includes(entry)) continue;
    const absPath = join(dir, entry);
    const relPath = relBase ? `${relBase}/${entry}` : entry;
    const stat = statSync(absPath);

    if (stat.isDirectory()) {
      result.push({
        name: entry,
        path: relPath,
        type: "dir",
        children: buildTree(absPath, relPath),
      });
    } else if (entry.endsWith(".md")) {
      result.push({
        name: entry.replace(/\.md$/, ""),
        path: relPath.replace(/\.md$/, ""),
        type: "file",
      });
    }
  }
  return result;
}

export async function GET() {
  const tree = buildTree(DOCS_DIR, "");
  return NextResponse.json({ tree });
}
