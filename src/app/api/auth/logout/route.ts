import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieName, getCurrentUser } from "@/lib/auth";
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
  response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
  return response;
}
