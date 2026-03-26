import { NextResponse } from "next/server";
import { getCurrentUser, getUsers } from "@/lib/auth";
import { isOnCallAllowed } from "@/lib/oncall";

/** GET /api/oncall/users — lightweight user list for the assisted-by picker */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const all = await getUsers();
  const users = all.map((u) => ({
    username: u.username,
    fullName: u.fullName ?? null,
  }));

  return NextResponse.json({ users });
}
