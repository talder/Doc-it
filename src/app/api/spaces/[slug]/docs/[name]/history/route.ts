import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getHistoryDir, ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; name: string }> };

interface RevisionMeta {
  rev: number;
  timestamp: string;
  username: string;
  size: number;
}

async function readMeta(metaPath: string): Promise<RevisionMeta[]> {
  try {
    const data = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeMeta(metaPath: string, meta: RevisionMeta[]) {
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

// POST: create a new revision (only if content changed)
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { content, category, username } = await request.json();
  if (!category || content === undefined) {
    return NextResponse.json({ error: "content and category required" }, { status: 400 });
  }

  const histDir = getHistoryDir(slug, category, name);
  const metaPath = path.join(histDir, "_meta.json");

  await ensureDir(histDir);
  const meta = await readMeta(metaPath);

  // Compare with latest revision content (or return rev 1 if none exist)
  if (meta.length > 0) {
    const latestRev = meta[meta.length - 1];
    const latestPath = path.join(histDir, `rev-${latestRev.rev}.md`);
    try {
      const latestContent = await fs.readFile(latestPath, "utf-8");
      if (latestContent === content) {
        return NextResponse.json({ rev: latestRev.rev, created: false });
      }
    } catch {
      // Latest file missing, proceed to create
    }
  }

  const newRev = meta.length > 0 ? meta[meta.length - 1].rev + 1 : 1;
  const revPath = path.join(histDir, `rev-${newRev}.md`);

  await fs.writeFile(revPath, content, "utf-8");

  const entry: RevisionMeta = {
    rev: newRev,
    timestamp: new Date().toISOString(),
    username: username || "unknown",
    size: Buffer.byteLength(content, "utf-8"),
  };
  meta.push(entry);
  await writeMeta(metaPath, meta);

  return NextResponse.json({ rev: newRev, created: true });
}

// GET: list all revisions
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const histDir = getHistoryDir(slug, category, name);
  const metaPath = path.join(histDir, "_meta.json");
  const meta = await readMeta(metaPath);

  return NextResponse.json(meta);
}
