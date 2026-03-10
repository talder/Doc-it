import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function getIconDir() {
  return path.join(getConfigDir(), "dashboard-icons");
}

type Params = { params: Promise<{ filename: string }> };

/** GET — serve an uploaded dashboard icon (public, no auth required so icons render for all users) */
export async function GET(_request: NextRequest, { params }: Params) {
  const { filename } = await params;

  // Prevent path traversal
  const safe = path.basename(decodeURIComponent(filename));
  const filePath = path.join(getIconDir(), safe);

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(safe).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
