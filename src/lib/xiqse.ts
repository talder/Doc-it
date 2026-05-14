/**
 * XIQ-SE (ExtremeCloud IQ Site Engine) Integration Module — server-only library.
 *
 * Connects to XIQ-SE's Northbound GraphQL API to manage NAC end-system groups.
 * Server records stored in SQLite with AES-256-GCM encrypted passwords (crypto.ts).
 * Self-signed SSL handled per-server via NODE_TLS_REJECT_UNAUTHORIZED pattern.
 */

import { randomUUID } from "crypto";
import { getDb } from "./config";
import { encryptField, decryptField } from "./crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface XiqseServerRecord {
  id: string;
  name: string;
  url: string;
  username: string;
  password_encrypted: string;
  ignore_ssl_errors: number;
  enabled: number;
  sort_order: number;
  created_at: string;
}

export interface XiqseServer {
  id: string;
  name: string;
  url: string;
  username: string;
  passwordDecrypted: string;
  ignoreSslErrors: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface XiqseServerPublic {
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

export interface NacGroup {
  name: string;
  type: string;
  description: string;
}

export interface NacEndSystemInfo {
  macAddress: string;
  ipAddress: string;
  state: string;
  switchIP: string;
  switchPort: string;
  policy: string;
  nacProfileName: string;
  groups: string[];
}

export interface NacMutationResult {
  success: boolean;
  message: string;
}

// ── SQLite table ───────────────────────────────────────────────────────────────

function initXiqseTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS xiqse_servers (
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

export function listXiqseServersPublic(): XiqseServerPublic[] {
  initXiqseTable();
  const rows = getDb()
    .prepare("SELECT * FROM xiqse_servers ORDER BY sort_order ASC, name ASC")
    .all() as XiqseServerRecord[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    passwordSet: !!r.password_encrypted,
    ignoreSslErrors: r.ignore_ssl_errors === 1,
    enabled: r.enabled === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));
}

async function getDecryptedServer(id: string): Promise<XiqseServer | null> {
  initXiqseTable();
  const row = getDb()
    .prepare("SELECT * FROM xiqse_servers WHERE id = ?")
    .get(id) as XiqseServerRecord | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    passwordDecrypted: row.password_encrypted ? await decryptField(row.password_encrypted) : "",
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** Get the first enabled XIQ-SE server (used by provisioning pipeline). */
export async function getFirstEnabledServer(): Promise<XiqseServer | null> {
  initXiqseTable();
  const row = getDb()
    .prepare("SELECT * FROM xiqse_servers WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1")
    .get() as XiqseServerRecord | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    passwordDecrypted: row.password_encrypted ? await decryptField(row.password_encrypted) : "",
    ignoreSslErrors: row.ignore_ssl_errors === 1,
    enabled: true,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function createXiqseServer(data: {
  name: string;
  url: string;
  username: string;
  password: string;
  ignoreSslErrors?: boolean;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<XiqseServerPublic> {
  initXiqseTable();
  const id = randomUUID();
  const passwordEnc = data.password ? await encryptField(data.password) : "";
  getDb()
    .prepare(
      `INSERT INTO xiqse_servers
        (id, name, url, username, password_encrypted, ignore_ssl_errors, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      data.name,
      data.url.replace(/\/+$/, ""),
      data.username,
      passwordEnc,
      data.ignoreSslErrors !== false ? 1 : 0,
      data.enabled !== false ? 1 : 0,
      data.sortOrder ?? 0,
      new Date().toISOString(),
    );
  return listXiqseServersPublic().find(s => s.id === id)!;
}

export async function updateXiqseServer(
  id: string,
  data: Partial<{
    name: string;
    url: string;
    username: string;
    password: string;
    ignoreSslErrors: boolean;
    enabled: boolean;
    sortOrder: number;
  }>,
): Promise<XiqseServerPublic | null> {
  initXiqseTable();
  const row = getDb()
    .prepare("SELECT * FROM xiqse_servers WHERE id = ?")
    .get(id) as XiqseServerRecord | undefined;
  if (!row) return null;

  const passwordEnc =
    data.password !== undefined
      ? data.password
        ? await encryptField(data.password)
        : ""
      : row.password_encrypted;

  getDb()
    .prepare(
      `UPDATE xiqse_servers SET
        name = ?, url = ?, username = ?, password_encrypted = ?,
        ignore_ssl_errors = ?, enabled = ?, sort_order = ?
       WHERE id = ?`,
    )
    .run(
      data.name ?? row.name,
      data.url !== undefined ? data.url.replace(/\/+$/, "") : row.url,
      data.username ?? row.username,
      passwordEnc,
      data.ignoreSslErrors !== undefined ? (data.ignoreSslErrors ? 1 : 0) : row.ignore_ssl_errors,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : row.enabled,
      data.sortOrder ?? row.sort_order,
      id,
    );
  return listXiqseServersPublic().find(s => s.id === id) ?? null;
}

export function deleteXiqseServer(id: string): boolean {
  initXiqseTable();
  const r = getDb().prepare("DELETE FROM xiqse_servers WHERE id = ?").run(id);
  return r.changes > 0;
}

// ── GraphQL NBI Client ─────────────────────────────────────────────────────────

async function xiqseGraphQL(
  server: XiqseServer,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const auth = Buffer.from(`${server.username}:${server.passwordDecrypted}`).toString("base64");
  const url = `${server.url}/nbi/graphql`;

  const doFetch = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };

  let res: Response;
  if (server.ignoreSslErrors) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      res = await doFetch();
    } finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  } else {
    res = await doFetch();
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`XIQ-SE HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`XIQ-SE GraphQL: ${json.errors.map(e => e.message).join("; ")}`);
  }
  return json.data;
}

// ── Connection test ────────────────────────────────────────────────────────────

export async function testXiqseConnection(
  serverId: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const server = await getDecryptedServer(serverId);
  if (!server) return { ok: false, error: "Server not found" };
  try {
    const data = (await xiqseGraphQL(server, `{ administration { version } }`)) as {
      administration?: { version?: string };
    };
    const version = data?.administration?.version ?? "unknown";
    return { ok: true, message: `Connected — XIQ-SE ${version}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ── NAC Queries ────────────────────────────────────────────────────────────────

/** List all NAC end-system groups from the first enabled server (or a specific one). */
export async function listNacGroups(serverId?: string): Promise<NacGroup[]> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledServer();
  if (!server) return [];
  try {
    const data = (await xiqseGraphQL(
      server,
      `{ accessControl { allGroups { name type description } } }`,
    )) as { accessControl?: { allGroups?: NacGroup[] } };
    return data?.accessControl?.allGroups ?? [];
  } catch {
    return [];
  }
}

/** Look up a MAC address in XIQ-SE to find its end-system status and group memberships. */
export async function lookupNacMac(
  mac: string,
  serverId?: string,
): Promise<NacEndSystemInfo | null> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledServer();
  if (!server) return null;
  try {
    const data = (await xiqseGraphQL(
      server,
      `query ($mac: String!) {
        accessControl {
          endSystemByMac(macAddress: $mac) {
            macAddress ipAddress state switchIP switchPort policy nacProfileName
          }
          endSystemInGroups(mac: $mac) { name }
        }
      }`,
      { mac },
    )) as {
      accessControl?: {
        endSystemByMac?: Record<string, string> | null;
        endSystemInGroups?: Array<{ name: string }>;
      };
    };
    const es = data?.accessControl?.endSystemByMac;
    if (!es) return null;
    return {
      macAddress: es.macAddress ?? mac,
      ipAddress: es.ipAddress ?? "",
      state: es.state ?? "",
      switchIP: es.switchIP ?? "",
      switchPort: es.switchPort ?? "",
      policy: es.policy ?? "",
      nacProfileName: es.nacProfileName ?? "",
      groups: (data?.accessControl?.endSystemInGroups ?? []).map(g => g.name),
    };
  } catch {
    return null;
  }
}

// ── NAC Mutations ──────────────────────────────────────────────────────────────

/** Add a MAC address to a NAC end-system group and enforce. */
export async function addMacToNacGroup(
  mac: string,
  group: string,
  description?: string,
  serverId?: string,
): Promise<NacMutationResult> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledServer();
  if (!server) return { success: false, message: "No XIQ-SE server configured or enabled" };
  try {
    const data = (await xiqseGraphQL(
      server,
      `mutation ($input: GroupAddEntryInput!) {
        accessControl {
          addMACToEndSystemGroup(input: $input) { status message }
        }
      }`,
      {
        input: {
          group,
          value: mac,
          description: description ?? "",
          reauthenticate: true,
          removeFromOtherGroups: true,
        },
      },
    )) as { accessControl?: { addMACToEndSystemGroup?: { status?: string; message?: string } } };
    const r = data?.accessControl?.addMACToEndSystemGroup;
    // Enforce after change
    await enforceNac(server);
    return { success: true, message: r?.message ?? `Added ${mac} to ${group}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

/** Remove a MAC address from a NAC end-system group and enforce. */
export async function removeMacFromNacGroup(
  mac: string,
  group: string,
  serverId?: string,
): Promise<NacMutationResult> {
  const server = serverId ? await getDecryptedServer(serverId) : await getFirstEnabledServer();
  if (!server) return { success: false, message: "No XIQ-SE server configured or enabled" };
  try {
    await xiqseGraphQL(
      server,
      `mutation ($input: GroupRemoveEntryInput!) {
        accessControl {
          removeMACFromEndSystemGroup(input: $input) { status message }
        }
      }`,
      { input: { group, value: mac, reauthenticate: true } },
    );
    await enforceNac(server);
    return { success: true, message: `Removed ${mac} from ${group}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

/** Trigger NAC enforcement across all engines. */
async function enforceNac(server: XiqseServer): Promise<void> {
  try {
    await xiqseGraphQL(
      server,
      `mutation { accessControl { enforceAllAccessControlEnginesForceSwitchesAndPortal } }`,
    );
  } catch {
    // Best-effort — enforcement failures should not block the caller.
  }
}
