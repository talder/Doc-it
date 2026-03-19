/**
 * Crash logging subsystem.
 *
 * Writes unhandled errors (server + client) to local JSONL files.
 * No encryption — these are operational logs, not security-sensitive.
 *
 * Usage (fire-and-forget, never throws):
 *   writeCrashEntry({ source: "server", level: "fatal", message: "..." });
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { sendMail, getSmtpConfig } from "./email";
import type { CrashEntry, CrashSource, CrashLevel } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(process.cwd(), "logs");
const DEFAULT_RETENTION_DAYS = 90;

// ── Public API ─────────────────────────────────────────────────────────────────

export interface WriteCrashInput {
  source: CrashSource;
  level: CrashLevel;
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Write a crash entry to the local JSONL log.
 * Fire-and-forget: never throws.
 */
export function writeCrashEntry(input: WriteCrashInput): void {
  _writeCrash(input).catch(() => {});
}

async function _writeCrash(input: WriteCrashInput): Promise<void> {
  const entry: CrashEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: input.source,
    level: input.level,
    message: input.message,
    ...(input.stack ? { stack: input.stack } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    ...(input.details ? { details: input.details } : {}),
  };

  await fs.mkdir(LOGS_DIR, { recursive: true });

  const dateStr = entry.timestamp.slice(0, 10);
  const logFile = path.join(LOGS_DIR, `crash-${dateStr}.jsonl`);
  await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf-8");

  // Also log to stderr for container/systemd visibility
  console.error(`[crash-log] ${entry.level}/${entry.source}: ${entry.message}`);

  // Fire-and-forget email notification
  _notifyCrashEmail(entry).catch(() => {});
}

// ── Email notification ─────────────────────────────────────────────────────────

async function _notifyCrashEmail(entry: CrashEntry): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg.adminEmail || !cfg.host) return;

  const urgency = entry.level === "fatal" ? "FATAL" : "ERROR";
  const subject = `[Doc-it ${urgency}] ${entry.source} crash: ${entry.message.slice(0, 80)}`;

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Level</td><td style="padding:4px 12px">${esc(urgency)}</td></tr>`);
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Source</td><td style="padding:4px 12px">${esc(entry.source)}</td></tr>`);
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Time</td><td style="padding:4px 12px">${esc(entry.timestamp)}</td></tr>`);
  rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Message</td><td style="padding:4px 12px">${esc(entry.message)}</td></tr>`);
  if (entry.url) rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">URL</td><td style="padding:4px 12px">${esc(entry.url)}</td></tr>`);
  if (entry.method) rows.push(`<tr><td style="padding:4px 12px;font-weight:bold">Method</td><td style="padding:4px 12px">${esc(entry.method)}</td></tr>`);

  const html = `
    <h2 style="color:#dc2626">⚠ Doc-it Crash Report</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${rows.join("\n")}
    </table>
    ${entry.stack ? `<pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;margin-top:16px">${esc(entry.stack)}</pre>` : ""}
    <p style="color:#888;font-size:12px;margin-top:16px">
      This is an automated crash report from your Doc-it instance.
      View all crash logs in the Admin panel → Crash Logs tab.
    </p>`;

  await sendMail(cfg.adminEmail, subject, html);
}

// ── Query logs (admin UI) ──────────────────────────────────────────────────────

export interface CrashLogQuery {
  dateFrom?: string;
  dateTo?: string;
  source?: string;
  level?: string;
  text?: string;
  page?: number;
  pageSize?: number;
}

export interface CrashLogQueryResult {
  entries: CrashEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryCrashLogs(params: CrashLogQuery): Promise<CrashLogQueryResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  await fs.mkdir(LOGS_DIR, { recursive: true });

  // List crash-*.jsonl files
  const dirEntries = await fs.readdir(LOGS_DIR);
  let crashFiles = dirEntries
    .filter((f) => f.startsWith("crash-") && f.endsWith(".jsonl"))
    .sort()
    .reverse(); // newest first

  // Date range filter on filenames (crash-YYYY-MM-DD.jsonl)
  if (params.dateFrom) {
    const from = params.dateFrom;
    crashFiles = crashFiles.filter((f) => f.slice(6, 16) >= from);
  }
  if (params.dateTo) {
    const to = params.dateTo;
    crashFiles = crashFiles.filter((f) => f.slice(6, 16) <= to);
  }

  // Read and parse all matching files
  const allEntries: CrashEntry[] = [];
  for (const file of crashFiles) {
    const content = await fs.readFile(path.join(LOGS_DIR, file), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        allEntries.push(JSON.parse(line));
      } catch { /* skip malformed lines */ }
    }
  }

  // Sort newest first
  allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply filters
  let filtered = allEntries;
  if (params.source) {
    filtered = filtered.filter((e) => e.source === params.source);
  }
  if (params.level) {
    filtered = filtered.filter((e) => e.level === params.level);
  }
  if (params.text) {
    const needle = params.text.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.message.toLowerCase().includes(needle) ||
        (e.stack?.toLowerCase().includes(needle)) ||
        (e.url?.toLowerCase().includes(needle))
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const entries = filtered.slice(start, start + pageSize);

  return { entries, total, page, pageSize };
}

// ── Retention cleanup ──────────────────────────────────────────────────────────

export async function cleanupOldCrashLogs(retentionDays = DEFAULT_RETENTION_DAYS): Promise<number> {
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dirEntries = await fs.readdir(LOGS_DIR);
  let removed = 0;

  for (const file of dirEntries) {
    if (!file.startsWith("crash-") || !file.endsWith(".jsonl")) continue;
    const fileDate = file.slice(6, 16); // YYYY-MM-DD
    if (fileDate < cutoffStr) {
      await fs.unlink(path.join(LOGS_DIR, file)).catch(() => {});
      removed++;
    }
  }

  return removed;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
