import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { readNotifications, writeNotifications } from "@/lib/notifications";
import type { AppNotification } from "@/lib/notifications";

/** GET /api/notifications — get current user's notifications */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifs = await readNotifications(user.username);
  return NextResponse.json({ notifications: notifs });
}

/** POST /api/notifications — create notification (for mentions) or dismiss */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Dismiss action
  if (body.action === "dismiss") {
    const notifs = await readNotifications(user.username);
    const updated = notifs.filter((n) => n.id !== body.id);
    await writeNotifications(user.username, updated);
    return NextResponse.json({ success: true });
  }

  if (body.action === "dismiss-all") {
    await writeNotifications(user.username, []);
    return NextResponse.json({ success: true });
  }

  if (body.action === "mark-read") {
    const notifs = await readNotifications(user.username);
    const updated = notifs.map((n) => ({ ...n, read: true }));
    await writeNotifications(user.username, updated);
    return NextResponse.json({ success: true });
  }

  // Create mention notification for target user
  if (body.action === "mention") {
    const { targetUsername, spaceSlug, docName, category } = body;
    if (!targetUsername || !spaceSlug || !docName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "mention",
      message: `${user.username} mentioned you in "${docName}"`,
      from: user.username,
      spaceSlug,
      docName,
      category: category || "",
      createdAt: new Date().toISOString(),
      read: false,
    };

    const notifs = await readNotifications(targetUsername);
    notifs.unshift(notif);
    // Keep max 50 notifications
    if (notifs.length > 50) notifs.length = 50;
    await writeNotifications(targetUsername, notifs);

    // Send email notification
    try {
      // Read user file to get email
      const usersFile = path.join(process.cwd(), "config", "users.json");
      const usersData = await fs.readFile(usersFile, "utf-8").catch(() => "[]");
      const users = JSON.parse(usersData);
      const targetUser = users.find((u: { username: string }) => u.username === targetUsername);
      if (targetUser?.email) {
        sendMail(
          targetUser.email,
          `[Doc-it] ${user.username} mentioned you in "${docName}"`,
          `<p><strong>${user.username}</strong> mentioned you in the document <strong>"${docName}"</strong> (${category}) in space <strong>${spaceSlug}</strong>.</p>
           <p>Log in to Doc-it to view the document.</p>`
        ).catch(() => {}); // fire-and-forget
      }
    } catch {}

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
