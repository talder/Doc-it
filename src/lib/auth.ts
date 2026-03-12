import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { User, Session, SanitizedUser } from "./types";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const COOKIE_NAME = "docit-session";
const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour inactivity timeout (NIS2)

// --- Password ---

/** Hash a password with bcrypt (async). Use this for all new hashes. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports both bcrypt hashes ($2b$…) and legacy SHA-256 hex hashes.
 * Returns { match: true, needsRehash: false } for bcrypt,
 * or { match: true, needsRehash: true } for a legacy SHA-256 match
 * so the caller can transparently re-hash with bcrypt.
 */
export async function verifyPassword(
  plain: string,
  storedHash: string
): Promise<{ match: boolean; needsRehash: boolean }> {
  // bcrypt hashes start with $2a$ or $2b$
  if (storedHash.startsWith("$2")) {
    const match = await bcrypt.compare(plain, storedHash);
    return { match, needsRehash: false };
  }
  // Legacy SHA-256: 64-char hex
  const sha256 = createHash("sha256").update(plain).digest("hex");
  if (sha256 === storedHash) {
    return { match: true, needsRehash: true };
  }
  return { match: false, needsRehash: false };
}

/**
 * Check if a plaintext password matches any hash in the history array.
 * Used to enforce password reuse prevention (NIS2).
 */
export async function isPasswordInHistory(
  plain: string,
  history: string[]
): Promise<boolean> {
  for (const h of history) {
    if (h.startsWith("$2")) {
      if (await bcrypt.compare(plain, h)) return true;
    } else {
      // legacy SHA-256 entry
      const sha256 = createHash("sha256").update(plain).digest("hex");
      if (sha256 === h) return true;
    }
  }
  return false;
}

// --- Users ---

export async function getUsers(): Promise<User[]> {
  return readJsonConfig<User[]>(USERS_FILE, []);
}

export async function writeUsers(users: User[]): Promise<void> {
  await writeJsonConfig(USERS_FILE, users);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.username === username) || null;
}

export async function hasUsers(): Promise<boolean> {
  const users = await getUsers();
  return Array.isArray(users) && users.length > 0;
}

export function sanitizeUser(user: User): SanitizedUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

// --- Sessions ---

async function getSessions(): Promise<Record<string, Session>> {
  return readJsonConfig<Record<string, Session>>(SESSIONS_FILE, {});
}

async function writeSessions(sessions: Record<string, Session>): Promise<void> {
  await writeJsonConfig(SESSIONS_FILE, sessions);
}

export async function createSession(username: string): Promise<string> {
  const sessionId = randomUUID();
  const sessions = await getSessions();
  const now = new Date();
  sessions[sessionId] = {
    username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    lastActivityAt: now.toISOString(),
  };
  await writeSessions(sessions);
  return sessionId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await getSessions();
  delete sessions[sessionId];
  await writeSessions(sessions);
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const sessions = await getSessions();
  const session = sessions[sessionId];
  if (!session) return null;

  const now = new Date();

  // Enforce absolute session expiry
  if (session.expiresAt && new Date(session.expiresAt) < now) {
    delete sessions[sessionId];
    await writeSessions(sessions);
    return null;
  }

  // Enforce idle / inactivity timeout (NIS2)
  if (session.lastActivityAt) {
    const lastActivity = new Date(session.lastActivityAt);
    if (now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
      delete sessions[sessionId];
      await writeSessions(sessions);
      return null;
    }
  }

  // Touch: update last activity timestamp
  session.lastActivityAt = now.toISOString();
  await writeSessions(sessions);

  return getUserByUsername(session.username);
}

// --- Current user (cookie or bearer user-key) ---

export async function getCurrentUser(): Promise<User | null> {
  try {
    // 1. Cookie-based session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (sessionCookie?.value) return getSessionUser(sessionCookie.value);

    // 2. Bearer token — user API key (dk_u_...)
    const { getBearerToken, resolveUserApiKey } = await import("./api-keys");
    const token = await getBearerToken();
    if (token?.startsWith("dk_u_")) return resolveUserApiKey(token);

    return null;
  } catch {
    return null;
  }
}

export async function getCurrentSanitizedUser(): Promise<SanitizedUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return sanitizeUser(user);
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

/**
 * Determine whether cookies should use the `Secure` flag.
 * Auto-detects from the request protocol / X-Forwarded-Proto header,
 * with an explicit SECURE_COOKIES env-var override.
 */
export function useSecureCookies(request: Request): boolean {
  if (process.env.SECURE_COOKIES === "false") return false;
  if (process.env.SECURE_COOKIES === "true") return true;
  if (process.env.NODE_ENV !== "production") return false;
  // In production, detect from reverse-proxy headers or request URL
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try { return new URL(request.url).protocol === "https:"; } catch { return true; }
}

/**
 * Invalidate all sessions for a user, optionally preserving one session ID
 * (e.g. the session that was just re-issued after a password change).
 */
export async function invalidateUserSessions(
  username: string,
  keepSessionId?: string
): Promise<void> {
  const sessions = await getSessions();
  for (const id of Object.keys(sessions)) {
    if (sessions[id].username === username && id !== keepSessionId) {
      delete sessions[id];
    }
  }
  await writeSessions(sessions);
}

/**
 * Clear a user's TOTP state, forcing re-enrollment on next login.
 * Called by admins when a user loses their authenticator device.
 */
export async function resetUserMfa(username: string): Promise<boolean> {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) return false;
  delete users[idx].totpSecret;
  delete users[idx].totpBackupCodes;
  users[idx].totpEnabled = false;
  users[idx].totpFailedAttempts = 0;
  await writeUsers(users);
  return true;
}
