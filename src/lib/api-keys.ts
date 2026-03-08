/**
 * API key management utilities.
 * Two key types:
 *   - User keys  (prefix "dk_u_"): linked to a user account, inherit space roles
 *   - Service keys (prefix "dk_s_"): admin-created, carry explicit per-space permissions
 *
 * Format: dk_u_<40 random hex chars>  (45 chars total)
 * Storage: SHA-256 hash only; raw secret shown once at creation.
 */

import { createHash, randomBytes, randomUUID } from "crypto";
import { headers } from "next/headers";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { UserApiKey, ServiceApiKey, SpaceRole, User } from "./types";

// ── Storage ────────────────────────────────────────────────────────────────────

const USER_KEYS_FILE = "user-api-keys.json";
const SERVICE_KEYS_FILE = "service-api-keys.json";

type UserKeyStore = Record<string, UserApiKey[]>; // username → keys

export async function readUserKeyStore(): Promise<UserKeyStore> {
  return readJsonConfig<UserKeyStore>(USER_KEYS_FILE, {});
}

export async function writeUserKeyStore(store: UserKeyStore): Promise<void> {
  await writeJsonConfig(USER_KEYS_FILE, store);
}

export async function readServiceKeys(): Promise<ServiceApiKey[]> {
  return readJsonConfig<ServiceApiKey[]>(SERVICE_KEYS_FILE, []);
}

export async function writeServiceKeys(keys: ServiceApiKey[]): Promise<void> {
  await writeJsonConfig(SERVICE_KEYS_FILE, keys);
}

// ── Generation ─────────────────────────────────────────────────────────────────

export function generateKeySecret(type: "user" | "service"): {
  secret: string;
  hash: string;
  prefix: string; // first 12 chars for display
} {
  const pfx = type === "user" ? "dk_u_" : "dk_s_";
  const random = randomBytes(20).toString("hex"); // 40 hex chars
  const secret = pfx + random;
  const hash = createHash("sha256").update(secret).digest("hex");
  const prefix = secret.slice(0, 12);
  return { secret, hash, prefix };
}

export function hashKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// ── Bearer token extraction ────────────────────────────────────────────────────

export async function getBearerToken(): Promise<string | null> {
  try {
    const h = await headers();
    const auth = h.get("Authorization") ?? h.get("authorization");
    if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
    return null;
  } catch {
    return null;
  }
}

// ── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Resolve a user API key token to the owning User object.
 * Returns null if invalid, expired, or user not found.
 * Updates lastUsedAt on success.
 */
export async function resolveUserApiKey(token: string): Promise<User | null> {
  if (!token.startsWith("dk_u_")) return null;
  const hash = hashKeySecret(token);

  const store = await readUserKeyStore();
  for (const [username, keys] of Object.entries(store)) {
    const idx = keys.findIndex((k) => k.keyHash === hash);
    if (idx === -1) continue;
    const key = keys[idx];

    // Check expiry
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

    // Update lastUsedAt (fire-and-forget, best effort)
    keys[idx] = { ...key, lastUsedAt: new Date().toISOString() };
    writeUserKeyStore({ ...store, [username]: keys }).catch(() => {});

    // Return the actual user
    const { getUserByUsername } = await import("./auth");
    return getUserByUsername(username);
  }
  return null;
}

/**
 * Resolve a service API key token.
 * Returns the ServiceApiKey if valid and not expired; null otherwise.
 * Updates lastUsedAt on success.
 */
export async function resolveServiceApiKey(token: string): Promise<ServiceApiKey | null> {
  if (!token.startsWith("dk_s_")) return null;
  const hash = hashKeySecret(token);

  const keys = await readServiceKeys();
  const idx = keys.findIndex((k) => k.keyHash === hash);
  if (idx === -1) return null;
  const key = keys[idx];

  // Check expiry
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

  // Update lastUsedAt (fire-and-forget)
  keys[idx] = { ...key, lastUsedAt: new Date().toISOString() };
  writeServiceKeys(keys).catch(() => {});

  return key;
}

// ── Service-key permission helper ─────────────────────────────────────────────

/**
 * Resolve the effective SpaceRole a service key has for a specific space.
 * Wildcard "*" matches any space.
 */
export function serviceKeyRoleForSpace(
  key: ServiceApiKey,
  spaceSlug: string
): SpaceRole | null {
  return key.permissions[spaceSlug] ?? key.permissions["*"] ?? null;
}

// ── Synthetic "user" for service keys ─────────────────────────────────────────

/**
 * Build a synthetic User-compatible object so existing routes that
 * destructure `user.username` or `user.isAdmin` keep working.
 */
export function syntheticServiceUser(key: ServiceApiKey): User {
  return {
    username: `svc:${key.name}`,
    passwordHash: "",
    isAdmin: false,
    createdAt: key.createdAt,
  };
}

// ── CRUD helpers used by API routes ───────────────────────────────────────────

export async function createUserApiKey(
  username: string,
  name: string,
  expiresAt?: string
): Promise<{ record: Omit<UserApiKey, "keyHash">; secret: string }> {
  const { secret, hash, prefix } = generateKeySecret("user");
  const record: UserApiKey = {
    id: randomUUID(),
    name,
    keyHash: hash,
    prefix,
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
  };

  const store = await readUserKeyStore();
  const userKeys = store[username] ?? [];
  store[username] = [...userKeys, record];
  await writeUserKeyStore(store);

  const { keyHash: _, ...safeRecord } = record;
  return { record: safeRecord, secret };
}

export async function revokeUserApiKey(username: string, id: string): Promise<boolean> {
  const store = await readUserKeyStore();
  const userKeys = store[username] ?? [];
  const next = userKeys.filter((k) => k.id !== id);
  if (next.length === userKeys.length) return false;
  store[username] = next;
  await writeUserKeyStore(store);
  return true;
}

export async function createServiceApiKey(
  createdBy: string,
  name: string,
  permissions: Record<string, SpaceRole>,
  expiresAt?: string
): Promise<{ record: Omit<ServiceApiKey, "keyHash">; secret: string }> {
  const { secret, hash, prefix } = generateKeySecret("service");
  const record: ServiceApiKey = {
    id: randomUUID(),
    name,
    keyHash: hash,
    prefix,
    permissions,
    createdBy,
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
  };

  const keys = await readServiceKeys();
  await writeServiceKeys([...keys, record]);

  const { keyHash: _, ...safeRecord } = record;
  return { record: safeRecord, secret };
}

export async function revokeServiceApiKey(id: string): Promise<boolean> {
  const keys = await readServiceKeys();
  const next = keys.filter((k) => k.id !== id);
  if (next.length === keys.length) return false;
  await writeServiceKeys(next);
  return true;
}
