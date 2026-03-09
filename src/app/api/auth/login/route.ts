import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, getUsers, writeUsers, hashPassword, verifyPassword, createSession, getSessionCookieName } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

const MAX_FAILED_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "user not found" } });
      // Same error message — don't reveal whether user exists
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Account lockout check
    if (user.isLocked) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "account locked" } });
      return NextResponse.json(
        { error: "Account is locked. Please contact an administrator." },
        { status: 403 }
      );
    }

    const { match, needsRehash } = await verifyPassword(password, user.passwordHash);

    if (!match) {
      // Increment failure counter and lock if threshold reached
      const users = await getUsers();
      const idx = users.findIndex((u) => u.username === username);
      if (idx !== -1) {
        const attempts = (users[idx].failedLoginAttempts ?? 0) + 1;
        users[idx].failedLoginAttempts = attempts;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          users[idx].isLocked = true;
          users[idx].lockedAt = new Date().toISOString();
          await writeUsers(users);
          auditLog(request, { event: "auth.account.locked", outcome: "failure", actor: username, sessionType: "anonymous", details: { attempts } });
          return NextResponse.json(
            { error: "Account locked after too many failed attempts. Please contact an administrator." },
            { status: 403 }
          );
        }
        await writeUsers(users);
      }
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "wrong password", attempts: (user.failedLoginAttempts ?? 0) + 1 } });
      const remaining = MAX_FAILED_ATTEMPTS - ((user.failedLoginAttempts ?? 0) + 1);
      return NextResponse.json(
        { error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before lockout.` },
        { status: 401 }
      );
    }

    // Successful password — reset failure counter and optionally rehash
    const users = await getUsers();
    const idx = users.findIndex((u) => u.username === username);
    if (idx !== -1) {
      let dirty = false;
      if (users[idx].failedLoginAttempts) { users[idx].failedLoginAttempts = 0; dirty = true; }
      if (needsRehash) { users[idx].passwordHash = await hashPassword(password); dirty = true; }
      if (dirty) await writeUsers(users);
    }

    // If TOTP is enabled, don't issue a session yet — request the second factor
    if (user.totpEnabled) {
      const pending = Buffer.from(
        JSON.stringify({
          username,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
        })
      ).toString("base64");

      const r2fa = NextResponse.json({ requires2FA: true });
      r2fa.cookies.set("docit-2fa-pending", pending, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 5 * 60,
      });
      return r2fa;
    }

    const sessionId = await createSession(username);

    const response = NextResponse.json({
      success: true,
      username: user.username,
      mustChangePassword: user.mustChangePassword === true,
    });
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    auditLog(request, { event: "auth.login", outcome: "success", actor: username, sessionType: "session" });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
