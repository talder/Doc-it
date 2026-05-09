import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, fetchVMs, getCachedInventory, setCachedInventory } from "@/lib/vmware";

/** GET /api/vmware/vms — fetch VM inventory from vCenter (with caching). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await readVmwareConfig();
  if (!config.enabled) return NextResponse.json({ error: "VMware module is not enabled" }, { status: 503 });
  if (!config.vcenterUrl || !config.username || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware is not configured. Please set vCenter credentials in Admin settings." }, { status: 503 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  // Return cached inventory if fresh and refresh not requested
  if (!refresh) {
    const cached = await getCachedInventory(config.cacheTtlMinutes ?? 15);
    if (cached) {
      return NextResponse.json({ vms: cached.vms, fetchedAt: cached.fetchedAt, hostStats: cached.hostStats, fromCache: true });
    }
  }

  try {
    const result = await fetchVMs(config);
    // Persist to cache
    await setCachedInventory(result).catch(() => {});
    return NextResponse.json({ vms: result.vms, fetchedAt: result.fetchedAt, hostStats: result.hostStats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to connect to vCenter: ${message}` }, { status: 502 });
  }
}
