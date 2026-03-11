import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieName, getCurrentUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

const isSecure = process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false";

/** Cookie options used when clearing an auth cookie (matches the flags used when setting). */
const CLEAR_COOKIE = {
  httpOnly: true,
  secure: isSecure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

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

  // Clear all auth-related cookies so no stale MFA / session state
  // leaks into a subsequent login by the same or a different user.
  response.cookies.set(cookieName, "", CLEAR_COOKIE);
  response.cookies.set("docit-2fa-pending", "", CLEAR_COOKIE);
  response.cookies.set("docit-mfa-setup-pending", "", CLEAR_COOKIE);

  return response;
}
