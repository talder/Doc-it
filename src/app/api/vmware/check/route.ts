import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed } from "@/lib/vmware";

/** GET /api/vmware/check — returns { allowed: boolean } for the Topbar visibility check. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ allowed: false });
  const allowed = await isVmwareAllowed(user.username, user.isAdmin);
  return NextResponse.json({ allowed });
}
