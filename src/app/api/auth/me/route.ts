import { NextResponse } from "next/server";
import { getCurrentUser, sanitizeUser, hasUsers } from "@/lib/auth";
import { getDashboardRole } from "@/lib/dashboard-access";

export async function GET() {
  const usersExist = await hasUsers();

  if (!usersExist) {
    return NextResponse.json({ needsSetup: true });
  }

  const fullUser = await getCurrentUser();
  if (!fullUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dashboardRole = await getDashboardRole(fullUser);

  return NextResponse.json({ user: sanitizeUser(fullUser), dashboardRole });
}
