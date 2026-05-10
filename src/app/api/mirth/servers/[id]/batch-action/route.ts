import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, mirthBatchChannelAction, logMirthHistory, ChannelAction } from "@/lib/mirth";
import { auditLog } from "@/lib/audit";

const VALID_ACTIONS: ChannelAction[] = ["start", "stop", "pause", "resume"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
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
    auditLog(req, {
      event: "mirth.channel.batch-action",
      outcome: result.failed.length === 0 ? "success" : "failure",
      resourceType: "mirth-channel",
      details: { serverId: id, serverName: server.name, action, succeeded: result.succeeded, failed: result.failed },
    });
    logMirthHistory({
      serverId: id, serverName: server.name,
      eventType: "channel.batch-action",
      actor: user.username,
      details: { action, count: channelIds.length, succeeded: result.succeeded.length, failed: result.failed.length },
    });
    return NextResponse.json(result);
  } catch (err) {
    auditLog(req, {
      event: "mirth.channel.batch-action",
      outcome: "failure",
      resourceType: "mirth-channel",
      details: { serverId: id, serverName: server.name, action, channelIds, error: err instanceof Error ? err.message : "Batch action failed" },
    });
    logMirthHistory({
      serverId: id, serverName: server.name,
      eventType: "channel.batch-action",
      actor: user.username,
      details: { action, count: channelIds.length, outcome: "failure", error: err instanceof Error ? err.message : "Batch action failed" },
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch action failed" }, { status: 500 });
  }
}
