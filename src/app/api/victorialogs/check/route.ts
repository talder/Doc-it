import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditConfig } from "@/lib/audit";

/** GET /api/victorialogs/check — returns {allowed} based on whether syslog host is configured. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ allowed: false });
  const cfg = await getAuditConfig();
  return NextResponse.json({ allowed: !!(cfg.syslog?.host?.trim()) });
}
