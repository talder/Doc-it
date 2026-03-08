import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, hashPassword, createSession, getSessionCookieName } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "user not found" } });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "wrong password" } });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const sessionId = await createSession(username);

    const response = NextResponse.json({ success: true, username: user.username });
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
