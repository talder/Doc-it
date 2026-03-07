import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieName } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const cookieName = getSessionCookieName();
  const sessionId = request.cookies.get(cookieName)?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
  return response;
}
