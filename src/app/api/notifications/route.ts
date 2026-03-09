import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { ensureDir } from "@/lib/config";
import { sendMail } from "@/lib/email";

const NOTIF_DIR = path.join(process.cwd(), "config", "notifications");

interface Notification {
  id: string;
  type: "mention";
  message: string;
  from: string;
  spaceSlug: string;
  docName: string;
  category: string;
  createdAt: string;
  read: boolean;
}

async function getUserNotifPath(username: string) {
  await ensureDir(NOTIF_DIR);
  return path.join(NOTIF_DIR, `${username}.json`);
}

async function readNotifications(username: string): Promise<Notification[]> {
  try {
    const data = await fs.readFile(await getUserNotifPath(username), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeNotifications(username: string, notifs: Notification[]) {
  await fs.writeFile(await getUserNotifPath(username), JSON.stringify(notifs, null, 2), "utf-8");
}

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

    const notif: Notification = {
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
