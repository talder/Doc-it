import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import {
  getStorageRoot,
  readStorageConfig,
  saveStorageConfig,
} from "@/lib/config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const root = getStorageRoot();
  const cfg = readStorageConfig();
  return NextResponse.json({
    storageRoot: cfg.storageRoot ?? null,   // null = using default (process.cwd())
    effectiveRoot: root,
    paths: {
      docs:    path.join(root, "docs"),
      archive: path.join(root, "archive"),
      history: path.join(root, "history"),
      trash:   path.join(root, "trash"),
    },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { storageRoot } = body as { storageRoot: string };

  if (!storageRoot || typeof storageRoot !== "string" || !storageRoot.trim()) {
    return NextResponse.json({ error: "storageRoot is required" }, { status: 400 });
  }
  if (!path.isAbsolute(storageRoot.trim())) {
    return NextResponse.json({ error: "storageRoot must be an absolute path" }, { status: 400 });
  }

  await saveStorageConfig(storageRoot.trim());
  return NextResponse.json({ success: true, storageRoot: storageRoot.trim() });
}
