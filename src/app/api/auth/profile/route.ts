import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword, sanitizeUser } from "@/lib/auth";

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

    // Password change (requires current password)
    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }
      if (hashPassword(body.currentPassword) !== users[idx].passwordHash) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
      }
      if (body.newPassword.length < 4) {
        return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 });
      }
      users[idx].passwordHash = hashPassword(body.newPassword);
    }

    await writeUsers(users);
    return NextResponse.json(sanitizeUser(users[idx]));
  } catch (error) {
    console.error("Profile PUT error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
