import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, powerAction } from "@/lib/vmware";

type Params = { params: Promise<{ vmId: string }> };

/** POST /api/vmware/vms/{vmId}/power — start|stop|reset|suspend|shutdown|reboot */
export async function POST(request: NextRequest, { params }: Params) {
  const { vmId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await request.json();
  const validActions = ["start", "stop", "reset", "suspend", "shutdown", "reboot"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Valid: ${validActions.join(", ")}` }, { status: 400 });
  }

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });
  }

  const result = await powerAction(config, vmId, action as "start" | "stop" | "reset" | "suspend" | "shutdown" | "reboot");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
