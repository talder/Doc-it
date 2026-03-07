import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const avatarDir = path.join(getConfigDir(), "avatars");

    // Find avatar file (any image extension)
    let files: string[] = [];
    try {
      files = await fs.readdir(avatarDir);
    } catch {
      return new NextResponse(null, { status: 404 });
    }

    const avatarFile = files.find((f) => {
      const name = f.substring(0, f.lastIndexOf("."));
      return name === username;
    });

    if (!avatarFile) {
      return new NextResponse(null, { status: 404 });
    }

    const ext = avatarFile.substring(avatarFile.lastIndexOf(".") + 1).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fs.readFile(path.join(avatarDir, avatarFile));

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
