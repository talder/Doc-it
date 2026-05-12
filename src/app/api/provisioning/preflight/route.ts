import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runPreflightChecks } from "@/lib/provisioning";
import type { ProvisioningRequest } from "@/lib/provisioning-shared";

/** POST /api/provisioning/preflight — run all pre-flight checks. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as ProvisioningRequest;
  if (!body.deviceName || !body.macAddress) {
    return NextResponse.json({ error: "deviceName and macAddress are required" }, { status: 400 });
  }

  try {
    const results = await runPreflightChecks(body);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preflight checks failed" },
      { status: 500 },
    );
  }
}
