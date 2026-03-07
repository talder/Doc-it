import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getAttachmentsDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, id } = await params;
  const category = request.nextUrl.searchParams.get("category") || "General";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const assetsDir = path.join(getAttachmentsDir(slug, category), "excalidraw");
  const jsonPath = path.join(assetsDir, `${id}.excalidraw.json`);
  const svgPath = path.join(assetsDir, `${id}.excalidraw.svg`);

  try {
    const [sceneDataRaw, svgData] = await Promise.all([
      fs.readFile(jsonPath, "utf-8"),
      fs.readFile(svgPath, "utf-8"),
    ]);

    return NextResponse.json({
      id,
      sceneData: JSON.parse(sceneDataRaw),
      svgData,
    });
  } catch {
    return NextResponse.json({ error: "Drawing not found" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, id } = await params;
  const category = request.nextUrl.searchParams.get("category") || "General";

  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const assetsDir = path.join(getAttachmentsDir(slug, category), "excalidraw");
  const jsonPath = path.join(assetsDir, `${id}.excalidraw.json`);
  const svgPath = path.join(assetsDir, `${id}.excalidraw.svg`);

  try {
    await Promise.all([
      fs.unlink(jsonPath).catch(() => {}),
      fs.unlink(svgPath).catch(() => {}),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
