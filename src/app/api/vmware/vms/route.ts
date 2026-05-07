import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, fetchVMs } from "@/lib/vmware";

/** GET /api/vmware/vms — fetch VM inventory from vCenter. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await readVmwareConfig();

  if (!config.enabled) {
    return NextResponse.json({ error: "VMware module is not enabled" }, { status: 503 });
  }
  if (!config.vcenterUrl || !config.username || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware is not configured. Please set vCenter credentials in Admin settings." }, { status: 503 });
  }

  try {
    const vms = await fetchVMs(config);
    return NextResponse.json({ vms, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to connect to vCenter: ${message}` }, { status: 502 });
  }
}
