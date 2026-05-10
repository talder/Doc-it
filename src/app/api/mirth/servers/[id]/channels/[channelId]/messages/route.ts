import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthMessages } from "@/lib/mirth";

type Params = { params: Promise<{ id: string; channelId: string }> };

/** GET /api/mirth/servers/[id]/channels/[channelId]/messages */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, channelId } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  try {
    const result = await getMirthMessages(server, channelId, {
      limit:     Number(sp.get("limit") ?? 20),
      offset:    Number(sp.get("offset") ?? 0),
      status:    sp.get("status") ?? undefined,
      startDate: sp.get("startDate") ?? undefined,
      endDate:   sp.get("endDate") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch messages" },
      { status: 502 },
    );
  }
}
