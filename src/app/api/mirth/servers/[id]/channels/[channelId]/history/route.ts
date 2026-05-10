import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthChannelHistory, getChannelStateLog } from "@/lib/mirth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, channelId } = await params;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "60");

  const [history, stateLog] = await Promise.all([
    Promise.resolve(getMirthChannelHistory(id, channelId, limit)),
    Promise.resolve(getChannelStateLog(id, channelId, 20)),
  ]);

  // Return chronological order for charting (oldest first)
  return NextResponse.json({ history: history.reverse(), stateLog });
}
