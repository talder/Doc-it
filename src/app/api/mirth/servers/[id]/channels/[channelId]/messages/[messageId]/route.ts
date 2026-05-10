import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthMessage } from "@/lib/mirth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string; messageId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, channelId, messageId } = await params;
  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const message = await getMirthMessage(server, channelId, messageId);
  if (!message) return NextResponse.json({ error: "Message not found or no content" }, { status: 404 });
  return NextResponse.json({ message });
}
