import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthVersion } from "@/lib/mirth";

/** GET /api/mirth/servers/[id]/test — test connectivity and return Mirth version. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const version = await getMirthVersion(server);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
}
