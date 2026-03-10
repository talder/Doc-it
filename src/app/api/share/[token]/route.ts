import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ensureDir, getSpaceDir } from "@/lib/config";
import { parseFrontmatter } from "@/lib/frontmatter";

type Params = { params: Promise<{ token: string }> };

interface ShareEntry {
  token: string;
  docName: string;
  category: string;
  mode: "read" | "readwrite";
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  password?: string;
}

/** Find a share entry across all space share manifests */
async function findShare(token: string): Promise<{ entry: ShareEntry; slug: string } | null> {
  const sharesDir = path.join(process.cwd(), "config", "shares");
  await ensureDir(sharesDir);
  let files: string[] = [];
  try {
    files = await fs.readdir(sharesDir);
  } catch {
    return null;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await fs.readFile(path.join(sharesDir, file), "utf-8");
      const manifest = JSON.parse(data);
      const entry = (manifest.shares || []).find((s: ShareEntry) => s.token === token);
      if (entry) {
        const slug = file.replace(/\.json$/, "");
        return { entry, slug };
      }
    } catch {}
  }
  return null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  const result = await findShare(token);
  if (!result) {
    return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
  }

  const { entry, slug } = result;

  // Check expiry
  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
  }

  // If password-protected, return metadata only — content requires POST with password
  if (entry.password) {
    return NextResponse.json({
      docName: entry.docName,
      category: entry.category,
      spaceName: slug,
      mode: entry.mode,
      hasPassword: true,
    });
  }

  // Read the document
  const docPath = path.join(getSpaceDir(slug), entry.category, `${entry.docName}.md`);
  try {
    const raw = await fs.readFile(docPath, "utf-8");
    const { body, metadata } = parseFrontmatter(raw);
    return NextResponse.json({
      docName: entry.docName,
      category: entry.category,
      spaceName: slug,
      mode: entry.mode,
      content: body,
      metadata,
      hasPassword: false,
    });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}

/** POST /api/share/[token] — unlock password-protected share */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;

  const result = await findShare(token);
  if (!result) {
    return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
  }

  const { entry, slug } = result;

  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
  }

  if (!entry.password) {
    return NextResponse.json({ error: "This share link does not require a password" }, { status: 400 });
  }

  const { password } = await request.json();
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const { default: bcrypt } = await import("bcryptjs");
  const valid = await bcrypt.compare(password, entry.password);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  const docPath = path.join(getSpaceDir(slug), entry.category, `${entry.docName}.md`);
  try {
    const raw = await fs.readFile(docPath, "utf-8");
    const { body, metadata } = parseFrontmatter(raw);
    return NextResponse.json({
      docName: entry.docName,
      category: entry.category,
      spaceName: slug,
      mode: entry.mode,
      content: body,
      metadata,
      hasPassword: true,
    });
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}
