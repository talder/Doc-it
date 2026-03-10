/**
 * Change Log module — operational change tracking.
 *
 * Global immutable log stored at config/changelog.json.
 * Entries are never edited or deleted once created.
 * Optionally forwards to syslog with a [CHANGE] marker.
 */

import os from "os";
import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { getAuditConfig } from "./audit";

// ── Types ────────────────────────────────────────────────────────────

export type ChangeCategory =
  | "Disk"
  | "Network"
  | "Security"
  | "Software"
  | "Hardware"
  | "Configuration"
  | "Other";

export type ChangeRisk = "Low" | "Medium" | "High" | "Critical";

export type ChangeStatus = "Completed" | "Failed" | "Rolled Back";

export interface ChangeLinkedDoc {
  name: string;
  category: string;
  spaceSlug: string;
}

export interface ChangeLogEntry {
  id: string;              // CHG-0001
  date: string;            // YYYY-MM-DD (when the change was made)
  author: string;          // username (auto-filled)
  system: string;          // free-text asset/host name
  category: ChangeCategory;
  description: string;
  impact: string;
  risk: ChangeRisk;
  status: ChangeStatus;
  linkedDoc?: ChangeLinkedDoc;
  createdAt: string;       // ISO timestamp (when the record was logged)
}

export interface ChangeLogSettings {
  retentionYears: number;
}

export interface ChangeLogData {
  nextNumber: number;
  entries: ChangeLogEntry[];
}

// ── Constants ────────────────────────────────────────────────────────

const CHANGELOG_FILE = "changelog.json";
const SETTINGS_FILE = "changelog-settings.json";
const DEFAULT_SETTINGS: ChangeLogSettings = { retentionYears: 5 };

const EMPTY: ChangeLogData = { nextNumber: 1, entries: [] };

/** Return the ISO date string (YYYY-MM-DD) that marks the oldest entry to keep. */
function retentionCutoff(retentionYears: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - retentionYears);
  return d.toISOString().slice(0, 10);
}

const FACILITY_MAP: Record<string, number> = {
  kern: 0, user: 1, mail: 2, daemon: 3, auth: 4, syslog: 5, lpr: 6,
  news: 7, uucp: 8, cron: 9, authpriv: 10, ftp: 11,
  local0: 16, local1: 17, local2: 18, local3: 19,
  local4: 20, local5: 21, local6: 22, local7: 23,
};

// ── Storage ──────────────────────────────────────────────────────────

export async function readChangeLog(): Promise<ChangeLogData> {
  return readJsonConfig<ChangeLogData>(CHANGELOG_FILE, { ...EMPTY, entries: [] });
}

async function writeChangeLog(data: ChangeLogData): Promise<void> {
  await writeJsonConfig(CHANGELOG_FILE, data);
}

export async function readChangeLogSettings(): Promise<ChangeLogSettings> {
  return readJsonConfig<ChangeLogSettings>(SETTINGS_FILE, { ...DEFAULT_SETTINGS });
}

export async function saveChangeLogSettings(settings: ChangeLogSettings): Promise<void> {
  await writeJsonConfig(SETTINGS_FILE, settings);
}

// ── Public API ───────────────────────────────────────────────────────

export interface CreateChangeFields {
  date: string;
  author: string;
  system: string;
  category: ChangeCategory;
  description: string;
  impact: string;
  risk: ChangeRisk;
  status: ChangeStatus;
  linkedDoc?: ChangeLinkedDoc;
}

export async function addChangeLogEntry(fields: CreateChangeFields): Promise<ChangeLogEntry> {
  const data = await readChangeLog();
  const num = data.nextNumber || 1;
  const id = `CHG-${String(num).padStart(6, "0")}`;

  const entry: ChangeLogEntry = {
    id,
    date: fields.date,
    author: fields.author,
    system: fields.system,
    category: fields.category,
    description: fields.description,
    impact: fields.impact,
    risk: fields.risk,
    status: fields.status,
    ...(fields.linkedDoc ? { linkedDoc: fields.linkedDoc } : {}),
    createdAt: new Date().toISOString(),
  };

  data.entries.push(entry);
  data.nextNumber = num + 1;

  // Prune entries that have aged out of the retention window
  const settings = await readChangeLogSettings();
  const cutoff = retentionCutoff(settings.retentionYears);
  data.entries = data.entries.filter((e) => e.date >= cutoff);

  await writeChangeLog(data);

  // Fire-and-forget syslog
  sendChangeToSyslog(entry).catch(() => {});

  return entry;
}

/** Return unique system names from existing entries (for autocomplete). */
export async function getKnownSystems(): Promise<string[]> {
  const data = await readChangeLog();
  const systems = new Set<string>();
  for (const e of data.entries) {
    if (e.system) systems.add(e.system);
  }
  return [...systems].sort();
}

/** Filter entries by search query and optional field filters. */
export function filterChangeLog(
  entries: ChangeLogEntry[],
  opts: { q?: string; from?: string; to?: string; category?: string; system?: string },
): ChangeLogEntry[] {
  let result = entries;
  if (opts.from) result = result.filter((e) => e.date >= opts.from!);
  if (opts.to) result = result.filter((e) => e.date <= opts.to!);
  if (opts.category) result = result.filter((e) => e.category === opts.category);
  if (opts.system) result = result.filter((e) => e.system.toLowerCase() === opts.system!.toLowerCase());
  if (opts.q) {
    const q = opts.q.toLowerCase();
    result = result.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.system.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.impact.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q),
    );
  }
  return result;
}

// ── Syslog ───────────────────────────────────────────────────────────

async function sendChangeToSyslog(entry: ChangeLogEntry): Promise<void> {
  const config = await getAuditConfig();
  if (!config.syslog.enabled || !config.syslog.host) return;

  const cfg = config.syslog;
  const facilityNum = FACILITY_MAP[cfg.facility] ?? 16;
  // Severity: notice (5) — operational change notification
  const pri = facilityNum * 8 + 5;

  const hostname = cfg.hostname || os.hostname() || "-";
  const appName = cfg.appName || "doc-it";
  const timestamp = entry.createdAt;
  const host = cfg.host.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim();

  const msg = `[CHANGE] ${entry.id} | System: ${entry.system} | Category: ${entry.category} | Status: ${entry.status} | Risk: ${entry.risk} | Author: ${entry.author} | Description: ${entry.description} | Impact: ${entry.impact}`;
  const message = `<${pri}>1 ${timestamp} ${hostname} ${appName} - change.v1 - ${msg}`;
  const buf = Buffer.from(message, "utf-8");

  if (cfg.protocol === "udp") {
    await sendUdp(buf, host, cfg.port);
  } else {
    await sendTcp(buf, host, cfg.port);
  }
}

function sendUdp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    import("dgram").then((dgram) => {
      const client = dgram.createSocket("udp4");
      client.send(buf, 0, buf.length, port, host, () => { client.close(); resolve(); });
      client.on("error", () => { client.close(); resolve(); });
    }).catch(() => resolve());
  });
}

function sendTcp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    import("net").then((net) => {
      const socket = net.createConnection(port, host, () => {
        const framed = Buffer.concat([Buffer.from(`${buf.length} `), buf]);
        socket.write(framed);
        socket.end();
        resolve();
      });
      socket.setTimeout(5000);
      socket.on("error", () => { socket.destroy(); resolve(); });
      socket.on("timeout", () => { socket.destroy(); resolve(); });
    }).catch(() => resolve());
  });
}
