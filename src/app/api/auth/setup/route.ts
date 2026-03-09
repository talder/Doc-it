import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { hasUsers, getUsers, writeUsers, hashPassword, createSession, getSessionCookieName } from "@/lib/auth";
import { writeJsonConfig, ensureDir, getSpaceDir } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import type { Space, User } from "@/lib/types";

export async function POST(request: NextRequest) {
  // Only allow setup if no users exist yet
  const usersExist = await hasUsers();
  if (usersExist) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
  }

  const { username, password, confirmPassword, spaceName } = await request.json();

  if (!username || !password || !spaceName) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const { isPasswordValid, validatePassword } = await import("@/lib/password-policy");
  if (!isPasswordValid(password, { username: username.trim() })) {
    const errors = validatePassword(password, { username: username.trim() });
    return NextResponse.json({ error: errors[0] ?? "Password does not meet requirements" }, { status: 400 });
  }

  // Create admin user
  const newUser: User = {
    username: username.trim(),
    passwordHash: await hashPassword(password),
    isAdmin: true,
    isSuperAdmin: true,
    createdAt: new Date().toISOString(),
  };

  const users = await getUsers();
  users.push(newUser);
  await writeUsers(users);

  // Create first space
  const slug = spaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const newSpace: Space = {
    id: randomUUID(),
    name: spaceName.trim(),
    slug: slug || "space-" + randomUUID().slice(0, 8),
    createdBy: newUser.username,
    createdAt: new Date().toISOString(),
    permissions: { [newUser.username]: "admin" },
  };

  await writeJsonConfig("spaces.json", [newSpace]);

  // Create space dir with default General category
  const generalDir = `${getSpaceDir(newSpace.slug)}/General`;
  await ensureDir(generalDir);

  // Create session and set cookie
  const sessionId = await createSession(newUser.username);

  auditLog(request, { event: "auth.setup", outcome: "success", actor: newUser.username, sessionType: "session", details: { spaceName: spaceName.trim() } });

  const response = NextResponse.json({ success: true });
  response.cookies.set(getSessionCookieName(), sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
