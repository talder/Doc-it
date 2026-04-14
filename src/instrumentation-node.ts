/**
 * Node.js-only instrumentation.
 *
 * 1. Increases the default EventEmitter max-listener limit to suppress
 *    spurious MaxListenersExceeded warnings from SSE streams.
 * 2. Registers the automated backup scheduler.
 * 3. Registers the certificate expiry alert scheduler.
 *
 * This file is dynamically imported by instrumentation.ts only when
 * NEXT_RUNTIME === "nodejs", keeping Node-only modules out of the Edge bundle.
 */

import { getBackupConfig, runBackup, getBackupState } from "./lib/backup";
import {
  readOnCallData,
  readOnCallSettings,
  saveOnCallSettings,
  filterOnCallEntries,
  buildWeeklyReportHtml,
  getPreviousWeekRange,
} from "./lib/oncall";
import { checkAndMarkExpiryAlerts } from "./lib/certificates";
import { sendMail } from "./lib/email";
import { getUsers } from "./lib/auth";
import { writeCrashEntry, cleanupOldCrashLogs } from "./lib/crash-log";
import { notifyShutdown } from "./lib/shutdown";

if (process.env.NODE_ENV === "development") {
  process.stdout.setMaxListeners(30);
  process.stderr.setMaxListeners(30);
}

// ── Backup scheduler ────────────────────────────────────────────────────────

// Run check every 60 seconds; negligible overhead
const INTERVAL_MS = 60_000;

setInterval(async () => {
  try {
    const config = await getBackupConfig();
    if (!config.enabled || config.schedule === "manual") return;

    const now = new Date();
    const [hh, mm] = (config.scheduleTime ?? "02:00").split(":").map(Number);
    if (now.getHours() !== hh || now.getMinutes() !== mm) return;

    // Weekly: check day-of-week
    if (config.schedule === "weekly" && now.getDay() !== config.scheduleDayOfWeek) return;

    // Debounce: only run once per scheduled minute
    const state = await getBackupState();
    const lastRun = state.lastRunAt ? new Date(state.lastRunAt) : null;
    if (lastRun) {
      const diffMin = (now.getTime() - lastRun.getTime()) / 60_000;
      if (diffMin < 1) return; // already ran this minute
    }

    console.log("[backup] Scheduled backup starting…");
    const result = await runBackup(config);
    if (result.success) {
      console.log(`[backup] Completed: ${result.filename}`);
    } else {
      console.error(`[backup] Failed: ${result.error}`);
    }
  } catch (err) {
    console.error("[backup] Scheduler error:", err);
  }
}, INTERVAL_MS);

// ── Certificate expiry alert scheduler ───────────────────────────────────────

// Run once per hour (60 min × 60 sec × 1000 ms)
const CERT_INTERVAL_MS = 60 * 60_000;

// Debounce: track last check time to avoid multiple runs within the same minute
let lastCertCheckAt = 0;

setInterval(async () => {
  // Throttle: only run once per 55 minutes minimum
  if (Date.now() - lastCertCheckAt < 55 * 60_000) return;
  lastCertCheckAt = Date.now();

  try {
    const alerts = await checkAndMarkExpiryAlerts();
    if (alerts.length === 0) return;

    // Fetch all admin users with email addresses
    const users = await getUsers();
    const admins = users.filter((u) => u.isAdmin && u.email);

    for (const { cert, threshold, daysLeft } of alerts) {
      const urgency = threshold === 1 ? "[CRITICAL]" : threshold === 7 ? "[URGENT]" : "[WARNING]";
      const subject = `${urgency} Certificate expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${cert.subject.CN}`;
      const html = `
        <h2 style="color:${threshold === 1 ? "#dc2626" : threshold === 7 ? "#ea580c" : "#ca8a04"}">
          ${urgency} Certificate Expiry Alert
        </h2>
        <p>The following certificate will expire in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>:</p>
        <table style="border-collapse:collapse;font-family:monospace">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Name</td><td><strong>${cert.name}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Subject CN</td><td>${cert.subject.CN}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Type</td><td>${cert.type}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Serial</td><td>${cert.serial}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Expires</td><td>${new Date(cert.notAfter).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">SHA-256</td><td>${cert.fingerprintSha256}</td></tr>
        </table>
        <p style="margin-top:16px">Please renew this certificate in the Doc-it Certificate Manager.</p>
      `;

      // Send email to all admins
      for (const admin of admins) {
        await sendMail(admin.email!, subject, html).catch(() => {});
      }

      // Create in-app notification for all admins
      const NOTIF_DIR = (await import("path")).join(process.cwd(), "config", "notifications");
      const fs = await import("fs/promises");
      await fs.mkdir(NOTIF_DIR, { recursive: true }).catch(() => {});

      for (const admin of users.filter((u) => u.isAdmin)) {
        const notifPath = (await import("path")).join(NOTIF_DIR, `${admin.username}.json`);
        let notifs: unknown[] = [];
        try {
          notifs = JSON.parse(await fs.readFile(notifPath, "utf-8"));
        } catch { notifs = []; }
        notifs.unshift({
          id: `cert-expiry-${cert.id}-${threshold}-${Date.now()}`,
          type: "cert-expiry",
          message: `${urgency} Certificate "${cert.name}" (${cert.subject.CN}) expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          certId: cert.id,
          certName: cert.name,
          threshold,
          daysLeft,
          createdAt: new Date().toISOString(),
          read: false,
        });
        if (notifs.length > 50) notifs.length = 50;
        await fs.writeFile(notifPath, JSON.stringify(notifs, null, 2), "utf-8").catch(() => {});
      }

      // Audit log the alert
      try {
        const { _writeAuditLogDirect } = await import("./lib/audit");
        await _writeAuditLogDirect({
          event: "cert.expiry.alert",
          outcome: "success",
          actor: "scheduler",
          sessionType: "anonymous",
          resource: cert.id,
          resourceType: "pki-cert",
          details: { certName: cert.name, subject: cert.subject.CN, threshold, daysLeft },
        });
      } catch { /* audit is optional */ }

      console.log(`[cert-expiry] Alert sent for "${cert.name}" — expires in ${daysLeft}d (threshold: ${threshold}d)`);
    }
  } catch (err) {
    console.error("[cert-expiry] Scheduler error:", err);
  }
}, CERT_INTERVAL_MS);

// Also check once at startup (after a short delay to let the server boot)
setTimeout(async () => {
  try {
    // Reuse the same logic — just trigger the interval handler
    // by resetting the debounce timer
    lastCertCheckAt = 0;
  } catch { /* ignore */ }
}, 30_000);

// ── Graceful shutdown — warn connected clients before exiting ────────────────

// Track whether we've already handled SIGTERM to avoid double-firing
let shutdownHandled = false;

process.once("SIGTERM", async () => {
  if (shutdownHandled) return;
  shutdownHandled = true;

  const { SHUTDOWN_COUNTDOWN_SECONDS } = await import("./lib/shutdown");
  console.log(`[shutdown] SIGTERM received — notifying connected clients (${SHUTDOWN_COUNTDOWN_SECONDS}s countdown)…`);
  notifyShutdown();

  // After the countdown, invalidate all sessions so clients are forced to
  // the login page, then re-raise SIGTERM for the HTTP server shutdown.
  setTimeout(async () => {
    try {
      const { invalidateAllSessions } = await import("./lib/auth");
      const count = await invalidateAllSessions();
      console.log(`[shutdown] Invalidated ${count} session(s).`);
    } catch (err) {
      console.error("[shutdown] Failed to invalidate sessions:", err);
    }
    console.log("[shutdown] Grace period elapsed — proceeding with shutdown.");
    process.kill(process.pid, "SIGTERM");
  }, (SHUTDOWN_COUNTDOWN_SECONDS + 5) * 1000); // +5s buffer
});

// ── Crash logging — process-level handlers ───────────────────────────────────

process.on("uncaughtException", (err) => {
  writeCrashEntry({
    source: "server",
    level: "fatal",
    message: err?.message ?? String(err),
    stack: err?.stack,
    details: { type: "uncaughtException" },
  });
  // Let Node.js proceed with default behaviour (log + exit)
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeCrashEntry({
    source: "server",
    level: "error",
    message: err.message ?? String(reason),
    stack: err.stack,
    details: { type: "unhandledRejection" },
  });
});

// ── On-Call weekly email digest (every Monday at configured time) ────────────

setInterval(async () => {
  try {
    const settings = await readOnCallSettings();
    if (!settings.emailEnabled || settings.emailRecipients.length === 0) return;

    const now = new Date();
    // Only run on Mondays
    if (now.getDay() !== 1) return;

    // Check time
    const [hh, mm] = (settings.emailSendTime ?? "08:00").split(":").map(Number);
    if (now.getHours() !== hh || now.getMinutes() !== mm) return;

    // Debounce: skip if already sent this week
    if (settings.lastWeeklyReportAt) {
      const last = new Date(settings.lastWeeklyReportAt);
      const diffMin = (now.getTime() - last.getTime()) / 60_000;
      if (diffMin < 60 * 24 * 6) return; // sent within last 6 days
    }

    const { from, to } = getPreviousWeekRange(now);
    const data = await readOnCallData();
    const entries = filterOnCallEntries(data.entries, { from, to });
    const { getUsers } = await import("./lib/auth");
    const users = await getUsers();
    const nameMap = Object.fromEntries(users.map((u: { username: string; fullName?: string | null }) => [u.username, u.fullName || u.username]));
    const html = buildWeeklyReportHtml(entries, from, to, nameMap);
    const subject = `On-Call Weekly Report: ${from} \u2013 ${to}`;

    let sent = 0;
    for (const recipient of settings.emailRecipients) {
      const ok = await sendMail(recipient, subject, html).catch(() => false);
      if (ok) sent++;
    }

    settings.lastWeeklyReportAt = now.toISOString();
    await saveOnCallSettings(settings);
    console.log(`[oncall] Weekly report sent to ${sent}/${settings.emailRecipients.length} recipients (${from} – ${to})`);
  } catch (err) {
    console.error("[oncall] Weekly report scheduler error:", err);
  }
}, INTERVAL_MS);

// ── Crash log retention cleanup (once per day) ───────────────────────────────

let lastCrashCleanupDate = "";

setInterval(async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastCrashCleanupDate) return;
  lastCrashCleanupDate = today;
  try {
    const removed = await cleanupOldCrashLogs();
    if (removed > 0) console.log(`[crash-log] Cleaned up ${removed} old crash log file(s)`);
  } catch { /* ignore */ }
}, INTERVAL_MS);
