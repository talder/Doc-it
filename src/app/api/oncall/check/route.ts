import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isOnCallAllowed } from "@/lib/oncall";

/** GET /api/oncall/check — returns {allowed: boolean} for the current user */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ allowed: false });
  const allowed = await isOnCallAllowed(user.username, user.isAdmin);
  return NextResponse.json({ allowed });
}
