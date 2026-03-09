/**
 * Audit logging subsystem.
 *
 * Local JSONL file writing is ALWAYS active when audit is enabled.
 * Syslog is an optional secondary transport that forwards in addition
 * to — never instead of — local file writing.
 *
 * Usage (fire-and-forget, never throws):
 *   auditLog(request, { event: "auth.login", outcome: "success", actor: username });
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import type {
  AuditConfig,
  AuditEntry,
  AuditLogPayload,
  AuditSessionType,
  AuditSyslogConfig,
} from "./types";
import type { NextRequest } from "next/server";

// ── Constants ──────────────────────────────────────────────────────────────────

const AUDIT_CONFIG_FILE = "audit.json";
const AUDIT_KEY_FILE = "audit-key.json";
const LOGS_DIR = path.join(process.cwd(), "logs");

// ── Encryption helpers ─────────────────────────────────────────────────────────

/** Module-level key cache — loaded once per process. */
let _auditKeyCache: Buffer | null = null;

async function getAuditKey(): Promise<Buffer> {
  if (_auditKeyCache) return _auditKeyCache;

  const envSecret = process.env.AUDIT_LOG_SECRET;
  if (envSecret) {
    // Derive a 32-byte key via PBKDF2 when the env var is set
    _auditKeyCache = pbkdf2Sync(envSecret, "doc-it-audit-v1", 100_000, 32, "sha256");
    return _auditKeyCache;
  }

  // Otherwise use (or generate) a random per-install key stored in config
  const stored = await readJsonConfig<{ key?: string }>(AUDIT_KEY_FILE, {});
  if (stored.key) {
    _auditKeyCache = Buffer.from(stored.key, "base64");
    return _auditKeyCache;
  }

  const newKey = randomBytes(32);
  await writeJsonConfig(AUDIT_KEY_FILE, { key: newKey.toString("base64") });
  _auditKeyCache = newKey;
  return _auditKeyCache;
}

/** Encrypt a plaintext audit line. Returns `ENC:<iv>:<authTag>:<ciphertext>` (all base64). */
async function encryptLine(plain: string): Promise<string> {
  const key = await getAuditKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `ENC:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt an audit line. Transparent: if the line does not start with `ENC:`
 * it is returned as-is for backward compatibility with unencrypted logs.
 */
async function decryptLine(line: string): Promise<string> {
  if (!line.startsWith("ENC:")) return line;
  const rest = line.slice(4);
  const firstColon = rest.indexOf(":");
  const secondColon = rest.indexOf(":", firstColon + 1);
  if (firstColon === -1 || secondColon === -1) return line;
  const iv = Buffer.from(rest.slice(0, firstColon), "base64");
  const authTag = Buffer.from(rest.slice(firstColon + 1, secondColon), "base64");
  const ciphertext = Buffer.from(rest.slice(secondColon + 1), "base64");
  const key = await getAuditKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  localFile: { retentionDays: 365 },
  syslog: {
    enabled: false,
    host: "",
    port: 514,
    protocol: "udp",
    facility: "local0",
    appName: "doc-it",
    hostname: "",
  },
};

// ── RFC 5424 facility map ──────────────────────────────────────────────────────

const FACILITY_MAP: Record<string, number> = {
  kern: 0,
  user: 1,
  mail: 2,
  daemon: 3,
  auth: 4,
  syslog: 5,
  lpr: 6,
  news: 7,
  uucp: 8,
  cron: 9,
  authpriv: 10,
  ftp: 11,
  local0: 16,
  local1: 17,
  local2: 18,
  local3: 19,
  local4: 20,
  local5: 21,
  local6: 22,
  local7: 23,
};

// ── Retention state ────────────────────────────────────────────────────────────

/** Track last cleanup date to avoid scanning on every request. */
let lastCleanupDate = "";

// ── Config API ─────────────────────────────────────────────────────────────────

export async function getAuditConfig(): Promise<AuditConfig> {
  const stored = await readJsonConfig<Partial<AuditConfig>>(AUDIT_CONFIG_FILE, {});
  return {
    enabled: stored.enabled ?? DEFAULT_CONFIG.enabled,
    localFile: {
      retentionDays:
        stored.localFile?.retentionDays ?? DEFAULT_CONFIG.localFile.retentionDays,
    },
    syslog: {
      enabled: stored.syslog?.enabled ?? false,
      host: stored.syslog?.host ?? "",
      port: stored.syslog?.port ?? 514,
      protocol: stored.syslog?.protocol ?? "udp",
      facility: stored.syslog?.facility ?? "local0",
      appName: stored.syslog?.appName ?? "doc-it",
      hostname: stored.syslog?.hostname ?? "",
    },
  };
}

export async function saveAuditConfig(config: AuditConfig): Promise<void> {
  await writeJsonConfig(AUDIT_CONFIG_FILE, config);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit event writer.
 * Never throws — all errors are swallowed.
 */
export function auditLog(request: NextRequest, payload: AuditLogPayload): void {
  _writeAuditLog(request, payload).catch(() => {});
}

// ── Internal implementation ────────────────────────────────────────────────────

async function _writeAuditLog(
  request: NextRequest,
  payload: AuditLogPayload
): Promise<void> {
  const config = await getAuditConfig();
  if (!config.enabled) return;

  // Resolve actor — caller can pass explicitly; otherwise try auth context
  let actor = payload.actor ?? "";
  let sessionType: AuditSessionType = payload.sessionType ?? "anonymous";

  if (!actor) {
    try {
      // Lazily import to avoid circular dep issues
      const { getCurrentUser } = await import("./auth");
      const { getBearerToken } = await import("./api-keys");

      const token = await getBearerToken();
      if (token?.startsWith("dk_s_")) {
        sessionType = "service-key";
        // We don't resolve the key name here to keep it fast; caller should pass actor
        actor = "service-key";
      } else if (token?.startsWith("dk_u_")) {
        sessionType = "api-key";
        const user = await getCurrentUser();
        if (user) actor = user.username;
      } else {
        const user = await getCurrentUser();
        if (user) {
          actor = user.username;
          sessionType = "session";
        }
      }
    } catch {
      // best-effort; leave actor as ""
    }
  }

  if (!actor) actor = "anonymous";

  // Extract request metadata
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  const entry: AuditEntry = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    event: payload.event,
    outcome: payload.outcome,
    actor,
    sessionType,
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(payload.spaceSlug ? { spaceSlug: payload.spaceSlug } : {}),
    ...(payload.resource ? { resource: payload.resource } : {}),
    ...(payload.resourceType ? { resourceType: payload.resourceType } : {}),
    ...(payload.details ? { details: payload.details } : {}),
  };

  // Local JSONL — always
  await writeToLocalFile(entry, config.localFile.retentionDays);

  // Syslog — optional secondary forward
  if (config.syslog.enabled && config.syslog.host) {
    forwardToSyslog(entry, config.syslog).catch(() => {});
  }
}

// ── Local JSONL transport ──────────────────────────────────────────────────────

async function writeToLocalFile(entry: AuditEntry, retentionDays: number): Promise<void> {
  // Ensure logs directory exists
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const dateStr = entry.timestamp.slice(0, 10); // YYYY-MM-DD
  const logFile = path.join(LOGS_DIR, `audit-${dateStr}.jsonl`);

  // Encrypt then append JSONL line
  const plain = JSON.stringify(entry);
  const line = await encryptLine(plain);
  await fs.appendFile(logFile, line + "\n", "utf-8");

  // Run cleanup once per calendar day
  const today = new Date().toISOString().slice(0, 10);
  if (lastCleanupDate !== today) {
    lastCleanupDate = today;
    runRetentionCleanup(retentionDays).catch(() => {});
  }
}

async function runRetentionCleanup(retentionDays: number): Promise<void> {
  try {
    const entries = await fs.readdir(LOGS_DIR);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const entry of entries) {
      const match = entry.match(/^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (match && match[1] < cutoffStr) {
        await fs.unlink(path.join(LOGS_DIR, entry)).catch(() => {});
      }
    }
  } catch {
    // best-effort
  }
}

// ── Syslog transport ───────────────────────────────────────────────────────────

async function forwardToSyslog(
  entry: AuditEntry,
  cfg: AuditSyslogConfig
): Promise<void> {
  const facilityNum = FACILITY_MAP[cfg.facility] ?? 16; // default local0
  // Severity: informational (6) for success, warning (4) for failure
  const severity = entry.outcome === "success" ? 6 : 4;
  const pri = facilityNum * 8 + severity;

  const hostname = cfg.hostname || os.hostname() || "-";
  const appName = cfg.appName || "doc-it";
  const timestamp = entry.timestamp;

  // RFC 5424: <PRI>VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID SP SD SP MSG
  const msgContent = JSON.stringify({
    eventId: entry.eventId,
    event: entry.event,
    outcome: entry.outcome,
    actor: entry.actor,
    sessionType: entry.sessionType,
    ...(entry.spaceSlug ? { spaceSlug: entry.spaceSlug } : {}),
    ...(entry.resource ? { resource: entry.resource } : {}),
    ...(entry.ip ? { ip: entry.ip } : {}),
  });

  const message = `<${pri}>1 ${timestamp} ${hostname} ${appName} - audit.v1 - ${msgContent}`;
  const buf = Buffer.from(message, "utf-8");

  if (cfg.protocol === "udp") {
    await sendSyslogUdp(buf, cfg.host, cfg.port);
  } else {
    await sendSyslogTcp(buf, cfg.host, cfg.port);
  }
}

function sendSyslogUdp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    // Dynamic import to avoid bundling issues in non-Node environments
    import("dgram").then((dgram) => {
      const client = dgram.createSocket("udp4");
      client.send(buf, 0, buf.length, port, host, () => {
        client.close();
        resolve();
      });
      client.on("error", () => { client.close(); resolve(); });
    }).catch(() => resolve());
  });
}

function sendSyslogTcp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    import("net").then((net) => {
      const socket = net.createConnection(port, host, () => {
        // RFC 6587 octet counting framing: prepend length + space
        const framed = Buffer.concat([
          Buffer.from(`${buf.length} `),
          buf,
        ]);
        socket.write(framed);
        socket.end();
        resolve();
      });
      socket.setTimeout(3000);
      socket.on("error", () => { socket.destroy(); resolve(); });
      socket.on("timeout", () => { socket.destroy(); resolve(); });
    }).catch(() => resolve());
  });
}

// ── Log query utilities (used by /api/audit route) ─────────────────────────────

export interface AuditQueryParams {
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;    // YYYY-MM-DD
  event?: string;
  actor?: string;
  outcome?: string;
  spaceSlug?: string;
  text?: string;      // free-text match against resource/details
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryAuditLogs(params: AuditQueryParams): Promise<AuditQueryResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

  const dateFrom = params.dateFrom ?? "";
  const dateTo = params.dateTo ?? "";

  // Determine which log files to read
  let files: string[] = [];
  try {
    const all = await fs.readdir(LOGS_DIR);
    files = all
      .filter((f) => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .filter((f) => {
        const d = f.slice(6, 16); // YYYY-MM-DD
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      })
      .sort()
      .reverse(); // newest first
  } catch {
    return { entries: [], total: 0, page, pageSize };
  }

  // Read and filter entries
  const matched: AuditEntry[] = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(LOGS_DIR, file), "utf-8").catch(() => "");
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const plain = await decryptLine(line);
        const entry = JSON.parse(plain) as AuditEntry;

        if (params.event && entry.event !== params.event) continue;
        if (params.actor && !entry.actor.toLowerCase().includes(params.actor.toLowerCase())) continue;
        if (params.outcome && entry.outcome !== params.outcome) continue;
        if (params.spaceSlug && entry.spaceSlug !== params.spaceSlug) continue;
        if (params.text) {
          const needle = params.text.toLowerCase();
          const haystack = JSON.stringify(entry).toLowerCase();
          if (!haystack.includes(needle)) continue;
        }

        matched.push(entry);
      } catch {
        // skip malformed lines
      }
    }
  }

  // newest-first sort (entries within a file may be in insertion order)
  matched.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = matched.length;
  const start = (page - 1) * pageSize;
  const entries = matched.slice(start, start + pageSize);

  return { entries, total, page, pageSize };
}

export interface CalendarDayCounts {
  counts: Record<string, number>; // YYYY-MM-DD -> event count
}

export async function getCalendarCounts(
  year: number,
  month: number
): Promise<CalendarDayCounts> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `audit-${year}-${pad(month)}`;

  let files: string[] = [];
  try {
    const all = await fs.readdir(LOGS_DIR);
    files = all.filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"));
  } catch {
    return { counts: {} };
  }

  const counts: Record<string, number> = {};

  for (const file of files) {
    const d = file.slice(6, 16); // YYYY-MM-DD
    const content = await fs.readFile(path.join(LOGS_DIR, file), "utf-8").catch(() => "");
    // Count non-empty lines (each line is one audit entry, encrypted or plain)
    const lineCount = content.split("\n").filter(Boolean).length;
    if (lineCount > 0) counts[d] = lineCount;
  }

  return { counts };
}
