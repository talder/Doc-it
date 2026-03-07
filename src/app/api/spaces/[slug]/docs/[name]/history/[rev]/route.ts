import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getHistoryDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; name: string; rev: string }> };

// GET: get a specific revision's content
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name, rev } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const histDir = getHistoryDir(slug, category, name);
  const revPath = path.join(histDir, `rev-${rev}.md`);

  try {
    const content = await fs.readFile(revPath, "utf-8");
    return NextResponse.json({ rev: Number(rev), content });
  } catch {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }
}
