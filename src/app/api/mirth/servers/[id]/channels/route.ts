import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthChannels } from "@/lib/mirth";

/** GET /api/mirth/servers/[id]/channels — fetch channels with statuses for a single server. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const channels = await getMirthChannels(server);
    return NextResponse.json({ channels });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch channels" },
      { status: 502 },
    );
  }
}
