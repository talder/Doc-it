import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { getAttachmentsDir, ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { id, category, docName, sceneData, svgData } = await request.json();

  const assetsDir = path.join(getAttachmentsDir(slug, category || "General"), "excalidraw");
  await ensureDir(assetsDir);

  const shortId = crypto.randomUUID().slice(0, 8);
  const safeName = (docName || "untitled").replace(/[^a-zA-Z0-9-_]/g, "-");
  const drawingId = id || `${safeName}-${shortId}`;

  const jsonPath = path.join(assetsDir, `${drawingId}.excalidraw.json`);
  const svgPath = path.join(assetsDir, `${drawingId}.excalidraw.svg`);

  await fs.writeFile(jsonPath, JSON.stringify(sceneData), "utf-8");
  await fs.writeFile(svgPath, svgData, "utf-8");

  return NextResponse.json({ id: drawingId });
}
