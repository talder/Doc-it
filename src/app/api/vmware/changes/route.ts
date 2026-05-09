import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, getVmwareChanges } from "@/lib/vmware";

/** GET /api/vmware/changes — return VM change history (host migrations, config changes). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "200"), 1000);
  const changes = getVmwareChanges(limit);
  return NextResponse.json({ changes });
}
