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
import { notifyAdminsOfMirthAlert } from "./notifications";
import { _writeAuditLogDirect } from "./audit";

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
  // Enrichment (populated by getMirthDashboard)
  stateChangedAt?: string;       // ISO timestamp when current state was entered
  prevState?: string;            // Previous state before current one
  note?: string;                 // Admin annotation
  inactiveForMinutes?: number;   // Set when inactivity threshold exceeded
}

export interface MirthChannelConfig {
  inactivityThresholdMinutes: number; // default 60
  inactivityEnabled: boolean;         // default true
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

export interface MirthNotificationConfig {
  recipients:  string[];
  alertError:  boolean;
  alertStuck:  boolean;
  alertDown:   boolean;
  alertPaused: boolean;
  quietHoursStart: string | null; // HH:MM or null (disabled)
  quietHoursEnd:   string | null; // HH:MM or null (disabled)
}

export interface ConnectorMessageDetail {
  metaDataId:         number;
  connectorName:      string;
  status:             string;
  receivedDate:       string;
  sendDate:           string;
  processingTime?:    number;
  error?:             string;
  rawContent:         string;
  processedContent:   string;
  transformedContent: string;
  encodedContent:     string;
  sentContent:        string;
  responseContent:    string;
}

export interface MirthMessageDetail {
  messageId:         string;
  receivedDate:      string;
  status:            string;
  connectorMessages: ConnectorMessageDetail[];
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
  lastPolledAt: string;
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

// ── Snapshot / history tables ──────────────────────────────────────────────────

/** Lean snapshot of a channel state stored after each dashboard poll. */
export interface ChannelSnapshot {
  state: string;
  received: number;
  error: number;
  queued: number;
  snapshot_time?: string;
}

function initHistoryTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS mirth_channel_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id    TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      ts           TEXT NOT NULL,
      state        TEXT NOT NULL,
      received     INTEGER NOT NULL DEFAULT 0,
      sent         INTEGER NOT NULL DEFAULT 0,
      error        INTEGER NOT NULL DEFAULT 0,
      queued       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mcs_lookup
      ON mirth_channel_snapshots(server_id, channel_id, ts);
    CREATE TABLE IF NOT EXISTS mirth_channel_ack (
      server_id    TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      acked_error  INTEGER NOT NULL DEFAULT 0,
      acked_at     TEXT NOT NULL,
      PRIMARY KEY (server_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS mirth_channel_config (
      server_id                    TEXT NOT NULL,
      channel_id                   TEXT NOT NULL,
      channel_name                 TEXT NOT NULL,
      inactivity_threshold_minutes INTEGER NOT NULL DEFAULT 60,
      inactivity_enabled           INTEGER NOT NULL DEFAULT 1,
      updated_at                   TEXT NOT NULL,
      PRIMARY KEY (server_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS mirth_channel_state_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id    TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      prev_state   TEXT,
      new_state    TEXT NOT NULL,
      changed_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcsl_lookup
      ON mirth_channel_state_log(server_id, channel_id, changed_at);
    CREATE TABLE IF NOT EXISTS mirth_channel_notes (
      server_id    TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      note         TEXT NOT NULL DEFAULT '',
      updated_by   TEXT,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (server_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS mirth_channel_prev_health (
      server_id   TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      health      TEXT NOT NULL DEFAULT 'unknown',
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (server_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS mirth_history_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL,
      server_id    TEXT NOT NULL,
      server_name  TEXT NOT NULL DEFAULT '',
      channel_id   TEXT,
      channel_name TEXT,
      event_type   TEXT NOT NULL,
      actor        TEXT,
      details      TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_mhl_ts
      ON mirth_history_log(timestamp DESC);
    CREATE TABLE IF NOT EXISTS mirth_notification_config (
      server_id          TEXT PRIMARY KEY,
      recipients         TEXT NOT NULL DEFAULT '[]',
      alert_error        INTEGER NOT NULL DEFAULT 1,
      alert_stuck        INTEGER NOT NULL DEFAULT 1,
      alert_down         INTEGER NOT NULL DEFAULT 1,
      alert_paused       INTEGER NOT NULL DEFAULT 0,
      quiet_hours_start  TEXT,
      quiet_hours_end    TEXT,
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/** Returns the most recent snapshot for each channel on a server (from the last poll). */
function getPrevSnapshots(serverId: string): Map<string, ChannelSnapshot> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(`
      SELECT s.channel_id, s.state, s.received, s.error, s.queued
      FROM mirth_channel_snapshots s
      INNER JOIN (
        SELECT channel_id, MAX(ts) AS max_ts
        FROM mirth_channel_snapshots WHERE server_id = ?
        GROUP BY channel_id
      ) latest ON s.channel_id = latest.channel_id AND s.ts = latest.max_ts
      WHERE s.server_id = ?
    `).all(serverId, serverId) as Array<{ channel_id: string } & ChannelSnapshot>;
    const map = new Map<string, ChannelSnapshot>();
    for (const r of rows) map.set(r.channel_id, { state: r.state, received: r.received, error: r.error, queued: r.queued });
    return map;
  } catch { return new Map(); }
}

interface StateChange { channelId: string; channelName: string; prevState: string | null; newState: string; }

/**
 * Persist current channel states, log state transitions, prune old data.
 * Returns the list of state transitions detected this poll (for audit logging).
 */
function saveSnapshotsAndStateLog(
  serverId: string,
  channels: MirthChannel[],
  prevSnaps: Map<string, ChannelSnapshot>,
): StateChange[] {
  const changes: StateChange[] = [];
  try {
    initHistoryTables();
    const now = new Date().toISOString();
    const db = getDb();
    const ins = db.prepare(
      "INSERT INTO mirth_channel_snapshots (server_id,channel_id,channel_name,ts,state,received,sent,error,queued) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    const prune = db.prepare(
      "DELETE FROM mirth_channel_snapshots WHERE server_id=? AND channel_id=? AND ts < datetime('now','-7 days')"
    );
    const logState = db.prepare(
      "INSERT INTO mirth_channel_state_log (server_id,channel_id,channel_name,prev_state,new_state,changed_at) VALUES (?,?,?,?,?,?)"
    );
    const pruneLog = db.prepare(
      "DELETE FROM mirth_channel_state_log WHERE server_id=? AND channel_id=? AND changed_at < datetime('now','-30 days')"
    );
    db.transaction(() => {
      for (const ch of channels) {
        ins.run(serverId, ch.id, ch.name, now, ch.state, ch.received, ch.sent, ch.error, ch.queued);
        prune.run(serverId, ch.id);
        const prev = prevSnaps.get(ch.id);
        if (!prev || prev.state !== ch.state) {
          logState.run(serverId, ch.id, ch.name, prev?.state ?? null, ch.state, now);
          pruneLog.run(serverId, ch.id);
          changes.push({ channelId: ch.id, channelName: ch.name, prevState: prev?.state ?? null, newState: ch.state });
        }
      }
    })();
  } catch { /* non-critical */ }
  return changes;
}

/** All channel configs for a server (missing channels get defaults). */
function getAllChannelConfigs(serverId: string): Map<string, MirthChannelConfig> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(
      "SELECT channel_id, inactivity_threshold_minutes, inactivity_enabled FROM mirth_channel_config WHERE server_id = ?"
    ).all(serverId) as Array<{ channel_id: string; inactivity_threshold_minutes: number; inactivity_enabled: number }>;
    const map = new Map<string, MirthChannelConfig>();
    for (const r of rows) map.set(r.channel_id, { inactivityThresholdMinutes: r.inactivity_threshold_minutes, inactivityEnabled: r.inactivity_enabled === 1 });
    return map;
  } catch { return new Map(); }
}

/** All notes for a server keyed by channelId. */
function getAllChannelNotes(serverId: string): Map<string, string> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(
      "SELECT channel_id, note FROM mirth_channel_notes WHERE server_id = ?"
    ).all(serverId) as Array<{ channel_id: string; note: string }>;
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.channel_id, r.note);
    return map;
  } catch { return new Map(); }
}

/** Last known health for each channel on a server (for notification dedup). */
function getPrevHealthMap(serverId: string): Map<string, ChannelHealth> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(
      "SELECT channel_id, health FROM mirth_channel_prev_health WHERE server_id = ?"
    ).all(serverId) as Array<{ channel_id: string; health: ChannelHealth }>;
    const map = new Map<string, ChannelHealth>();
    for (const r of rows) map.set(r.channel_id, r.health);
    return map;
  } catch { return new Map(); }
}

/** Persist current health for each channel (used on next poll for notification dedup). */
function updatePrevHealthMap(serverId: string, channels: MirthChannel[]): void {
  try {
    initHistoryTables();
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO mirth_channel_prev_health (server_id, channel_id, health, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(server_id, channel_id) DO UPDATE SET health = excluded.health, updated_at = excluded.updated_at
    `);
    db.transaction(() => { for (const ch of channels) upsert.run(serverId, ch.id, ch.health); })();
  } catch { /* non-critical */ }
}

/** Most recent state transition for each channel on a server. */
function getAllLastStateChanges(
  serverId: string,
): Map<string, { prevState: string | null; changedAt: string }> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(`
      SELECT l.channel_id, l.prev_state, l.changed_at
      FROM mirth_channel_state_log l
      INNER JOIN (
        SELECT channel_id, MAX(changed_at) AS max_ts
        FROM mirth_channel_state_log WHERE server_id = ?
        GROUP BY channel_id
      ) latest ON l.channel_id = latest.channel_id AND l.changed_at = latest.max_ts
      WHERE l.server_id = ?
    `).all(serverId, serverId) as Array<{ channel_id: string; prev_state: string | null; changed_at: string }>;
    const map = new Map<string, { prevState: string | null; changedAt: string }>();
    for (const r of rows) map.set(r.channel_id, { prevState: r.prev_state, changedAt: r.changed_at });
    return map;
  } catch { return new Map(); }
}

/**
 * Returns true if the channel's received count has not changed since
 * `thresholdMinutes` ago (channel is running but not processing messages).
 */
function checkInactivity(
  serverId: string, channelId: string, thresholdMinutes: number, currentReceived: number,
): boolean {
  try {
    initHistoryTables();
    const row = getDb().prepare(`
      SELECT received FROM mirth_channel_snapshots
      WHERE server_id = ? AND channel_id = ?
        AND ts <= datetime('now', ? || ' minutes')
      ORDER BY ts DESC LIMIT 1
    `).get(serverId, channelId, String(-thresholdMinutes)) as { received: number } | undefined;
    if (!row) return false;
    return row.received === currentReceived;
  } catch { return false; }
}

/** True when transitioning from a calm state to an alert state (notify once). */
function shouldNotify(prevHealth: ChannelHealth | undefined, newHealth: ChannelHealth): boolean {
  if (!prevHealth || prevHealth === "unknown") return false;
  const ALERT: Set<ChannelHealth> = new Set(["error", "down", "stuck"]);
  const CALM:  Set<ChannelHealth> = new Set(["healthy", "paused", "disabled"]);
  return CALM.has(prevHealth) && ALERT.has(newHealth);
}

/** Load per-channel acknowledged error baselines. */
function getAckedErrors(serverId: string): Map<string, number> {
  try {
    initHistoryTables();
    const rows = getDb().prepare(
      "SELECT channel_id, acked_error FROM mirth_channel_ack WHERE server_id = ?"
    ).all(serverId) as Array<{ channel_id: string; acked_error: number }>;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.channel_id, r.acked_error);
    return map;
  } catch { return new Map(); }
}

/**
 * Acknowledge errors up to `upToErrors` for a channel.
 * Errors at or below this count will no longer trigger the error health state.
 */
export function acknowledgeMirthErrors(serverId: string, channelId: string, upToErrors: number): void {
  initHistoryTables();
  getDb().prepare(`
    INSERT INTO mirth_channel_ack (server_id, channel_id, acked_error, acked_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(server_id, channel_id) DO UPDATE
      SET acked_error = excluded.acked_error, acked_at = excluded.acked_at
  `).run(serverId, channelId, upToErrors);
}

// ── Exported config / note / state-log CRUD ───────────────────────────────────

/** Get inactivity monitoring config for a channel (defaults if not set). */
export function getMirthChannelConfig(serverId: string, channelId: string): MirthChannelConfig {
  try {
    initHistoryTables();
    const row = getDb().prepare(
      "SELECT inactivity_threshold_minutes, inactivity_enabled FROM mirth_channel_config WHERE server_id = ? AND channel_id = ?"
    ).get(serverId, channelId) as { inactivity_threshold_minutes: number; inactivity_enabled: number } | undefined;
    if (!row) return { inactivityThresholdMinutes: 60, inactivityEnabled: true };
    return { inactivityThresholdMinutes: row.inactivity_threshold_minutes, inactivityEnabled: row.inactivity_enabled === 1 };
  } catch { return { inactivityThresholdMinutes: 60, inactivityEnabled: true }; }
}

/** Upsert inactivity monitoring config for a channel. */
export function setMirthChannelConfig(
  serverId: string, channelId: string, channelName: string, config: Partial<MirthChannelConfig>,
): void {
  initHistoryTables();
  getDb().prepare(`
    INSERT INTO mirth_channel_config (server_id, channel_id, channel_name, inactivity_threshold_minutes, inactivity_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(server_id, channel_id) DO UPDATE
      SET channel_name = excluded.channel_name,
          inactivity_threshold_minutes = COALESCE(?, inactivity_threshold_minutes),
          inactivity_enabled = COALESCE(?, inactivity_enabled),
          updated_at = excluded.updated_at
  `).run(
    serverId, channelId, channelName,
    config.inactivityThresholdMinutes ?? 60,
    config.inactivityEnabled !== undefined ? (config.inactivityEnabled ? 1 : 0) : 1,
    config.inactivityThresholdMinutes ?? null,
    config.inactivityEnabled !== undefined ? (config.inactivityEnabled ? 1 : 0) : null,
  );
}

/** Get the admin note for a channel. */
export function getMirthChannelNote(
  serverId: string, channelId: string,
): { note: string; updatedBy?: string; updatedAt?: string } | null {
  try {
    initHistoryTables();
    const row = getDb().prepare(
      "SELECT note, updated_by, updated_at FROM mirth_channel_notes WHERE server_id = ? AND channel_id = ?"
    ).get(serverId, channelId) as { note: string; updated_by: string | null; updated_at: string } | undefined;
    if (!row || !row.note) return null;
    return { note: row.note, updatedBy: row.updated_by ?? undefined, updatedAt: row.updated_at };
  } catch { return null; }
}

/** Upsert the admin note for a channel. */
export function setMirthChannelNote(
  serverId: string, channelId: string, channelName: string, note: string, updatedBy?: string,
): void {
  initHistoryTables();
  getDb().prepare(`
    INSERT INTO mirth_channel_notes (server_id, channel_id, channel_name, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(server_id, channel_id) DO UPDATE
      SET note = excluded.note, channel_name = excluded.channel_name,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(serverId, channelId, channelName, note, updatedBy ?? null);
}

/** Recent state transitions for a channel (most recent first). */
export function getChannelStateLog(
  serverId: string, channelId: string, limit = 20,
): Array<{ prevState: string | null; newState: string; changedAt: string }> {
  try {
    initHistoryTables();
    return (getDb().prepare(`
      SELECT prev_state, new_state, changed_at FROM mirth_channel_state_log
      WHERE server_id = ? AND channel_id = ?
      ORDER BY changed_at DESC LIMIT ?
    `).all(serverId, channelId, limit) as Array<{ prev_state: string | null; new_state: string; changed_at: string }>)
      .map(r => ({ prevState: r.prev_state, newState: r.new_state, changedAt: r.changed_at }));
  } catch { return []; }
}

/** Recent snapshots for a channel — useful for history/sparkline display. */
export function getMirthChannelHistory(
  serverId: string, channelId: string, limit = 100,
): Array<ChannelSnapshot & { snapshot_time: string }> {
  try {
    initHistoryTables();
    return getDb().prepare(`
      SELECT state, received, sent, error, queued, ts AS snapshot_time
      FROM mirth_channel_snapshots
      WHERE server_id = ? AND channel_id = ?
      ORDER BY ts DESC LIMIT ?
    `).all(serverId, channelId, limit) as Array<ChannelSnapshot & { snapshot_time: string }>;
  } catch { return []; }
}

// ── Activity history log ───────────────────────────────────────────────────────

export interface MirthHistoryEntry {
  id: number;
  timestamp: string;
  serverId: string;
  serverName: string;
  channelId: string | null;
  channelName: string | null;
  eventType: string;
  actor: string | null;
  details: Record<string, unknown>;
}

/** Look up the most recent known name for a channel from the snapshot table. */
export function getMirthChannelName(serverId: string, channelId: string): string | null {
  try {
    initHistoryTables();
    const row = getDb().prepare(`
      SELECT channel_name FROM mirth_channel_snapshots
      WHERE server_id = ? AND channel_id = ?
      ORDER BY ts DESC LIMIT 1
    `).get(serverId, channelId) as { channel_name: string } | undefined;
    return row?.channel_name ?? null;
  } catch { return null; }
}

/** Record an activity history entry (fire-and-forget safe). */
export function logMirthHistory(entry: {
  serverId: string;
  serverName: string;
  channelId?: string | null;
  channelName?: string | null;
  eventType: string;
  actor?: string | null;
  details?: Record<string, unknown>;
}): void {
  try {
    initHistoryTables();
    getDb().prepare(`
      INSERT INTO mirth_history_log
        (timestamp, server_id, server_name, channel_id, channel_name, event_type, actor, details)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.serverId,
      entry.serverName,
      entry.channelId ?? null,
      entry.channelName ?? null,
      entry.eventType,
      entry.actor ?? null,
      JSON.stringify(entry.details ?? {}),
    );
  } catch { /* non-critical */ }
}

/** Return the most recent history entries (newest first). */
export function getMirthHistory(limit = 300): MirthHistoryEntry[] {
  try {
    initHistoryTables();
    const rows = getDb().prepare(`
      SELECT id, timestamp, server_id, server_name, channel_id, channel_name,
             event_type, actor, details
      FROM mirth_history_log
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: number; timestamp: string; server_id: string; server_name: string;
      channel_id: string | null; channel_name: string | null;
      event_type: string; actor: string | null; details: string;
    }>;
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      serverId: r.server_id,
      serverName: r.server_name,
      channelId: r.channel_id,
      channelName: r.channel_name,
      eventType: r.event_type,
      actor: r.actor,
      details: (() => { try { return JSON.parse(r.details) as Record<string, unknown>; } catch { return {}; } })(),
    }));
  } catch { return []; }
}

// ── Notification config ────────────────────────────────────────────────────────

/** Get per-server notification config (defaults if not set). */
export function getMirthNotificationConfig(serverId: string): MirthNotificationConfig {
  try {
    initHistoryTables();
    // Migrate: add quiet_hours columns if missing (existing DBs)
    try { getDb().exec("ALTER TABLE mirth_notification_config ADD COLUMN quiet_hours_start TEXT"); } catch { /* already exists */ }
    try { getDb().exec("ALTER TABLE mirth_notification_config ADD COLUMN quiet_hours_end TEXT"); } catch { /* already exists */ }
    const row = getDb().prepare(
      "SELECT recipients, alert_error, alert_stuck, alert_down, alert_paused, quiet_hours_start, quiet_hours_end FROM mirth_notification_config WHERE server_id = ?"
    ).get(serverId) as {
      recipients: string; alert_error: number; alert_stuck: number;
      alert_down: number; alert_paused: number;
      quiet_hours_start: string | null; quiet_hours_end: string | null;
    } | undefined;
    if (!row) return { recipients: [], alertError: true, alertStuck: true, alertDown: true, alertPaused: false, quietHoursStart: null, quietHoursEnd: null };
    return {
      recipients:  (() => { try { return JSON.parse(row.recipients) as string[]; } catch { return []; } })(),
      alertError:  row.alert_error  === 1,
      alertStuck:  row.alert_stuck  === 1,
      alertDown:   row.alert_down   === 1,
      alertPaused: row.alert_paused === 1,
      quietHoursStart: row.quiet_hours_start ?? null,
      quietHoursEnd:   row.quiet_hours_end   ?? null,
    };
  } catch { return { recipients: [], alertError: true, alertStuck: true, alertDown: true, alertPaused: false, quietHoursStart: null, quietHoursEnd: null }; }
}

/** Upsert per-server notification config. */
export function setMirthNotificationConfig(serverId: string, config: MirthNotificationConfig): void {
  initHistoryTables();
  // Ensure columns exist for older DBs
  try { getDb().exec("ALTER TABLE mirth_notification_config ADD COLUMN quiet_hours_start TEXT"); } catch { /* already exists */ }
  try { getDb().exec("ALTER TABLE mirth_notification_config ADD COLUMN quiet_hours_end TEXT"); } catch { /* already exists */ }
  getDb().prepare(`
    INSERT INTO mirth_notification_config (server_id, recipients, alert_error, alert_stuck, alert_down, alert_paused, quiet_hours_start, quiet_hours_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(server_id) DO UPDATE SET
      recipients        = excluded.recipients,
      alert_error       = excluded.alert_error,
      alert_stuck       = excluded.alert_stuck,
      alert_down        = excluded.alert_down,
      alert_paused      = excluded.alert_paused,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end   = excluded.quiet_hours_end,
      updated_at        = excluded.updated_at
  `).run(
    serverId,
    JSON.stringify(config.recipients),
    config.alertError  ? 1 : 0,
    config.alertStuck  ? 1 : 0,
    config.alertDown   ? 1 : 0,
    config.alertPaused ? 1 : 0,
    config.quietHoursStart || null,
    config.quietHoursEnd   || null,
  );
}

/** Returns true if current server time falls within the quiet hours window. */
export function isWithinQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  // Handle overnight windows (e.g. 22:00 → 06:00)
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
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

/**
 * Extract text from a parsed XML value.
 * fast-xml-parser stores the text of elements that also have attributes under "#text".
 * e.g. <content class="...">MSH|...</content> → { "#text": "MSH|...", "@_class": "..." }
 */
function extractContent(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    const t = (val as Record<string, unknown>)["#text"];
    if (t !== undefined && t !== null) return String(t);
  }
  return "";
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

/**
 * Classify channel health.
 * - `prev`: last snapshot (for delta-based error detection)
 * - `ackedErrors`: acknowledged baseline (errors at or below won't alert)
 * - `isInactive`: true when received count hasn't changed in threshold time
 */
function classifyChannel(
  ch: Omit<MirthChannel, "health" | "stateChangedAt" | "prevState" | "note" | "inactiveForMinutes">,
  prev?: ChannelSnapshot | null,
  ackedErrors = 0,
  isInactive = false,
): ChannelHealth {
  if (!ch.enabled) return "disabled";
  const s = ch.state?.toUpperCase() ?? "";
  if (s === "STOPPED") return "down";
  if (s === "PAUSED")  return "paused";
  if (s === "STARTED") {
    const unacked = ch.error - ackedErrors;
    if (unacked > 0 && (!prev || ch.error > prev.error)) return "error";
    if (isInactive) return "stuck";
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
      rawContent: extractContent((sourceConn?.rawData as Record<string, unknown>)?.content),
      processedContent: extractContent((sourceConn?.processedData as Record<string, unknown>)?.content),
    };
  });

  return { messages, total };
}

// ── Single-message fetch ──────────────────────────────────────────────────────

/**
 * Fetch a single message by ID with full connector detail.
 * Returns a MirthMessageDetail with one entry per connector (source + destinations).
 */
export async function getMirthMessage(
  server: MirthServer,
  channelId: string,
  messageId: string,
): Promise<MirthMessageDetail | null> {
  try {
    const res = await mirthFetch(server, `/channels/${channelId}/messages/${messageId}?includeContent=true`);
    if (!res.ok) return null;
    const data = await parseXml(res) as Record<string, unknown>;
    const m = (data?.message ?? data) as Record<string, unknown>;
    if (!m) return null;

    function parseTs(val: unknown): string {
      if (val && typeof val === "object" && "time" in (val as Record<string, unknown>))
        return new Date(Number((val as Record<string, unknown>).time)).toISOString();
      if (typeof val === "string") return val;
      return "";
    }

    interface ConnEntry { int?: number; connectorMessage?: Record<string, unknown>; }
    const connMap = m?.connectorMessages as Record<string, unknown> | undefined;
    const rawEntries = connMap?.entry;
    const entries: ConnEntry[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries as ConnEntry] : [];

    const connectorMessages: ConnectorMessageDetail[] = entries
      .map((e): ConnectorMessageDetail | null => {
        const conn = e.connectorMessage as Record<string, unknown> | undefined;
        if (!conn) return null;
        const metaDataId = Number(e.int ?? conn?.metaDataId ?? 0);
        // Extract error text from errors element or errorCode
        const errRaw = conn.errors as Record<string, unknown> | string | undefined;
        const errText = errRaw
          ? (typeof errRaw === "object" ? extractContent((errRaw as Record<string, unknown>).causeMessage ?? errRaw) : String(errRaw))
          : conn.errorCode ? String(conn.errorCode) : undefined;
        return {
          metaDataId,
          connectorName:      String(conn.connectorName ?? (metaDataId === 0 ? "Source" : `Destination ${metaDataId}`)),
          status:             String(conn.status ?? "UNKNOWN"),
          receivedDate:       parseTs(conn.receivedDate),
          sendDate:           parseTs(conn.sendDate),
          processingTime:     conn.processingTime !== undefined ? Number(conn.processingTime) : undefined,
          error:              errText || undefined,
          rawContent:         extractContent((conn.rawData         as Record<string, unknown>)?.content),
          processedContent:   extractContent((conn.processedData   as Record<string, unknown>)?.content),
          transformedContent: extractContent((conn.transformedData  as Record<string, unknown>)?.content),
          encodedContent:     extractContent((conn.encodedData      as Record<string, unknown>)?.content),
          sentContent:        extractContent((conn.sentData         as Record<string, unknown>)?.content),
          responseContent:    extractContent((conn.responseData     as Record<string, unknown>)?.content),
        };
      })
      .filter((c): c is ConnectorMessageDetail => c !== null)
      .sort((a, b) => a.metaDataId - b.metaDataId);

    const source = connectorMessages.find(c => c.metaDataId === 0) ?? connectorMessages[0];
    return {
      messageId:         String(m.messageId ?? messageId),
      receivedDate:      parseTs(m.receivedDate),
      status:            source?.status ?? "UNKNOWN",
      connectorMessages,
    };
  } catch { return null; }
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
    attributes?: { entry?: Array<{ string?: string | string[] }> | { string?: string | string[] } };
  }

  const listObj = (data?.list ?? data) as Record<string, unknown>;
  const rawEvents: RawEvent[] = ((listObj?.event ?? []) as RawEvent[]);
  const total = Number((listObj as Record<string, unknown>)?.["@_count"] ?? rawEvents.length);

  const events: MirthEvent[] = rawEvents.map((e) => {
    const dt = e.dateTime;
    const ts = typeof dt === "object" && dt !== null && "time" in dt
      ? new Date(Number(dt.time)).toISOString()
      : typeof dt === "string" ? dt : "";

    // Parse attributes map (each entry has two <string> children: key + value)
    const attributes: Record<string, string> = {};
    if (e.attributes?.entry) {
      const attrEntries = Array.isArray(e.attributes.entry) ? e.attributes.entry : [e.attributes.entry];
      for (const entry of attrEntries) {
        const strings = Array.isArray(entry.string) ? entry.string : entry.string ? [entry.string] : [];
        if (strings.length >= 2) attributes[String(strings[0])] = String(strings[1]);
      }
    }

    return {
      id: e.id ?? 0,
      level: e.level ?? "INFORMATION",
      name: e.name ?? "",
      outcome: e.outcome ?? "",
      userId: e.userId,
      username: e.username ?? "",
      ipAddress: e.ipAddress ?? "",
      dateTime: ts,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
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

/** Execute an action on multiple channels in parallel. */
export async function mirthBatchChannelAction(
  server: MirthServer,
  channelIds: string[],
  action: ChannelAction,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    channelIds.map(id => mirthChannelAction(server, id, action))
  );
  return {
    succeeded: channelIds.filter((_, i) => results[i].status === "fulfilled"),
    failed:    channelIds.filter((_, i) => results[i].status === "rejected"),
  };
}

// ── Dashboard aggregation ──────

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
        // Load all context maps before network calls (prev = last poll's state)
        const prevSnaps       = getPrevSnapshots(server.id);
        const ackedErrs       = getAckedErrors(server.id);
        const channelConfigs  = getAllChannelConfigs(server.id);
        const lastChanges     = getAllLastStateChanges(server.id);
        const prevHealthMap   = getPrevHealthMap(server.id);
        const notesMap        = getAllChannelNotes(server.id);
        const notifCfg        = getMirthNotificationConfig(server.id);

        const [version, rawChannels] = await Promise.all([
          getMirthVersion(server).catch(() => null),
          getMirthChannels(server),
        ]);

        // Classify with full context and enrich with metadata
        const channels: MirthChannel[] = rawChannels.map(ch => {
          const prev    = prevSnaps.get(ch.id);
          const acked   = ackedErrs.get(ch.id) ?? 0;
          const cfg     = channelConfigs.get(ch.id) ?? { inactivityThresholdMinutes: 60, inactivityEnabled: true };
          const isInactive = cfg.inactivityEnabled && ch.state?.toUpperCase() === "STARTED"
            ? checkInactivity(server.id, ch.id, cfg.inactivityThresholdMinutes, ch.received)
            : false;
          const stateInfo = lastChanges.get(ch.id);
          const health    = classifyChannel(ch, prev, acked, isInactive);
          return {
            ...ch,
            health,
            stateChangedAt:    stateInfo?.changedAt,
            prevState:         stateInfo?.prevState ?? undefined,
            note:              notesMap.get(ch.id),
            inactiveForMinutes: isInactive ? cfg.inactivityThresholdMinutes : undefined,
          };
        });

        // Persist snapshots + state transition log; get back detected changes for audit
        const stateChanges = saveSnapshotsAndStateLog(server.id, channels, prevSnaps);

        // Audit + history for each auto-detected state transition (fire-and-forget)
        for (const { channelId, channelName, prevState, newState } of stateChanges) {
          _writeAuditLogDirect({
            event: "mirth.channel.state.changed",
            outcome: "success",
            actor: "scheduler",
            sessionType: "anonymous",
            resource: channelId,
            resourceType: "mirth-channel",
            details: { serverId: server.id, serverName: server.name, channelId, channelName, prevState, newState },
          }).catch(() => {});
          logMirthHistory({
            serverId: server.id, serverName: server.name,
            channelId, channelName,
            eventType: "channel.state.changed",
            actor: "scheduler",
            details: { prevState, newState },
          });
        }

        // Fire notifications + audit + history for calm→alert transitions (fire-and-forget)
        const inQuietHours = isWithinQuietHours(notifCfg.quietHoursStart, notifCfg.quietHoursEnd);
        for (const ch of channels) {
          if (shouldNotify(prevHealthMap.get(ch.id), ch.health)) {
            // Check per-server toggle + quiet hours before sending notification
            const alertEnabled =
              (ch.health === "error"  && notifCfg.alertError)  ||
              (ch.health === "stuck"  && notifCfg.alertStuck)  ||
              (ch.health === "down"   && notifCfg.alertDown)   ||
              (ch.health === "paused" && notifCfg.alertPaused);
            if (alertEnabled && !inQuietHours) {
              notifyAdminsOfMirthAlert(
                server.name, ch.name, ch.health,
                { serverId: server.id, channelId: ch.id, serverName: server.name, channelName: ch.name, health: ch.health },
                notifCfg.recipients.length > 0 ? notifCfg.recipients : undefined,
              ).catch(() => {});
            }
            _writeAuditLogDirect({
              event: "mirth.channel.health.alert",
              outcome: "failure",
              actor: "scheduler",
              sessionType: "anonymous",
              resource: ch.id,
              resourceType: "mirth-channel",
              details: {
                serverId: server.id, serverName: server.name,
                channelId: ch.id, channelName: ch.name,
                health: ch.health, prevHealth: prevHealthMap.get(ch.id) ?? "unknown",
                errors: ch.error, queued: ch.queued,
              },
            }).catch(() => {});
            logMirthHistory({
              serverId: server.id, serverName: server.name,
              channelId: ch.id, channelName: ch.name,
              eventType: "channel.health.alert",
              actor: "scheduler",
              details: {
                health: ch.health,
                prevHealth: prevHealthMap.get(ch.id) ?? "unknown",
                errors: ch.error, queued: ch.queued,
              },
            });
          }
        }
        updatePrevHealthMap(server.id, channels);

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
    lastPolledAt: new Date().toISOString(),
  };
}
