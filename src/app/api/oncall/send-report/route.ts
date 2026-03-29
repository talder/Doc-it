import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readOnCallData,
  readOnCallSettings,
  saveOnCallSettings,
  filterOnCallEntries,
  buildWeeklyReportHtml,
  getPreviousWeekRange,
} from "@/lib/oncall";
import { getUsers } from "@/lib/auth";
import { sendMail } from "@/lib/email";

/**
 * POST /api/oncall/send-report
 *
 * Body (all optional):
 *   from  — YYYY-MM-DD start date (default: previous week Monday)
 *   to    — YYYY-MM-DD end date   (default: previous week Sunday)
 *   email — single recipient address (default: configured emailRecipients)
 *   title — report heading override (default: "On-Call Report")
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const customEmail = typeof body.email === "string" ? body.email.trim() : "";
  const reportTitle = typeof body.title === "string" ? body.title : "On-Call Report";

  // Determine recipients
  let recipients: string[];
  if (customEmail) {
    recipients = [customEmail];
  } else {
    const settings = await readOnCallSettings();
    if (!settings.emailEnabled || settings.emailRecipients.length === 0) {
      return NextResponse.json({ error: "Email not configured or disabled" }, { status: 400 });
    }
    recipients = settings.emailRecipients;
  }

  // Determine date range
  const defaultRange = getPreviousWeekRange(new Date());
  const from = typeof body.from === "string" && body.from ? body.from : defaultRange.from;
  const to   = typeof body.to   === "string" && body.to   ? body.to   : defaultRange.to;

  const data = await readOnCallData();
  const entries = filterOnCallEntries(data.entries, { from, to });
  const users = await getUsers();
  const nameMap = Object.fromEntries(users.map((u) => [u.username, u.fullName || u.username]));
  const html = buildWeeklyReportHtml(entries, from, to, nameMap, reportTitle);
  const subject = `${reportTitle}: ${from} – ${to}`;

  let sent = 0;
  for (const recipient of recipients) {
    const ok = await sendMail(recipient, subject, html);
    if (ok) sent++;
  }

  // Update last sent timestamp when using default recipients
  if (!customEmail) {
    const settings = await readOnCallSettings();
    settings.lastWeeklyReportAt = new Date().toISOString();
    await saveOnCallSettings(settings);
  }

  return NextResponse.json({ sent, total: recipients.length, from, to });
}
