/**
 * Node.js-only instrumentation.
 *
 * 1. Increases the default EventEmitter max-listener limit to suppress
 *    spurious MaxListenersExceeded warnings from SSE streams.
 * 2. Registers the automated backup scheduler.
 *
 * This file is dynamically imported by instrumentation.ts only when
 * NEXT_RUNTIME === "nodejs", keeping Node-only modules out of the Edge bundle.
 */

import { getBackupConfig, runBackup, getBackupState } from "./lib/backup";

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
