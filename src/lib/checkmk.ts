/**
 * CheckMK Integration Module — server-only library.
 *
 * Connects to CheckMK's REST API to manage monitoring hosts.
 * Server records stored in SQLite with AES-256-GCM encrypted secrets (crypto.ts).
 * Self-signed SSL handled per-server via NODE_TLS_REJECT_UNAUTHORIZED pattern.
 *
 * REST API docs: https://docs.checkmk.com/latest/en/rest_api.html
 * Auth: Bearer header with "username secret" format.
 * Endpoints: /api/1.0/domain-types/host_config/collections/all etc.
 */

import { randomUUID } from "crypto";
import { getDb } from "./config";
import { encryptField, decryptField } from "./crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CheckmkServerRecord {
  id: string;
  name: string;
  url: string;          // e.g. https://checkmk.local/mysite
  username: string;     // automation user
  secret_encrypted: string;
  ignore_ssl_errors: number;
  enabled: number;
  sort_order: number;
  created_at: string;
}

export interface CheckmkServer {
  id: string;
  name: string;
  url: string;
  username: string;
  secretDecrypted: string;
  ignoreSslErrors: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CheckmkServerPublic {
  id: string;
  name: string;
  url: string;
  username: string;
  secretSet: boolean;
  ignoreSslErrors: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CheckmkHost {
  hostName: string;
  folder: string;
  ipAddress: string;
  alias: string;
  labels: Record<string, string>;
  isCluster: boolean;
}

export interface CheckmkMutationResult {
  success: boolean;
  message: string;
}

// ── SQLite table ───────────────────────────────────────────────────────────────

function initCheckmkTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS checkmk_servers (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      url                 TEXT NOT NULL,
      username            TEXT NOT NULL,
      secret_encrypted    TEXT NOT NULL DEFAULT '',
      ignore_ssl_errors   INTEGER NOT NULL DEFAULT 1,
      enabled             INTEGER NOT NULL DEFAULT 1,
      sort_order          INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL
    )
  `);
}

// ── Server CRUD ────────────────────────────────────────────────────────────────

export function listCheckmkServersPublic(): CheckmkServerPublic[] {
  initCheckmkTable();
  const rows = getDb()
    .prepare("SELECT * FROM checkmk_servers ORDER BY sort_order ASC, name ASC")
    .all() as CheckmkServerRecord[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    secretSet: !!r.secret_encrypted,
    ignoreSslErrors: r.ignore_ssl_errors === 1,
    enabled: r.enabled === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));
}

async function getDecryptedServer(id: string): Promise<CheckmkServer | null> {
  initCheckmkTable();
  const row = getDb()
    .prepare("SELECT * FROM checkmk_servers WHERE id = ?")
    .get(id) as CheckmkServerRecord | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    secretDecrypted: row.secret_encrypted ? await decryptField(row.secret_encrypted) : "",
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** Get the first enabled CheckMK server (used by provisioning pipeline). */
export async function getFirstEnabledCheckmkServer(): Promise<CheckmkServer | null> {
  initCheckmkTable();
  const row = getDb()
    .prepare("SELECT * FROM checkmk_servers WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1")
    .get() as CheckmkServerRecord | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    secretDecrypted: row.secret_encrypted ? await decryptField(row.secret_encrypted) : "",
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: true,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function createCheckmkServer(data: {
  name: string;
  url: string;
  username: string;
  secret: string;
  ignoreSslErrors?: boolean;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<CheckmkServerPublic> {
  initCheckmkTable();
  const id = randomUUID();
  const secretEnc = data.secret ? await encryptField(data.secret) : "";
  getDb()
    .prepare(
      `INSERT INTO checkmk_servers
        (id, name, url, username, secret_encrypted, ignore_ssl_errors, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, data.name, data.url.replace(/\/+$/, ""), data.username, secretEnc,
      data.ignoreSslErrors !== false ? 1 : 0,
      data.enabled !== false ? 1 : 0,
      data.sortOrder ?? 0,
      new Date().toISOString(),
    );
  return listCheckmkServersPublic().find(s => s.id === id)!;
}

export async function updateCheckmkServer(
  id: string,
  data: Partial<{
    name: string; url: string; username: string; secret: string;
    ignoreSslErrors: boolean; enabled: boolean; sortOrder: number;
  }>,
): Promise<CheckmkServerPublic | null> {
  initCheckmkTable();
  const row = getDb()
    .prepare("SELECT * FROM checkmk_servers WHERE id = ?")
    .get(id) as CheckmkServerRecord | undefined;
  if (!row) return null;
  const secretEnc = data.secret !== undefined
    ? (data.secret ? await encryptField(data.secret) : "")
    : row.secret_encrypted;
  getDb()
    .prepare(
      `UPDATE checkmk_servers SET
        name = ?, url = ?, username = ?, secret_encrypted = ?,
        ignore_ssl_errors = ?, enabled = ?, sort_order = ?
       WHERE id = ?`,
    )
    .run(
      data.name ?? row.name,
      data.url !== undefined ? data.url.replace(/\/+$/, "") : row.url,
      data.username ?? row.username,
      secretEnc,
      data.ignoreSslErrors !== undefined ? (data.ignoreSslErrors ? 1 : 0) : row.ignore_ssl_errors,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : row.enabled,
      data.sortOrder ?? row.sort_order,
      id,
    );
  return listCheckmkServersPublic().find(s => s.id === id) ?? null;
}

export function deleteCheckmkServer(id: string): boolean {
  initCheckmkTable();
  return getDb().prepare("DELETE FROM checkmk_servers WHERE id = ?").run(id).changes > 0;
}

// ── REST API Client ────────────────────────────────────────────────────────────

async function cmkFetch(
  server: CheckmkServer,
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; data: unknown }> {
  const url = `${server.url}/check_mk/api/1.0${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${server.username} ${server.secretDecrypted}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  const doFetch = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    return fetch(url, { ...options, headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  let res: Response;
  if (server.ignoreSslErrors) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try { res = await doFetch(); }
    finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  } else {
    res = await doFetch();
  }

  if (res.status === 204) return { status: 204, data: null };
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (data as Record<string, unknown>)?.detail ?? (data as Record<string, unknown>)?.title ?? `HTTP ${res.status}`;
    throw new Error(`CheckMK ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  return { status: res.status, data };
}

// ── Connection test ────────────────────────────────────────────────────────────

export async function testCheckmkConnection(
  serverId: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const server = await getDecryptedServer(serverId);
  if (!server) return { ok: false, error: "Server not found" };
  try {
    const { data } = await cmkFetch(server, "/version");
    const d = data as Record<string, unknown>;
    const versions = d?.versions as Record<string, unknown> | undefined;
    const version = versions?.checkmk ?? d?.checkmk_version ?? "unknown";
    return { ok: true, message: `Connected — CheckMK ${version}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ── Host queries ───────────────────────────────────────────────────────────────

/** List / search hosts. Pass query string to filter (name substring match). */
export async function searchCheckmkHosts(
  query?: string,
  serverId?: string,
): Promise<CheckmkHost[]> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledCheckmkServer();
  if (!server) return [];
  try {
    const { data } = await cmkFetch(server, "/domain-types/host_config/collections/all");
    const d = data as { value?: Array<{ id?: string; extensions?: Record<string, unknown> }> };
    const hosts: CheckmkHost[] = (d?.value ?? []).map(h => ({
      hostName: String(h.id ?? h.extensions?.host_name ?? ""),
      folder: String(h.extensions?.folder ?? ""),
      ipAddress: String((h.extensions?.attributes as Record<string, unknown>)?.ipaddress ?? ""),
      alias: String((h.extensions?.attributes as Record<string, unknown>)?.alias ?? ""),
      labels: ((h.extensions?.attributes as Record<string, unknown>)?.labels ?? {}) as Record<string, string>,
      isCluster: !!(h.extensions?.is_cluster),
    }));
    if (!query) return hosts;
    const q = query.toLowerCase();
    return hosts.filter(h =>
      h.hostName.toLowerCase().includes(q) ||
      h.alias.toLowerCase().includes(q) ||
      h.ipAddress.includes(q),
    );
  } catch {
    return [];
  }
}

/** Get a single host by name. */
export async function getCheckmkHost(
  hostName: string,
  serverId?: string,
): Promise<CheckmkHost | null> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledCheckmkServer();
  if (!server) return null;
  try {
    const { data } = await cmkFetch(server, `/objects/host_config/${encodeURIComponent(hostName)}`);
    const h = data as { id?: string; extensions?: Record<string, unknown> };
    return {
      hostName: String(h.id ?? ""),
      folder: String(h.extensions?.folder ?? ""),
      ipAddress: String((h.extensions?.attributes as Record<string, unknown>)?.ipaddress ?? ""),
      alias: String((h.extensions?.attributes as Record<string, unknown>)?.alias ?? ""),
      labels: ((h.extensions?.attributes as Record<string, unknown>)?.labels ?? {}) as Record<string, string>,
      isCluster: !!(h.extensions?.is_cluster),
    };
  } catch {
    return null;
  }
}

// ── Host mutations ─────────────────────────────────────────────────────────────

/** Create a host in CheckMK, run service discovery, and activate changes. */
export async function createCheckmkHost(opts: {
  hostName: string;
  folder: string;
  ipAddress: string;
  alias?: string;
  labels?: Record<string, string>;
  serverId?: string;
}): Promise<CheckmkMutationResult> {
  const server = opts.serverId
    ? await getDecryptedServer(opts.serverId)
    : await getFirstEnabledCheckmkServer();
  if (!server) return { success: false, message: "No CheckMK server configured or enabled" };

  try {
    // 1. Create host
    const attributes: Record<string, unknown> = { ipaddress: opts.ipAddress };
    if (opts.alias) attributes.alias = opts.alias;
    if (opts.labels && Object.keys(opts.labels).length) attributes.labels = opts.labels;

    await cmkFetch(server, "/domain-types/host_config/collections/all", {
      method: "POST",
      body: JSON.stringify({
        host_name: opts.hostName,
        folder: opts.folder.startsWith("/") ? opts.folder : `/${opts.folder}`,
        attributes,
      }),
    });

    // 2. Service discovery (best-effort — may timeout on fresh hosts)
    try {
      await cmkFetch(server, `/objects/host/${encodeURIComponent(opts.hostName)}/actions/discover_services/invoke`, {
        method: "POST",
        body: JSON.stringify({ mode: "fix_all" }),
      });
    } catch { /* discovery may fail if agent isn't reachable yet */ }

    // 3. Activate changes
    try {
      await cmkFetch(server, "/domain-types/activation_run/actions/activate-changes/invoke", {
        method: "POST",
        body: JSON.stringify({ force_foreign_changes: true }),
        headers: { "If-Match": "*" },
      });
    } catch { /* activation may take time — best-effort */ }

    return { success: true, message: `Host ${opts.hostName} created in CheckMK` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

/** Delete a host from CheckMK and activate changes. */
export async function deleteCheckmkHost(
  hostName: string,
  serverId?: string,
): Promise<CheckmkMutationResult> {
  const server = serverId
    ? await getDecryptedServer(serverId)
    : await getFirstEnabledCheckmkServer();
  if (!server) return { success: false, message: "No CheckMK server configured or enabled" };

  try {
    await cmkFetch(server, `/objects/host_config/${encodeURIComponent(hostName)}`, {
      method: "DELETE",
    });

    // Activate changes
    try {
      await cmkFetch(server, "/domain-types/activation_run/actions/activate-changes/invoke", {
        method: "POST",
        body: JSON.stringify({ force_foreign_changes: true }),
        headers: { "If-Match": "*" },
      });
    } catch { /* best-effort */ }

    return { success: true, message: `Host ${hostName} deleted from CheckMK` };
  } catch (err) {
    // 404 = already gone
    if (err instanceof Error && err.message.includes("404")) {
      return { success: true, message: `Host ${hostName} not found (already removed)` };
    }
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}
