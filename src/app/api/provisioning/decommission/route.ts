import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeDecommission } from "@/lib/provisioning";

/** POST /api/provisioning/decommission — decommission a device (delete from Netbox, DNS, DHCP). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const deviceName = body.deviceName?.trim();
  if (!deviceName) {
    return NextResponse.json({ error: "deviceName is required" }, { status: 400 });
  }

  try {
    const result = await executeDecommission(deviceName, user.username);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Decommission failed" },
      { status: 500 },
    );
  }
}
