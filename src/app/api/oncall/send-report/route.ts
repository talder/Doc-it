import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readOnCallData,
  readOnCallSettings,
  saveOnCallSettings,
  filterOnCallEntries,
  buildWeeklyReportHtml,
  getPreviousWeekRange,
} from "@/lib/oncall";
import { sendMail } from "@/lib/email";

/** POST /api/oncall/send-report — manually trigger weekly report (admin only) */
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await readOnCallSettings();
  if (!settings.emailEnabled || settings.emailRecipients.length === 0) {
    return NextResponse.json({ error: "Email not configured or disabled" }, { status: 400 });
  }

  const { from, to } = getPreviousWeekRange(new Date());
  const data = await readOnCallData();
  const entries = filterOnCallEntries(data.entries, { from, to });
  const html = buildWeeklyReportHtml(entries, from, to);
  const subject = `On-Call Weekly Report: ${from} – ${to}`;

  let sent = 0;
  for (const recipient of settings.emailRecipients) {
    const ok = await sendMail(recipient, subject, html);
    if (ok) sent++;
  }

  // Update last sent timestamp
  settings.lastWeeklyReportAt = new Date().toISOString();
  await saveOnCallSettings(settings);

  return NextResponse.json({ sent, total: settings.emailRecipients.length, from, to });
}
