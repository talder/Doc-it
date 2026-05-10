import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, mirthBatchChannelAction, ChannelAction } from "@/lib/mirth";

const VALID_ACTIONS: ChannelAction[] = ["start", "stop", "pause", "resume"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const channelIds: string[] = Array.isArray(body.channelIds) ? body.channelIds : [];
  const action = String(body.action ?? "") as ChannelAction;

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }
  if (channelIds.length === 0) {
    return NextResponse.json({ error: "channelIds must be a non-empty array" }, { status: 400 });
  }

  try {
    const result = await mirthBatchChannelAction(server, channelIds, action);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch action failed" }, { status: 500 });
  }
}
