import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInfraAuditLog } from "@/lib/provisioning";
import type { InfraAuditTab } from "@/lib/provisioning-shared";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const entries = getInfraAuditLog({
    tab: (sp.get("tab") as InfraAuditTab) || undefined,
    user: sp.get("user") || undefined,
    action: sp.get("action") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    limit: Number(sp.get("limit")) || 500,
  });

  return NextResponse.json({ entries });
}
