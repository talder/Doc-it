import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { getDocsDir } from "@/lib/config";

function getAssetsDir() {
  return path.join(getDocsDir(), "attachments", "excalidraw");
}

async function ensureAssetsDir() {
  await fs.mkdir(getAssetsDir(), { recursive: true }).catch(() => {});
}

// POST: Save a drawing (create or update)
export async function POST(request: NextRequest) {
  await ensureAssetsDir();

  const { id, docName, sceneData, svgData } = await request.json();

  // Format: {docName}-{shortId} so files are recognizable per document
  const shortId = crypto.randomUUID().slice(0, 8);
  const safeName = (docName || "untitled").replace(/[^a-zA-Z0-9-_]/g, "-");
  const drawingId = id || `${safeName}-${shortId}`;

  const assetsDir = getAssetsDir();
  const jsonPath = path.join(assetsDir, `${drawingId}.excalidraw.json`);
  const svgPath = path.join(assetsDir, `${drawingId}.excalidraw.svg`);

  await fs.writeFile(jsonPath, JSON.stringify(sceneData), "utf-8");
  await fs.writeFile(svgPath, svgData, "utf-8");

  return NextResponse.json({ id: drawingId });
}
