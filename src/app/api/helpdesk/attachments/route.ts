import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { ensureDir } from "@/lib/config";

const ATTACH_DIR = path.join(process.cwd(), "config", "helpdesk", "attachments");

/** POST /api/helpdesk/attachments — upload a file */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name);
  const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
  const shortId = crypto.randomUUID().slice(0, 8);
  const storedFilename = `${shortId}-${baseName}${ext}`;

  await ensureDir(ATTACH_DIR);
  await fs.writeFile(path.join(ATTACH_DIR, storedFilename), buffer);

  return NextResponse.json({
    id: shortId,
    filename: storedFilename,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  });
}
