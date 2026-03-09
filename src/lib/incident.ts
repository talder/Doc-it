/**
 * Security incident notifications (NIS2 compliance).
 *
 * Sends email alerts to the configured admin email when security-relevant
 * events occur.  All calls are fire-and-forget — failures are logged but
 * never block the caller.
 */

import { sendMail, getSmtpConfig } from "./email";

export type SecurityEventKind =
  | "account_locked"
  | "repeated_login_failures"
  | "rate_limit_exceeded";

interface SecurityEventPayload {
  kind: SecurityEventKind;
  username?: string;
  ip?: string;
  details?: string;
  timestamp?: string;
}

const SUBJECT_MAP: Record<SecurityEventKind, string> = {
  account_locked: "Account Locked",
  repeated_login_failures: "Repeated Login Failures",
  rate_limit_exceeded: "Rate Limit Exceeded",
};

/**
 * Send a security incident notification to the admin.
 * Fire-and-forget: never throws, never blocks.
 */
export function notifySecurityEvent(payload: SecurityEventPayload): void {
  _send(payload).catch((err) => {
    console.error("[incident] Failed to send security notification:", err);
  });
}

async function _send(payload: SecurityEventPayload): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg.adminEmail || !cfg.host) return; // no admin email configured

  const ts = payload.timestamp ?? new Date().toISOString();
  const subject = `[Doc-it Security] ${SUBJECT_MAP[payload.kind] ?? payload.kind}`;

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Event</td><td style="padding:4px 12px">${escapeHtml(SUBJECT_MAP[payload.kind] ?? payload.kind)}</td></tr>`);
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Time</td><td style="padding:4px 12px">${escapeHtml(ts)}</td></tr>`);
  if (payload.username) rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">User</td><td style="padding:4px 12px">${escapeHtml(payload.username)}</td></tr>`);
  if (payload.ip) rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">IP</td><td style="padding:4px 12px">${escapeHtml(payload.ip)}</td></tr>`);
  if (payload.details) rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Details</td><td style="padding:4px 12px">${escapeHtml(payload.details)}</td></tr>`);

  const html = `
    <h2 style="color:#c0392b">⚠ Doc-it Security Alert</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${rows.join("\n")}
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px">
      This is an automated notification from your Doc-it instance.
      Review the audit logs in the admin panel for full details.
    </p>`;

  await sendMail(cfg.adminEmail, subject, html);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
