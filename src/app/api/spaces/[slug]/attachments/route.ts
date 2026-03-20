import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import {
  hashBuffer, storeBlob, findExistingRefs, createRef,
  updateAllRefsName, mimeFromFilename,
} from "@/lib/blobstore";

type Params = { params: Promise<{ slug: string }> };

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// ── POST: upload new file (or detect duplicate) ───────────────────────────────
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "General";
  const docName = (formData.get("docName") as string) || "";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: "File exceeds the 50 MB upload limit" }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = hashBuffer(buffer);

  // Check for existing blob with the same content
  const existingRefs = findExistingRefs(sha256);
  if (existingRefs.length > 0) {
    // Return duplicate signal — client must confirm name choice before ref is created
    const existingNames = [...new Set(existingRefs.map((r) => r.original_name))];
    return NextResponse.json({ isDuplicate: true, sha256, existingNames });
  }

  // New blob — store and create ref immediately
  const mime = file.type || mimeFromFilename(file.name);
  await storeBlob(sha256, buffer, mime, user.username);

  const id = crypto.randomUUID();
  createRef(id, sha256, file.name, slug, category, docName, user.username);

  const url = `/api/spaces/${slug}/attachments/${encodeURIComponent(id)}?category=${encodeURIComponent(category)}`;
  return NextResponse.json({
    filename: id,
    originalName: file.name,
    mimeType: mime,
    size: file.size,
    category,
    url,
  });
}

// ── PUT: confirm duplicate — create ref with chosen name ──────────────────────
export async function PUT(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { sha256, chosenName, category = "General", docName = "", size = 0, mimeType = "" }
    = await request.json() as {
        sha256: string; chosenName: string; category?: string;
        docName?: string; size?: number; mimeType?: string;
      };

  if (!sha256 || !chosenName)
    return NextResponse.json({ error: "sha256 and chosenName required" }, { status: 400 });

  // Rename all existing refs to the chosen name (system-wide)
  updateAllRefsName(sha256, chosenName);

  // Create a new ref for this upload instance
  const id = crypto.randomUUID();
  createRef(id, sha256, chosenName, slug, category, docName, user.username);

  const url = `/api/spaces/${slug}/attachments/${encodeURIComponent(id)}?category=${encodeURIComponent(category)}`;
  return NextResponse.json({
    filename: id,
    originalName: chosenName,
    mimeType: mimeType || mimeFromFilename(chosenName),
    size,
    category,
    url,
  });
}
