import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getAttachmentsDir } from "@/lib/config";
import { readRef, readBlobBytes, getBlob } from "@/lib/blobstore";

type Params = { params: Promise<{ slug: string; filename: string }> };

const MIME_MAP: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".txt":  "text/plain; charset=utf-8",
  ".csv":  "text/csv",
  ".md":   "text/markdown",
  ".zip":  "application/zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, filename } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const category = request.nextUrl.searchParams.get("category") || "General";
  const download = request.nextUrl.searchParams.get("download") === "1";

  const dir = getAttachmentsDir(slug, category);
  const filePath = path.join(dir, filename);

  // Prevent path traversal
  if (!filePath.startsWith(dir)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 1. Try blobstore lookup by ref id ──────────────────────────────────
  const ref = readRef(filename);
  if (ref) {
    try {
      const blob = getBlob(ref.sha256);
      const buffer = await readBlobBytes(ref.sha256);
      const contentType = blob?.mime || MIME_MAP[path.extname(ref.original_name).toLowerCase()] || "application/octet-stream";
      const displayName = ref.original_name || filename;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": download
            ? `attachment; filename="${displayName}"`
            : `inline; filename="${displayName}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "Blob file missing" }, { status: 404 });
    }
  }

  // ── 2. Legacy fallback for non-migrated files ────────────────────────────
  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
