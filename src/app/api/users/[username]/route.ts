import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

type Params = { params: Promise<{ username: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { username: targetUsername } = await params;
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === targetUsername);
  if (idx === -1) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const target = users[idx];

  // Protect super admin
  if (target.isSuperAdmin && admin.username !== target.username) {
    return NextResponse.json({ error: "Cannot modify the system owner" }, { status: 403 });
  }

  const { newUsername, password, isAdmin } = await request.json();

  if (newUsername && newUsername !== targetUsername) {
    if (newUsername.length < 2) {
      return NextResponse.json({ error: "Username must be at least 2 characters" }, { status: 400 });
    }
    if (users.some((u) => u.username === newUsername)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    users[idx].username = newUsername;
  }

  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    users[idx].passwordHash = hashPassword(password);
  }

  if (isAdmin !== undefined) {
    if (target.isSuperAdmin && !isAdmin) {
      return NextResponse.json({ error: "Cannot remove admin from system owner" }, { status: 403 });
    }
    users[idx].isAdmin = isAdmin;
  }

  await writeUsers(users);

  const changes: Record<string, unknown> = {};
  if (newUsername && newUsername !== targetUsername) changes.newUsername = newUsername;
  if (password) changes.passwordChanged = true;
  if (isAdmin !== undefined) changes.isAdmin = isAdmin;
  auditLog(request, { event: "user.update", outcome: "success", actor: admin.username, resource: targetUsername, resourceType: "user", details: changes });

  const { passwordHash, ...safe } = users[idx];
  return NextResponse.json(safe);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { username: targetUsername } = await params;
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const users = await getUsers();
  const target = users.find((u) => u.username === targetUsername);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.isSuperAdmin) {
    return NextResponse.json({ error: "Cannot delete the system owner" }, { status: 403 });
  }

  const adminCount = users.filter((u) => u.isAdmin).length;
  if (target.isAdmin && adminCount <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 403 });
  }

  const filtered = users.filter((u) => u.username !== targetUsername);
  await writeUsers(filtered);

  auditLog(_req, { event: "user.delete", outcome: "success", actor: admin.username, resource: targetUsername, resourceType: "user" });
  return NextResponse.json({ success: true });
}
