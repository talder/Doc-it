import { NextRequest, NextResponse } from "next/server";
import { getUsers, writeUsers, hashPassword, createSession, getSessionCookieName } from "@/lib/auth";
import { notifyAdminNewUser } from "@/lib/email";
import { auditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPasswordValid, validatePassword } from "@/lib/password-policy";

export async function POST(request: NextRequest) {
  const blocked = checkRateLimit(request, "auth");
  if (blocked) return blocked;

  try {
    const { username, password, email } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    if (username.length < 2 || username.length > 32) {
      return NextResponse.json({ error: "Username must be 2-32 characters" }, { status: 400 });
    }

    if (!isPasswordValid(password, { username })) {
      const errors = validatePassword(password, { username });
      return NextResponse.json({ error: errors[0] ?? "Password does not meet requirements" }, { status: 400 });
    }

    const users = await getUsers();
    if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const newUser = {
      username,
      passwordHash: await hashPassword(password),
      isAdmin: false,
      email: email || "",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await writeUsers(users);

    // Notify admin (fire and forget)
    notifyAdminNewUser(username, email || "").catch(() => {});

    // Log the user in immediately
    const sessionId = await createSession(username);
    const response = NextResponse.json({ success: true, username });
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    auditLog(request, { event: "auth.register", outcome: "success", actor: username, sessionType: "session" });
    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
