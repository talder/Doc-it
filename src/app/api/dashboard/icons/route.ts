import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { ensureDir, getConfigDir } from "@/lib/config";

function getIconDir() {
  return path.join(getConfigDir(), "dashboard-icons");
}

/** POST — upload a dashboard icon image (FormData with "file" field) */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > 1 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 1 MB" }, { status: 400 });
    }

    const iconDir = getIconDir();
    await ensureDir(iconDir);

    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
    const id = randomUUID().slice(0, 8);
    // Sanitise the original filename for use as label
    const safeName = (file.name || "icon").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const filename = `${safeName}-${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(iconDir, filename), buffer);

    const url = `/api/dashboard/icons/${encodeURIComponent(filename)}`;
    return NextResponse.json({ url, filename }, { status: 201 });
  } catch (error) {
    console.error("Dashboard icon upload error:", error);
    return NextResponse.json({ error: "Failed to upload icon" }, { status: 500 });
  }
}

/** GET — list all uploaded dashboard icons */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const iconDir = getIconDir();
  const files = await fs.readdir(iconDir).catch(() => [] as string[]);
  const icons = files
    .filter((f) => /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f))
    .map((f) => ({ filename: f, url: `/api/dashboard/icons/${encodeURIComponent(f)}` }));
  return NextResponse.json({ icons });
}

/** DELETE — remove an uploaded dashboard icon by filename */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { filename } = await request.json().catch(() => ({ filename: "" }));
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  // Prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(getIconDir(), safe);

  try {
    await fs.unlink(filePath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Icon not found" }, { status: 404 });
  }
}
