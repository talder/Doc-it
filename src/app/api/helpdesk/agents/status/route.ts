import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentStatuses, setAgentStatus } from "@/lib/helpdesk";
import type { AgentStatusValue } from "@/lib/helpdesk";

const VALID_STATUSES: AgentStatusValue[] = ["online", "offline", "busy", "away"];

/** GET /api/helpdesk/agents/status — list all agent statuses */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const statuses = await getAgentStatuses();
  return NextResponse.json({ statuses });
}

/** POST /api/helpdesk/agents/status — set current user's status */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await request.json();
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status. Must be: online, offline, busy, away" }, { status: 400 });
  }

  const entry = await setAgentStatus(user.username, status);
  return NextResponse.json({ status: entry });
}
