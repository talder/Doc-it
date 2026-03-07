import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword, getUserByUsername } from "@/lib/auth";
import type { User } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const users = await getUsers();
  // Return sanitized user list
  const sanitized = users.map(({ username, isAdmin, isSuperAdmin, createdAt, lastLogin }) => ({
    username,
    isAdmin,
    isSuperAdmin,
    createdAt,
    lastLogin,
  }));

  return NextResponse.json(sanitized);
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { username, password, isAdmin } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  if (username.length < 2) {
    return NextResponse.json({ error: "Username must be at least 2 characters" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const newUser: User = {
    username,
    passwordHash: hashPassword(password),
    isAdmin: !!isAdmin,
    createdAt: new Date().toISOString(),
  };

  const users = await getUsers();
  users.push(newUser);
  await writeUsers(users);

  return NextResponse.json(
    { username: newUser.username, isAdmin: newUser.isAdmin, createdAt: newUser.createdAt },
    { status: 201 }
  );
}
