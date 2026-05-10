import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, mirthChannelAction } from "@/lib/mirth";
import type { ChannelAction } from "@/lib/mirth";

type Params = { params: Promise<{ id: string; channelId: string }> };

const VALID_ACTIONS: ChannelAction[] = ["start", "stop", "pause", "resume"];

/** POST /api/mirth/servers/[id]/channels/[channelId]/action — channel lifecycle. Admin only. */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden — admin rights required" }, { status: 403 });

  const { id, channelId } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { action?: string };
  const action = body.action as ChannelAction;
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await mirthChannelAction(server, channelId, action);
    return NextResponse.json({ ok: true, action, channelId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 502 },
    );
  }
}
