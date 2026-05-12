import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProvisioningHistory } from "@/lib/provisioning";

/** GET /api/provisioning/history — recent provisioning entries. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = getProvisioningHistory(200);
  return NextResponse.json({ entries });
}
