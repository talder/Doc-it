/**
 * Active Directory / LDAP authentication service.
 *
 * Supports plain LDAP (port 389) and LDAPS (port 636 + TLS).
 * Bind password is stored AES-256-GCM encrypted in the SQLite KV store.
 *
 * Auth flow:
 *  1. Bind with service account.
 *  2. Search for user by sAMAccountName (or userPrincipalName for email input).
 *  3. Re-bind as user DN + supplied password to verify credentials.
 *  4. Return display name, email, and memberOf list.
 *
 * Space permissions are synced on every successful login so that AD group
 * changes take effect on the user's next login.
 */

import { Client, type ClientOptions } from "ldapts";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";
import { getUsers, writeUsers } from "./auth";
import type { AdConfig, Space, SpaceRole, User } from "./types";

// ---------------------------------------------------------------------------
// Constants & defaults
// ---------------------------------------------------------------------------

const AD_CONFIG_FILE = "ad.json";

const DEFAULT_AD_CONFIG: AdConfig = {
  enabled: false,
  host: "",
  port: 389,
  ssl: false,
  tlsRejectUnauthorized: true,
  bindDn: "",
  baseDn: "",
  userSearchBase: "",
  allowedGroups: [],
  allowedUsers: [],
  groupMappings: [],
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export async function getAdConfig(): Promise<AdConfig> {
  return readJsonConfig<AdConfig>(AD_CONFIG_FILE, { ...DEFAULT_AD_CONFIG });
}

export async function saveAdConfig(config: AdConfig): Promise<void> {
  await writeJsonConfig(AD_CONFIG_FILE, config);
}

/** Return a sanitized version safe to send to the browser (no plaintext secret). */
export function sanitizeAdConfig(config: AdConfig): Omit<AdConfig, "bindPasswordEncrypted"> & { bindPasswordSet: boolean } {
  const { bindPasswordEncrypted, ...rest } = config;
  return { ...rest, bindPasswordSet: !!bindPasswordEncrypted };
}

// ---------------------------------------------------------------------------
// LDAP client factory
// ---------------------------------------------------------------------------

function buildClient(config: AdConfig): Client {
  const scheme = config.ssl ? "ldaps" : "ldap";
  const url = `${scheme}://${config.host}:${config.port}`;

  const options: ClientOptions = {
    url,
    connectTimeout: 5000,
    timeout: 10000,
  };

  if (config.ssl && !config.tlsRejectUnauthorized) {
    options.tlsOptions = { rejectUnauthorized: false };
  }

  return new Client(options);
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface AdAuthResult {
  success: boolean;
  error?: string;
  userDn?: string;
  sAMAccountName?: string;
  displayName?: string;
  email?: string;
  memberOf?: string[];
}

/**
 * Authenticate a user against Active Directory.
 * Accepts sAMAccountName (plain username) or UPN / email address.
 */
export async function authenticateAdUser(
  config: AdConfig,
  usernameOrEmail: string,
  password: string
): Promise<AdAuthResult> {
  if (!config.enabled || !config.host) {
    return { success: false, error: "AD not configured" };
  }
  if (!config.bindDn) {
    return { success: false, error: "AD bind DN not configured" };
  }

  const bindPassword = config.bindPasswordEncrypted
    ? await decryptField(config.bindPasswordEncrypted)
    : "";

  if (!bindPassword) {
    return { success: false, error: "AD bind password not configured" };
  }

  const serviceClient = buildClient(config);

  try {
    // Step 1: bind with service account
    await serviceClient.bind(config.bindDn, bindPassword);

    // Step 2: search for the user
    const isEmail = usernameOrEmail.includes("@");
    const filterAttr = isEmail ? "userPrincipalName" : "sAMAccountName";
    const filter = `(${filterAttr}=${escapeLdap(usernameOrEmail)})`;
    const searchBase = config.userSearchBase || config.baseDn;

    const { searchEntries } = await serviceClient.search(searchBase, {
      scope: "sub",
      filter,
      attributes: ["dn", "sAMAccountName", "displayName", "mail", "userPrincipalName", "memberOf"],
    });

    await serviceClient.unbind();

    if (!searchEntries.length) {
      return { success: false, error: "User not found in directory" };
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;
    const sAMAccountName = String(entry.sAMAccountName ?? "");
    const displayName = String(entry.displayName ?? entry.sAMAccountName ?? usernameOrEmail);
    const email = String(entry.mail ?? entry.userPrincipalName ?? "");

    // memberOf can be a single string or an array of strings
    const rawMemberOf = entry.memberOf;
    const memberOf: string[] = Array.isArray(rawMemberOf)
      ? rawMemberOf.map(String)
      : rawMemberOf
        ? [String(rawMemberOf)]
        : [];

    // Step 3: verify user password by binding as the user
    const userClient = buildClient(config);
    try {
      await userClient.bind(userDn, password);
      await userClient.unbind();
    } catch {
      return { success: false, error: "Invalid credentials" };
    }

    return { success: true, userDn, sAMAccountName, displayName, email, memberOf };
  } catch (err) {
    try { await serviceClient.unbind(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `AD connection error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testAdConnection(
  config: AdConfig
): Promise<{ success: boolean; error?: string; info?: string }> {
  if (!config.host) return { success: false, error: "Host is required" };
  if (!config.bindDn) return { success: false, error: "Bind DN is required" };

  const bindPassword = config.bindPasswordEncrypted
    ? await decryptField(config.bindPasswordEncrypted)
    : "";

  if (!bindPassword) return { success: false, error: "Bind password is required" };

  const client = buildClient(config);
  try {
    await client.bind(config.bindDn, bindPassword);
    await client.unbind();
    return { success: true, info: `Successfully connected to ${config.host}:${config.port}` };
  } catch (err) {
    try { await client.unbind(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Access resolution
// ---------------------------------------------------------------------------

export interface AdAccessResult {
  /** User is on the allow-list (or list is empty → all AD users allowed) */
  allowed: boolean;
  /** User should receive global admin role */
  isAdmin: boolean;
  /** Per-space role assignments derived from group mappings */
  spaceRoles: Record<string, SpaceRole>;
}

/**
 * Determine whether the user is allowed to log in and compute their
 * space role assignments from the configured group mappings.
 *
 * - If both allowedGroups and allowedUsers are empty, any authenticated
 *   AD user may log in (pending state if no group mappings match).
 * - A mapping with spaceSlug === "*" grants global admin.
 * - When multiple mappings match the same space, the highest role wins.
 */
export function resolveAdAccess(
  sAMAccountName: string,
  memberOf: string[],
  config: AdConfig
): AdAccessResult {
  const memberOfLower = memberOf.map((g) => g.toLowerCase());

  // Allow-list check (case-insensitive DN / username comparison)
  const inAllowedGroup = config.allowedGroups.some((g) =>
    memberOfLower.includes(g.toLowerCase())
  );
  const inAllowedUser = config.allowedUsers.some(
    (u) => u.toLowerCase() === sAMAccountName.toLowerCase()
  );

  // Empty lists → open to all authenticated AD users
  const listsDefined = config.allowedGroups.length > 0 || config.allowedUsers.length > 0;
  const allowed = !listsDefined || inAllowedGroup || inAllowedUser;

  // Compute space roles from matched group mappings
  const spaceRoles: Record<string, SpaceRole> = {};
  let isAdmin = false;

  for (const mapping of config.groupMappings) {
    if (!memberOfLower.includes(mapping.groupDn.toLowerCase())) continue;

    if (mapping.spaceSlug === "*") {
      isAdmin = true;
    } else {
      const existing = spaceRoles[mapping.spaceSlug];
      if (!existing || roleRank(mapping.role) > roleRank(existing)) {
        spaceRoles[mapping.spaceSlug] = mapping.role;
      }
    }
  }

  return { allowed, isAdmin, spaceRoles };
}

function roleRank(role: SpaceRole): number {
  return role === "admin" ? 3 : role === "writer" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Shadow user management
// ---------------------------------------------------------------------------

/**
 * Create or update the thin local record ("shadow user") for an AD user.
 * The shadow user has no usable password and cannot authenticate locally.
 * Display name and email are synced from AD on every login.
 */
export async function upsertAdShadowUser(params: {
  sAMAccountName: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  status: "active" | "pending";
  adGroups?: string[];
}): Promise<User> {
  const users = await getUsers();
  const username = params.sAMAccountName.toLowerCase();
  const idx = users.findIndex((u) => u.username === username);

  if (idx !== -1) {
    // Sync mutable AD-sourced fields
    users[idx].fullName = params.displayName || users[idx].fullName;
    users[idx].email = params.email || users[idx].email;
    users[idx].isAdmin = params.isAdmin;
    users[idx].status = params.status;
    users[idx].lastLogin = new Date().toISOString();
    users[idx].authSource = "ad";
    users[idx].adUsername = params.sAMAccountName;
    if (params.adGroups) users[idx].adGroups = params.adGroups;
    await writeUsers(users);
    return users[idx];
  }

  // First-time login: create shadow record
  const newUser: User = {
    username,
    passwordHash: "AD_AUTH_ONLY", // intentionally non-functional
    isAdmin: params.isAdmin,
    fullName: params.displayName,
    email: params.email,
    status: params.status,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    authSource: "ad",
    adUsername: params.sAMAccountName,
    adGroups: params.adGroups ?? [],
  };

  users.push(newUser);
  await writeUsers(users);
  return newUser;
}

// ---------------------------------------------------------------------------
// Space permission sync
// ---------------------------------------------------------------------------

/**
 * Sync an AD user's space permissions from group mappings.
 *
 * Only spaces that are referenced in at least one AD group mapping are
 * considered "AD-managed".  For those spaces the role is set (or removed)
 * based on group membership.  Spaces that have NO group mapping configured
 * are left untouched so that admins can manually assign AD users to
 * additional spaces without the sync wiping those assignments on login.
 *
 * Global admin → set "admin" role on all spaces (additive only).
 */
export async function syncAdSpacePermissions(
  username: string,
  spaceRoles: Record<string, SpaceRole>,
  isAdmin: boolean
): Promise<void> {
  const spaces = await readJsonConfig<Space[]>("spaces.json", []);
  const adConfig = await getAdConfig();

  // Build set of space slugs that are managed by AD group mappings.
  const adManagedSlugs = new Set<string>();
  for (const mapping of adConfig.groupMappings) {
    if (mapping.spaceSlug !== "*") adManagedSlugs.add(mapping.spaceSlug);
  }

  let dirty = false;

  for (const space of spaces) {
    const desiredRole: SpaceRole | undefined = isAdmin ? "admin" : spaceRoles[space.slug];
    const currentRole = space.permissions[username];

    if (desiredRole) {
      // AD mapping (or global admin) grants a role → set it
      if (currentRole !== desiredRole) {
        space.permissions[username] = desiredRole;
        dirty = true;
      }
    } else if (currentRole !== undefined && adManagedSlugs.has(space.slug)) {
      // Only remove the user from spaces that ARE managed by AD mappings.
      // Manually-assigned spaces (no mapping configured) are left alone.
      delete space.permissions[username];
      dirty = true;
    }
  }

  if (dirty) await writeJsonConfig("spaces.json", spaces);
}

// ---------------------------------------------------------------------------
// Bind password helpers
// ---------------------------------------------------------------------------

/** Encrypt a plain-text bind password for storage. */
export async function encryptBindPassword(plain: string): Promise<string> {
  return encryptField(plain);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Escape special characters in LDAP filter values (RFC 4515). */
function escapeLdap(value: string): string {
  return value
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

