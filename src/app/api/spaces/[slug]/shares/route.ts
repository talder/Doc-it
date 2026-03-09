import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string }> };

interface ShareEntry {
  token: string;
  docName: string;
  category: string;
  mode: "read" | "readwrite";
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  password?: string; // bcrypt hash if set
}

interface SharesManifest {
  shares: ShareEntry[];
}

function getSharesDir() {
  return path.join(process.cwd(), "config", "shares");
}

function getSharesPath(slug: string) {
  return path.join(getSharesDir(), `${slug}.json`);
}

async function readShares(slug: string): Promise<SharesManifest> {
  try {
    const data = await fs.readFile(getSharesPath(slug), "utf-8");
    return JSON.parse(data);
  } catch {
    return { shares: [] };
  }
}

async function writeShares(slug: string, manifest: SharesManifest) {
  const dir = getSharesDir();
  await ensureDir(dir);
  await fs.writeFile(getSharesPath(slug), JSON.stringify(manifest, null, 2), "utf-8");
}

/** GET /api/spaces/[slug]/shares?doc=category/name */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const docKey = request.nextUrl.searchParams.get("doc") || "";
  const manifest = await readShares(slug);

  // Filter by doc if specified, remove expired
  const now = new Date().toISOString();
  const shares = manifest.shares.filter((s) => {
    if (s.expiresAt && s.expiresAt < now) return false;
    if (docKey) {
      return `${s.category}/${s.docName}` === docKey;
    }
    return true;
  });

  // Don't expose password hashes
  const safe = shares.map(({ password, ...rest }) => ({
    ...rest,
    hasPassword: !!password,
  }));

  return NextResponse.json({ shares: safe });
}

/** POST /api/spaces/[slug]/shares — create or revoke */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const body = await request.json();

  if (body.action === "revoke") {
    const manifest = await readShares(slug);
    manifest.shares = manifest.shares.filter((s) => s.token !== body.token);
    await writeShares(slug, manifest);
    return NextResponse.json({ success: true });
  }

  // Create new share
  const { docName, category, mode, expiresAt, password } = body;
  if (!docName || !category) {
    return NextResponse.json({ error: "docName and category required" }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("base64url");

  let passwordHash: string | undefined;
  if (password) {
    const { default: bcrypt } = await import("bcryptjs");
    passwordHash = await bcrypt.hash(password, 10);
  }

  const entry: ShareEntry = {
    token,
    docName,
    category,
    mode: mode === "readwrite" ? "readwrite" : "read",
    createdBy: user.username,
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(passwordHash ? { password: passwordHash } : {}),
  };

  const manifest = await readShares(slug);
  manifest.shares.push(entry);
  await writeShares(slug, manifest);

  return NextResponse.json({
    token,
    url: `/share/${token}`,
    mode: entry.mode,
    expiresAt: entry.expiresAt,
    hasPassword: !!passwordHash,
  });
}
