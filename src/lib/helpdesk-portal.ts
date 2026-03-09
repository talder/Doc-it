/**
 * Helpdesk Portal — separate user authentication system for external/public users.
 * Stores portal user accounts in config/helpdesk-portal-users.json.
 * Sessions tracked in config/helpdesk-portal-sessions.json.
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";

// ── Types ───────────────────────────────────────────────

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
}

export interface PortalSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface PortalUsersData {
  users: PortalUser[];
}

interface PortalSessionsData {
  sessions: PortalSession[];
}

// ── Storage ─────────────────────────────────────────────

const USERS_FILE = "helpdesk-portal-users.json";
const SESSIONS_FILE = "helpdesk-portal-sessions.json";

async function readUsers(): Promise<PortalUsersData> {
  return readJsonConfig<PortalUsersData>(USERS_FILE, { users: [] });
}

async function writeUsers(data: PortalUsersData): Promise<void> {
  await writeJsonConfig(USERS_FILE, data);
}

async function readSessions(): Promise<PortalSessionsData> {
  return readJsonConfig<PortalSessionsData>(SESSIONS_FILE, { sessions: [] });
}

async function writeSessions(data: PortalSessionsData): Promise<void> {
  await writeJsonConfig(SESSIONS_FILE, data);
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// ── Registration ────────────────────────────────────────

export async function registerPortalUser(email: string, displayName: string, password: string): Promise<{ ok: boolean; error?: string; user?: PortalUser }> {
  const data = await readUsers();
  if (data.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "Email already registered" };
  }
  const user: PortalUser = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await writeUsers(data);
  return { ok: true, user };
}

// ── Login ───────────────────────────────────────────────

export async function loginPortalUser(email: string, password: string): Promise<{ ok: boolean; error?: string; token?: string; user?: PortalUser }> {
  const data = await readUsers();
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Invalid email or password" };
  }
  // Update last login
  user.lastLogin = new Date().toISOString();
  await writeUsers(data);

  // Create session
  const sessions = await readSessions();
  const token = randomUUID();
  sessions.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), // 7 days
  });
  // Clean expired sessions
  sessions.sessions = sessions.sessions.filter((s) => new Date(s.expiresAt) > new Date());
  await writeSessions(sessions);

  return { ok: true, token, user };
}

// ── Session validation ──────────────────────────────────

export async function getPortalUserFromToken(token: string): Promise<PortalUser | null> {
  const sessions = await readSessions();
  const session = sessions.sessions.find((s) => s.token === token && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  const users = await readUsers();
  return users.users.find((u) => u.id === session.userId) || null;
}

// ── Logout ──────────────────────────────────────────────

export async function logoutPortalUser(token: string): Promise<void> {
  const sessions = await readSessions();
  sessions.sessions = sessions.sessions.filter((s) => s.token !== token);
  await writeSessions(sessions);
}
