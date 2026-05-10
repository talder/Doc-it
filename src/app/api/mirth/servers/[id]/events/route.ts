import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthEvents } from "@/lib/mirth";

/** GET /api/mirth/servers/[id]/events?limit&offset&level */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  try {
    const result = await getMirthEvents(server, {
      limit:  Number(sp.get("limit") ?? 50),
      offset: Number(sp.get("offset") ?? 0),
      level:  sp.get("level") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch events" },
      { status: 502 },
    );
  }
}
