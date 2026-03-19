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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "General";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 50 MB upload limit
  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 50 MB upload limit" },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name);
  const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
  const shortId = crypto.randomUUID().slice(0, 8);
  const storedFilename = `${shortId}-${baseName}${ext}`;

  const dir = getAttachmentsDir(slug, category);
  await ensureDir(dir);

  const filePath = path.join(dir, storedFilename);
  await fs.writeFile(filePath, buffer);

  const url = `/api/spaces/${slug}/attachments/${encodeURIComponent(storedFilename)}?category=${encodeURIComponent(category)}`;

  return NextResponse.json({
    filename: storedFilename,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    category,
    url,
  });
}
