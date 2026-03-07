import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { ensureDir, getConfigDir } from "@/lib/config";

function getAvatarDir() {
  return path.join(getConfigDir(), "avatars");
}

/** POST — upload avatar (accepts FormData with "file" field) */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Limit to 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 2MB" }, { status: 400 });
    }

    const avatarDir = getAvatarDir();
    await ensureDir(avatarDir);

    // Get extension from mime type
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const filename = `${user.username}.${ext}`;

    // Remove any existing avatar for this user
    const existing = await fs.readdir(avatarDir).catch(() => []);
    for (const f of existing) {
      if (f.startsWith(`${user.username}.`)) {
        await fs.unlink(path.join(avatarDir, f)).catch(() => {});
      }
    }

    // Write new avatar
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(avatarDir, filename), buffer);

    return NextResponse.json({ success: true, url: `/api/auth/avatar/${encodeURIComponent(user.username)}` });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
  }
}
