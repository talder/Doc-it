import { NextResponse } from "next/server";
import { getCurrentUser, getUsers } from "@/lib/auth";

/**
 * GET /api/changelog/users
 * Returns a minimal list of usernames for the assignee picker.
 * Accessible to any authenticated user (not admin-only).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = await getUsers();
  // Return only username + fullName — no passwords, tokens, or other PII
  const users = all
    .filter(u => !u.isLocked)
    .map(u => ({ username: u.username, fullName: u.fullName ?? null }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return NextResponse.json({ users });
}
