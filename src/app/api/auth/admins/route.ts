import { NextResponse } from "next/server";
import { getUsers, getCurrentUser } from "@/lib/auth";

/** Returns admin contact info — only available to authenticated users */
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const users = await getUsers();
    const admins = users
      .filter((u) => u.isAdmin)
      .map((u) => ({
        username: u.username,
        email: u.email || "",
      }));

    return NextResponse.json(admins);
  } catch (error) {
    console.error("Admin contacts error:", error);
    return NextResponse.json({ error: "Failed to load admin contacts" }, { status: 500 });
  }
}
