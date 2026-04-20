/**
 * Shared notification helpers.
 *
 * Notifications are persisted as per-user JSON files under
 * `config/notifications/{username}.json`.
 */

import fs from "fs/promises";
import path from "path";
import { ensureDir } from "./config";
import { getUsers } from "./auth";
import { sendMail, getSmtpConfig } from "./email";
import { broadcastNotification } from "./notification-bus";

const NOTIF_DIR = path.join(process.cwd(), "config", "notifications");

/**
 * Sanitize a username so it is safe to use as a filename component.
 * Only allow alphanumerics, underscore and hyphen; replace others with "_".
 */
function sanitizeUsernameForPath(username: string): string {
  const trimmed = username.trim();
  // Replace any character that is not A-Z, a-z, 0-9, underscore or hyphen
  let safe = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Collapse multiple underscores
  safe = safe.replace(/_+/g, "_");
  // Avoid empty filenames
  if (!safe) {
    safe = "unknown";
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  type: "mention" | "new_user" | "bundle_ready";
  message: string;
  from: string;
  spaceSlug: string;
  docName: string;
  category: string;
  createdAt: string;
  read: boolean;
  /** Optional metadata for notification-type-specific data (e.g. bundle jobId) */
  meta?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

async function notifPath(username: string): Promise<string> {
  await ensureDir(NOTIF_DIR);
  const safeUsername = sanitizeUsernameForPath(username);
  return path.join(NOTIF_DIR, `${safeUsername}.json`);
}

export async function readNotifications(username: string): Promise<AppNotification[]> {
  try {
    const data = await fs.readFile(await notifPath(username), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function writeNotifications(username: string, notifs: AppNotification[]): Promise<void> {
  await fs.writeFile(await notifPath(username), JSON.stringify(notifs, null, 2), "utf-8");
  // Push the newest notification to any connected SSE clients immediately
  if (notifs.length > 0) broadcastNotification(username, notifs[0]);
}

// ---------------------------------------------------------------------------
// Admin: new-user notification (in-app + email)
// ---------------------------------------------------------------------------

/**
 * Notify all admin users that a new user has registered or logged in for the
 * first time via AD.  Creates an in-app notification for every admin and
 * sends an email to each admin that has an email address on file.
 *
 * Fire-and-forget — never throws.
 */
export async function notifyAdminsOfNewUser(
  username: string,
  email: string,
  authSource: "local" | "ad"
): Promise<void> {
  try {
    const users = await getUsers();
    const admins = users.filter((u) => u.isAdmin);
    if (admins.length === 0) return;

    const sourceLabel = authSource === "ad" ? "Active Directory" : "local registration";
    const message = `New user "${username}" joined via ${sourceLabel}. Assign them to a space in the admin panel.`;

    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "new_user",
      message,
      from: "system",
      spaceSlug: "",
      docName: "",
      category: "",
      createdAt: new Date().toISOString(),
      read: false,
    };

    // Write in-app notification for each admin
    await Promise.all(
      admins.map(async (admin) => {
        const notifs = await readNotifications(admin.username);
        notifs.unshift(notif);
        if (notifs.length > 50) notifs.length = 50;
        await writeNotifications(admin.username, notifs);
      })
    );

    // Send email to all admins that have an address
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return;

    const recipients = new Set<string>();
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    // Also include the global admin email if configured
    if (cfg.adminEmail) recipients.add(cfg.adminEmail);

    if (recipients.size === 0) return;

    const subject = `[Doc-it] New user registration: ${username}`;
    const html = `
      <h2 style="color:#333;font-family:sans-serif">New user on Doc-it</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:4px 12px;font-weight:bold">Username</td><td style="padding:4px 12px">${escapeHtml(username)}</td></tr>
        <tr><td style="padding:4px 12px;font-weight:bold">Email</td><td style="padding:4px 12px">${escapeHtml(email || "(not provided)")}</td></tr>
        <tr><td style="padding:4px 12px;font-weight:bold">Auth source</td><td style="padding:4px 12px">${escapeHtml(sourceLabel)}</td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:14px;margin-top:16px">
        Please assign this user to a space in the <strong>Admin panel → Users</strong>.
      </p>
      <p style="color:#888;font-size:12px;margin-top:16px">
        This is an automated notification from your Doc-it instance.
      </p>`;

    await Promise.all(
      [...recipients].map((to) => sendMail(to, subject, html).catch(() => {}))
    );
  } catch (err) {
    console.error("[notifications] Failed to notify admins of new user:", err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
