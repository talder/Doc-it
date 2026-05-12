import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeProvisioning } from "@/lib/provisioning";
import type { ProvisioningRequest } from "@/lib/provisioning-shared";

/** POST /api/provisioning/execute — execute full provisioning pipeline. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as ProvisioningRequest;
  if (!body.deviceName || !body.macAddress || !body.deviceTypeId || !body.siteId || !body.prefixId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await executeProvisioning(body, user.username);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provisioning failed" },
      { status: 500 },
    );
  }
}
