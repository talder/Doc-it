import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { User, Session, SanitizedUser } from "./types";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const COOKIE_NAME = "docit-session";
const BCRYPT_ROUNDS = 12;

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
  sessions[sessionId] = { username, createdAt: new Date().toISOString() };
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
