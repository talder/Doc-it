import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, getHistoryDir, ensureDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; name: string; rev: string }> };

interface RevisionMeta {
  rev: number;
  timestamp: string;
  username: string;
  size: number;
}

// POST: restore a revision (write to doc + create new revision)
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name, rev } = await params;
  const { category, username } = await request.json();

  let restorer;
  try {
    ({ user: restorer } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  if (!category) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }

  const histDir = getHistoryDir(slug, category, name);
  const revPath = path.join(histDir, `rev-${rev}.md`);

  let content: string;
  try {
    content = await fs.readFile(revPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  // Write restored content to the doc
  const catDir = getCategoryDir(slug, category);
  await fs.writeFile(path.join(catDir, `${name}.md`), content, "utf-8");

  // Delete all revisions after the restored one
  const metaPath = path.join(histDir, "_meta.json");
  await ensureDir(histDir);

  let meta: RevisionMeta[] = [];
  try {
    const data = await fs.readFile(metaPath, "utf-8");
    meta = JSON.parse(data);
  } catch {
    // empty
  }

  const revNum = Number(rev);
  const toDelete = meta.filter((m) => m.rev > revNum);
  for (const entry of toDelete) {
    try {
      await fs.unlink(path.join(histDir, `rev-${entry.rev}.md`));
    } catch {
      // file may not exist
    }
  }

  // Keep only revisions up to and including the restored one
  meta = meta.filter((m) => m.rev <= revNum);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  auditLog(request, { event: "document.history.restore", outcome: "success", actor: restorer.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document", details: { rev: revNum } });
  return NextResponse.json({ rev: revNum, restored: true });
}
