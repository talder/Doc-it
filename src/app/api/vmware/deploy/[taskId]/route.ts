import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, getTaskStatus } from "@/lib/vmware";

type Ctx = { params: Promise<{ taskId: string }> };

/** GET /api/vmware/deploy/[taskId] — poll vCenter task status */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted)
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });

  const { taskId } = await ctx.params;

  try {
    const status = await getTaskStatus(config, taskId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
