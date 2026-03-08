import { createHash, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { User, Session, SanitizedUser } from "./types";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const COOKIE_NAME = "docit-session";

// --- Password ---

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
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
