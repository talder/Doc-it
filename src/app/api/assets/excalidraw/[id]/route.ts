import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getDocsDir } from "@/lib/config";

function getAssetsDir() {
  return path.join(getDocsDir(), "attachments", "excalidraw");
}

// GET: Load drawing data (JSON + SVG)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assetsDir = getAssetsDir();
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

// DELETE: Remove a drawing
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const a = getAssetsDir();
  const jsonPath = path.join(a, `${id}.excalidraw.json`);
  const svgPath = path.join(a, `${id}.excalidraw.svg`);

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
