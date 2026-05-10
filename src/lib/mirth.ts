/**
 * Mirth Connect Integration Module — server-only library.
 *
 * Supports multiple Mirth Connect servers. Each server record is stored in
 * the SQLite `mirth_servers` table. Credentials are AES-256-GCM encrypted
 * via crypto.ts. Self-signed SSL is handled per-server via the
 * NODE_TLS_REJECT_UNAUTHORIZED env-var pattern (same as VMware module).
 *
 * All authenticated doc-it users can read data.
 * Channel actions (start/stop/pause/resume) are admin-only at the API layer.
 */

import { getDb } from "./config";
import { encryptField, decryptField } from "./crypto";
import { XMLParser } from "fast-xml-parser";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MirthServerRecord {
  id: string;
  name: string;
  url: string;
  username: string;
  password_encrypted: string;
  ignore_ssl_errors: number; // SQLite stores booleans as 0/1
  enabled: number;
  sort_order: number;
  created_at: string;
}

export interface MirthServer {
  id: string;
  name: string;
  url: string;           // e.g. https://mirthhost:8443
  username: string;
  passwordDecrypted: string;
  ignoreSslErrors: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface MirthServerPublic {
  id: string;
  name: string;
  url: string;
  username: string;
  passwordSet: boolean;
  ignoreSslErrors: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export type ChannelHealth = "healthy" | "error" | "stuck" | "paused" | "down" | "disabled" | "unknown";
export type ServerHealth  = ChannelHealth | "unreachable";

export interface MirthChannel {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  // From statuses
  state: string;           // STARTED | STOPPED | PAUSED
  received: number;
  sent: number;
  error: number;
  filtered: number;
  queued: number;
  // Computed
  health: ChannelHealth;
}

export interface MirthMessage {
  messageId: string;
  serverId?: string;
  receivedDate: string;
  status: string;          // RECEIVED | SENT | ERROR | FILTERED | QUEUED | TRANSFORMED
  rawContent?: string;
  processedContent?: string;
  connectorName?: string;
  source?: string;
}

export interface MirthEvent {
  id: number;
  level: string;           // INFORMATION | WARNING | ERROR
  name: string;
  outcome: string;
  userId?: number;
  username?: string;
  ipAddress?: string;
  dateTime: string;
  attributes?: Record<string, string>;
}

export interface MirthDashboardServer {
  serverId: string;
  serverName: string;
  url: string;
  version: string | null;
  reachable: boolean;
  error: string | null;
  health: ServerHealth;
  channels: MirthChannel[];
  totalChannels: number;
  healthyCnt: number;
  errorCnt: number;
  stuckCnt: number;
  pausedCnt: number;
  downCnt: number;
  disabledCnt: number;
  totalQueued: number;
  totalErrors: number;
}

export interface MirthDashboard {
  servers: MirthDashboardServer[];
  totalServers: number;
  reachableServers: number;
  totalChannels: number;
  issueChannels: Array<MirthChannel & { serverId: string; serverName: string }>;
  summaryCounts: Record<ChannelHealth, number>;
}

// ── SQLite table ───────────────────────────────────────────────────────────────

function initMirthTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS mirth_servers (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      url                 TEXT NOT NULL,
      username            TEXT NOT NULL,
      password_encrypted  TEXT NOT NULL DEFAULT '',
      ignore_ssl_errors   INTEGER NOT NULL DEFAULT 1,
      enabled             INTEGER NOT NULL DEFAULT 1,
      sort_order          INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL
    )
  `);
}

// ── Server CRUD ────────────────────────────────────────────────────────────────

export function listMirthServersPublic(): MirthServerPublic[] {
  initMirthTable();
  const rows = getDb()
    .prepare("SELECT * FROM mirth_servers ORDER BY sort_order ASC, name ASC")
    .all() as MirthServerRecord[];
  return rows.map(rowToPublic);
}

export async function listMirthServers(): Promise<MirthServer[]> {
  initMirthTable();
  const rows = getDb()
    .prepare("SELECT * FROM mirth_servers ORDER BY sort_order ASC, name ASC")
    .all() as MirthServerRecord[];
  return Promise.all(rows.map(rowToServer));
}

export async function getMirthServerById(id: string): Promise<MirthServer | null> {
  initMirthTable();
  const row = getDb()
    .prepare("SELECT * FROM mirth_servers WHERE id = ?")
    .get(id) as MirthServerRecord | undefined;
  if (!row) return null;
  return rowToServer(row);
}

export async function createMirthServer(data: {
  name: string;
  url: string;
  username: string;
  password: string;
  ignoreSslErrors: boolean;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<MirthServerPublic> {
  initMirthTable();
  const id = crypto.randomUUID();
  const passwordEncrypted = data.password ? await encryptField(data.password) : "";
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO mirth_servers (id, name, url, username, password_encrypted, ignore_ssl_errors, enabled, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name.trim(),
    data.url.trim().replace(/\/$/, ""),
    data.username.trim(),
    passwordEncrypted,
    data.ignoreSslErrors ? 1 : 0,
    data.enabled !== false ? 1 : 0,
    data.sortOrder ?? 0,
    now,
  );
  return rowToPublic(getDb().prepare("SELECT * FROM mirth_servers WHERE id = ?").get(id) as MirthServerRecord);
}

export async function updateMirthServer(id: string, data: {
  name?: string;
  url?: string;
  username?: string;
  password?: string;
  ignoreSslErrors?: boolean;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<MirthServerPublic | null> {
  initMirthTable();
  const existing = getDb().prepare("SELECT * FROM mirth_servers WHERE id = ?").get(id) as MirthServerRecord | undefined;
  if (!existing) return null;

  const passwordEncrypted = data.password?.trim()
    ? await encryptField(data.password.trim())
    : existing.password_encrypted;

  getDb().prepare(`
    UPDATE mirth_servers
    SET name = ?, url = ?, username = ?, password_encrypted = ?,
        ignore_ssl_errors = ?, enabled = ?, sort_order = ?
    WHERE id = ?
  `).run(
    data.name?.trim()             ?? existing.name,
    (data.url?.trim().replace(/\/$/, "")) ?? existing.url,
    data.username?.trim()         ?? existing.username,
    passwordEncrypted,
    data.ignoreSslErrors !== undefined ? (data.ignoreSslErrors ? 1 : 0) : existing.ignore_ssl_errors,
    data.enabled !== undefined    ? (data.enabled ? 1 : 0) : existing.enabled,
    data.sortOrder                ?? existing.sort_order,
    id,
  );
  return rowToPublic(getDb().prepare("SELECT * FROM mirth_servers WHERE id = ?").get(id) as MirthServerRecord);
}

export function deleteMirthServer(id: string): boolean {
  initMirthTable();
  const result = getDb().prepare("DELETE FROM mirth_servers WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function rowToPublic(row: MirthServerRecord): MirthServerPublic {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    passwordSet: !!row.password_encrypted,
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

async function rowToServer(row: MirthServerRecord): Promise<MirthServer> {
  const passwordDecrypted = row.password_encrypted
    ? await decryptField(row.password_encrypted)
    : "";
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    passwordDecrypted,
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: true, isArray: (name) => ["channel", "channelStatus", "dashboardStatus", "event", "entry", "message"].includes(name) });

/** Parse Mirth statistics — handles both simple fields and the 3.x entry-map format. */
function parseStats(stats: unknown): { received: number; sent: number; error: number; filtered: number; queued: number } {
  const r = { received: 0, sent: 0, error: 0, filtered: 0, queued: 0 };
  if (!stats || typeof stats !== "object") return r;
  const s = stats as Record<string, unknown>;
  // Simple format: <received>N</received>
  if (s.received !== undefined || s.sent !== undefined) {
    return { received: Number(s.received ?? 0), sent: Number(s.sent ?? 0), error: Number(s.error ?? 0), filtered: Number(s.filtered ?? 0), queued: Number(s.queued ?? 0) };
  }
  // Entry-map format used by Mirth 3.x
  const STATUS_KEY = "com.mirth.connect.donkey.model.message.Status";
  const entries = (Array.isArray(s.entry) ? s.entry : s.entry ? [s.entry] : []) as Array<Record<string, unknown>>;
  for (const e of entries) {
    const status = String(e[STATUS_KEY] ?? "");
    const n = Number(e.long ?? 0);
    if (status === "RECEIVED") r.received += n;
    else if (status === "SENT") r.sent += n;
    else if (status === "ERROR") r.error += n;
    else if (status === "FILTERED") r.filtered += n;
    else if (status === "QUEUED") r.queued += n;
  }
  return r;
}

async function mirthFetch(
  server: MirthServer,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${server.url}/api${path}`;
  const creds = Buffer.from(`${server.username}:${server.passwordDecrypted}`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${creds}`,
    Accept: "application/xml",
    "X-Requested-With": "XMLHttpRequest",
    ...(options.headers as Record<string, string> ?? {}),
  };

  const doFetch = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    return fetch(url, { ...options, headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  if (server.ignoreSslErrors) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      return await doFetch();
    } finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
  return doFetch();
}

/** Parse an XML response body into a JS object. */
async function parseXml(res: Response): Promise<unknown> {
  const text = await res.text();
  return xmlParser.parse(text);
}

// ── Version / connectivity test ────────────────────────────────────────────────

export async function getMirthVersion(server: MirthServer): Promise<string> {
  const res = await mirthFetch(server, "/server/version");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // XML: <string>3.12.0</string>  or plain text
  const match = text.match(/<string[^>]*>([^<]+)<\/string>/);
  if (match) return match[1].trim();
  return text.trim();
}

// ── Health classification ──────────────────────────────────────────────────────

function classifyChannel(ch: Omit<MirthChannel, "health">): ChannelHealth {
  if (!ch.enabled) return "disabled";
  const s = ch.state?.toUpperCase();
  if (s === "STOPPED") return "down";
  if (s === "PAUSED")  return "paused";
  if (s === "STARTED") {
    if (ch.error > 0)  return "error";
    if (ch.queued > 0) return "stuck";
    return "healthy";
  }
  return "unknown";
}

function worstHealth(channels: MirthChannel[]): ServerHealth {
  const order: (ChannelHealth | ServerHealth)[] = [
    "down", "error", "stuck", "paused", "disabled", "unknown", "healthy",
  ];
  let worst: ServerHealth = "healthy";
  for (const ch of channels) {
    const idx = order.indexOf(ch.health);
    if (idx < order.indexOf(worst)) worst = ch.health;
  }
  return worst;
}

// ── Channel data ───────────────────────────────────────────────────────────────

/**
 * Fetches /api/channels and /api/channels/statuses in parallel, merges by id.
 * Returns array of enriched MirthChannel objects with computed health.
 */
export async function getMirthChannels(server: MirthServer): Promise<MirthChannel[]> {
  const [chRes, stRes] = await Promise.all([
    mirthFetch(server, "/channels?includeCodeTemplateLibraries=false"),
    mirthFetch(server, "/channels/statuses"),
  ]);

  if (!chRes.ok) throw new Error(`Channels fetch failed: HTTP ${chRes.status}`);
  if (!stRes.ok) throw new Error(`Statuses fetch failed: HTTP ${stRes.status}`);

  const chData = await parseXml(chRes) as Record<string, unknown>;
  const stData = await parseXml(stRes) as Record<string, unknown>;

  // XML: <list><channel>...</channel></list>
  interface RawChannel { id?: string; name?: string; description?: string; enabled?: boolean | string; }
  const rawChannels: RawChannel[] = ((chData?.list as Record<string, unknown>)?.channel ?? []) as RawChannel[];

  // XML: <list><dashboardStatus>...</dashboardStatus></list>  (Mirth 3.x)
  //   or <list><channelStatus>...</channelStatus></list>      (older)
  interface RawStatus {
    channelId?: string; name?: string; state?: string;
    statistics?: unknown;
  }
  const stList = stData?.list as Record<string, unknown>;
  const rawStatuses: RawStatus[] = (
    (stList?.dashboardStatus ?? stList?.channelStatus ?? []) as RawStatus[]
  );

  const statusMap = new Map<string, RawStatus>();
  for (const st of rawStatuses) {
    const cid = String(st.channelId ?? "");
    if (cid) statusMap.set(cid, st);
  }

  const channels: MirthChannel[] = rawChannels.map((ch) => {
    const cid = String(ch.id ?? "");
    const st = statusMap.get(cid);
    const stats = parseStats(st?.statistics);
    const base = {
      id: cid,
      name: ch.name ?? st?.name ?? cid,
      description: ch.description ?? "",
      enabled: ch.enabled !== false && ch.enabled !== "false",
      state: st?.state ?? "UNKNOWN",
      ...stats,
    };
    return { ...base, health: classifyChannel(base) };
  });

  // Include any statuses for channels missing from the channel list
  const seenIds = new Set(channels.map((c) => c.id));
  for (const st of rawStatuses) {
    const cid = String(st.channelId ?? "");
    if (cid && !seenIds.has(cid)) {
      const stats = parseStats(st.statistics);
      const base = {
        id: cid,
        name: st.name ?? cid,
        description: "",
        enabled: true,
        state: st.state ?? "UNKNOWN",
        ...stats,
      };
      channels.push({ ...base, health: classifyChannel(base) });
    }
  }

  return channels;
}

// ── Messages ───────────────────────────────────────────────────────────────────

export async function getMirthMessages(
  server: MirthServer,
  channelId: string,
  params: { limit?: number; offset?: number; status?: string; startDate?: string; endDate?: string },
): Promise<{ messages: MirthMessage[]; total: number }> {
  const q = new URLSearchParams({
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
    ...(params.status && params.status !== "ALL" ? { status: params.status } : {}),
    ...(params.startDate ? { startDate: params.startDate } : {}),
    ...(params.endDate   ? { endDate: params.endDate }   : {}),
    includeContent: "true",
  });
  const res = await mirthFetch(server, `/channels/${channelId}/messages?${q}`);
  if (!res.ok) throw new Error(`Messages fetch failed: HTTP ${res.status}`);
  const data = await parseXml(res) as Record<string, unknown>;

  interface RawMsg {
    messageId?: number | string;
    receivedDate?: { time?: number | string } | string;
    connectorMessages?: {
      entry?: Array<{ connectorMessage?: { connectorName?: string; status?: string; rawData?: { content?: string }; processedData?: { content?: string } } }>;
    };
  }

  const listObj = (data?.list ?? data) as Record<string, unknown>;
  const rawMsgs: RawMsg[] = ((listObj?.message ?? []) as RawMsg[]);
  const total = Number((listObj as Record<string, unknown>)?.["@_count"] ?? rawMsgs.length);

  const messages: MirthMessage[] = rawMsgs.map((m) => {
    const connectors = m.connectorMessages?.entry ?? [];
    const sourceConn = connectors[0]?.connectorMessage;
    const rd = m.receivedDate;
    const ts = typeof rd === "object" && rd !== null && "time" in rd
      ? new Date(Number(rd.time)).toISOString()
      : typeof rd === "string" ? rd : "";
    return {
      messageId: String(m.messageId ?? ""),
      receivedDate: ts,
      status: sourceConn?.status ?? "UNKNOWN",
      connectorName: sourceConn?.connectorName ?? "",
      rawContent: sourceConn?.rawData?.content ?? "",
      processedContent: sourceConn?.processedData?.content ?? "",
    };
  });

  return { messages, total };
}

// ── Events ─────────────────────────────────────────────────────────────────────

export async function getMirthEvents(
  server: MirthServer,
  params: { limit?: number; offset?: number; level?: string },
): Promise<{ events: MirthEvent[]; total: number }> {
  const q = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
    ...(params.level && params.level !== "ALL" ? { level: params.level } : {}),
  });
  const res = await mirthFetch(server, `/events?${q}`);
  if (!res.ok) throw new Error(`Events fetch failed: HTTP ${res.status}`);
  const data = await parseXml(res) as Record<string, unknown>;

  interface RawEvent {
    id?: number; level?: string; name?: string; outcome?: string;
    userId?: number; username?: string; ipAddress?: string;
    dateTime?: { time?: number | string } | string;
  }

  const listObj = (data?.list ?? data) as Record<string, unknown>;
  const rawEvents: RawEvent[] = ((listObj?.event ?? []) as RawEvent[]);
  const total = Number((listObj as Record<string, unknown>)?.["@_count"] ?? rawEvents.length);

  const events: MirthEvent[] = rawEvents.map((e) => {
    const dt = e.dateTime;
    const ts = typeof dt === "object" && dt !== null && "time" in dt
      ? new Date(Number(dt.time)).toISOString()
      : typeof dt === "string" ? dt : "";
    return {
      id: e.id ?? 0,
      level: e.level ?? "INFORMATION",
      name: e.name ?? "",
      outcome: e.outcome ?? "",
      userId: e.userId,
      username: e.username ?? "",
      ipAddress: e.ipAddress ?? "",
      dateTime: ts,
    };
  });

  return { events, total };
}

// ── Channel actions ────────────────────────────────────────────────────────────

export type ChannelAction = "start" | "stop" | "pause" | "resume";

export async function mirthChannelAction(
  server: MirthServer,
  channelId: string,
  action: ChannelAction,
): Promise<void> {
  const res = await mirthFetch(server, `/channels/${channelId}/_${action}`, { method: "POST" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Action '${action}' failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
}

// ── Dashboard aggregation ──────────────────────────────────────────────────────

/**
 * Fetches all enabled servers in parallel and returns a single aggregated
 * dashboard payload. Unreachable servers are included with reachable=false.
 */
export async function getMirthDashboard(): Promise<MirthDashboard> {
  const servers = await listMirthServers();
  const enabled = servers.filter((s) => s.enabled);

  const serverResults = await Promise.all(
    enabled.map(async (server): Promise<MirthDashboardServer> => {
      try {
        const [version, channels] = await Promise.all([
          getMirthVersion(server).catch(() => null),
          getMirthChannels(server),
        ]);

        const health = channels.length > 0 ? worstHealth(channels) : "unknown";
        const counts = { healthy: 0, error: 0, stuck: 0, paused: 0, down: 0, disabled: 0, unknown: 0 };
        let totalQueued = 0;
        let totalErrors = 0;
        for (const ch of channels) {
          counts[ch.health] = (counts[ch.health] ?? 0) + 1;
          totalQueued += ch.queued;
          totalErrors += ch.error;
        }

        return {
          serverId: server.id,
          serverName: server.name,
          url: server.url,
          version,
          reachable: true,
          error: null,
          health,
          channels,
          totalChannels: channels.length,
          healthyCnt: counts.healthy,
          errorCnt: counts.error,
          stuckCnt: counts.stuck,
          pausedCnt: counts.paused,
          downCnt: counts.down,
          disabledCnt: counts.disabled,
          totalQueued,
          totalErrors,
        };
      } catch (err) {
        return {
          serverId: server.id,
          serverName: server.name,
          url: server.url,
          version: null,
          reachable: false,
          error: err instanceof Error ? err.message : "Connection failed",
          health: "unreachable",
          channels: [],
          totalChannels: 0,
          healthyCnt: 0,
          errorCnt: 0,
          stuckCnt: 0,
          pausedCnt: 0,
          downCnt: 0,
          disabledCnt: 0,
          totalQueued: 0,
          totalErrors: 0,
        };
      }
    }),
  );

  // Build issues list: all non-healthy channels across all reachable servers
  const SEVERITY: Record<ChannelHealth, number> = {
    down: 0, error: 1, stuck: 2, paused: 3, disabled: 4, unknown: 5, healthy: 6,
  };
  const issueChannels = serverResults
    .filter((s) => s.reachable)
    .flatMap((s) =>
      s.channels
        .filter((ch) => ch.health !== "healthy")
        .map((ch) => ({ ...ch, serverId: s.serverId, serverName: s.serverName })),
    )
    .sort((a, b) => (SEVERITY[a.health] ?? 99) - (SEVERITY[b.health] ?? 99));

  const summaryCounts: Record<ChannelHealth, number> = {
    healthy: 0, error: 0, stuck: 0, paused: 0, down: 0, disabled: 0, unknown: 0,
  };
  for (const s of serverResults) {
    for (const ch of s.channels) {
      summaryCounts[ch.health] = (summaryCounts[ch.health] ?? 0) + 1;
    }
  }

  return {
    servers: serverResults,
    totalServers: serverResults.length,
    reachableServers: serverResults.filter((s) => s.reachable).length,
    totalChannels: serverResults.reduce((n, s) => n + s.totalChannels, 0),
    issueChannels,
    summaryCounts,
  };
}
