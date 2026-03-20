import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve, normalize } from "path";

const DOCS_DIR = join(process.cwd(), "documentation");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
  }

  // Prevent path traversal: normalise and ensure the resolved path stays inside DOCS_DIR
  const resolved = resolve(join(DOCS_DIR, normalize(file) + ".md"));
  if (!resolved.startsWith(DOCS_DIR + "/") && resolved !== DOCS_DIR) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const content = readFileSync(resolved, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
