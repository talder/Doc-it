import { NextResponse } from "next/server";
import { getCurrentSanitizedUser, hasUsers } from "@/lib/auth";

export async function GET() {
  const usersExist = await hasUsers();

  if (!usersExist) {
    return NextResponse.json({ needsSetup: true });
  }

  const user = await getCurrentSanitizedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
