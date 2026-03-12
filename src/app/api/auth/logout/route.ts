import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieName, getCurrentUser, useSecureCookies } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const cookieName = getSessionCookieName();
  const sessionId = request.cookies.get(cookieName)?.value;

  // Capture actor before session is deleted
  const user = await getCurrentUser();

  if (sessionId) {
    await deleteSession(sessionId);
  }

  auditLog(request, { event: "auth.logout", outcome: "success", actor: user?.username, sessionType: "session" });

  const response = NextResponse.json({ success: true });

  /** Cookie options used when clearing an auth cookie (matches the flags used when setting). */
  const clearCookie = {
    httpOnly: true,
    secure: useSecureCookies(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  // Clear all auth-related cookies so no stale MFA / session state
  // leaks into a subsequent login by the same or a different user.
  response.cookies.set(cookieName, "", clearCookie);
  response.cookies.set("docit-2fa-pending", "", clearCookie);
  response.cookies.set("docit-mfa-setup-pending", "", clearCookie);

  return response;
}
