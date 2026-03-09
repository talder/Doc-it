import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword, isPasswordInHistory, resetUserMfa, invalidateUserSessions } from "@/lib/auth";
import { isPasswordValid, validatePassword } from "@/lib/password-policy";
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

  const body = await request.json();
  const { newUsername, password, isAdmin, unlock, resetMfa } = body;

  // Admin: reset MFA for user (forces re-enrollment on next login)
  if (resetMfa === true) {
    await resetUserMfa(targetUsername);
    await invalidateUserSessions(targetUsername);
    auditLog(request, { event: "auth.mfa.reset", outcome: "success", actor: admin.username, resource: targetUsername, resourceType: "user" });
    const updatedUsers = await getUsers();
    const u = updatedUsers.find((u) => u.username === targetUsername);
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { passwordHash, ...safe } = u;
    return NextResponse.json(safe);
  }

  // Unlock account
  if (unlock === true) {
    users[idx].isLocked = false;
    users[idx].failedLoginAttempts = 0;
    delete users[idx].lockedAt;
    await writeUsers(users);
    auditLog(request, { event: "auth.account.unlocked", outcome: "success", actor: admin.username, resource: targetUsername, resourceType: "user" });
    const { passwordHash, ...safe } = users[idx];
    return NextResponse.json(safe);
  }

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
    // Enforce password policy (use target username for context)
    if (!isPasswordValid(password, { username: users[idx].username })) {
      const errors = validatePassword(password, { username: users[idx].username });
      return NextResponse.json({ error: errors[0] ?? "Password does not meet requirements" }, { status: 400 });
    }
    // Check password history
    const history = users[idx].passwordHistory ?? [];
    if (await isPasswordInHistory(password, [users[idx].passwordHash, ...history])) {
      return NextResponse.json({ error: "Cannot reuse a previous password" }, { status: 400 });
    }
    // Rotate history
    users[idx].passwordHistory = [users[idx].passwordHash, ...history];
    users[idx].passwordHash = await hashPassword(password);
    users[idx].mustChangePassword = true;
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
