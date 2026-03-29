import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { processAgentReport } from "@/lib/cmdb";
import type { AgentReport } from "@/lib/cmdb";

/**
 * POST /api/cmdb/agent-report
 *
 * Receives a hardware/software inventory report from a client agent.
 * Auth: service API key (Bearer dk_s_*) or session.
 * Body: { hostname, os?, ipAddresses?, hardwareInfo?, softwareInventory?, collectedAt }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: AgentReport;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.hostname?.trim()) {
    return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  }

  const actor = user.username || "agent";
  const asset = await processAgentReport(
    { ...body, hostname: body.hostname.trim(), collectedAt: body.collectedAt || new Date().toISOString() },
    actor,
  );

  return NextResponse.json({ asset: { id: asset.id, name: asset.name } });
}
