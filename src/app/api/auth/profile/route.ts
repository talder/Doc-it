import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword, verifyPassword, isPasswordInHistory, sanitizeUser } from "@/lib/auth";
import { isPasswordValid, validatePassword } from "@/lib/password-policy";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(sanitizeUser(user));
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const users = await getUsers();
    const idx = users.findIndex((u) => u.username === user.username);
    if (idx === -1) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update allowed fields
    if (body.fullName !== undefined) users[idx].fullName = body.fullName;
    if (body.email !== undefined) users[idx].email = body.email;
    if (body.preferences !== undefined) users[idx].preferences = { ...users[idx].preferences, ...body.preferences };

    // Password change
    if (body.newPassword) {
      const isForcedChange = users[idx].mustChangePassword === true && body.skipFirstLogin === true;

      // Verify current password unless this is a forced first-login change
      if (!isForcedChange) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password is required" }, { status: 400 });
        }
        const { match } = await verifyPassword(body.currentPassword, users[idx].passwordHash);
        if (!match) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
        }
      }

      // Enforce password policy
      const ctx = { username: users[idx].username, fullName: users[idx].fullName };
      if (!isPasswordValid(body.newPassword, ctx)) {
        const errors = validatePassword(body.newPassword, ctx);
        return NextResponse.json({ error: errors[0] ?? "Password does not meet requirements" }, { status: 400 });
      }

      // Check password history (NIS2: unlimited)
      const history = users[idx].passwordHistory ?? [];
      if (await isPasswordInHistory(body.newPassword, [users[idx].passwordHash, ...history])) {
        return NextResponse.json({ error: "You cannot reuse a previous password" }, { status: 400 });
      }

      // Store old hash in history, set new hash, clear forced-change flag
      users[idx].passwordHistory = [users[idx].passwordHash, ...history];
      users[idx].passwordHash = await hashPassword(body.newPassword);
      users[idx].mustChangePassword = false;
    }

    await writeUsers(users);
    return NextResponse.json(sanitizeUser(users[idx]));
  } catch (error) {
    console.error("Profile PUT error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
