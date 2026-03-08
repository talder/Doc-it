import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const catDir = getCategoryDir(slug, category);
  const filePath = path.join(catDir, `${name}.mdt`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.mdt"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
}
