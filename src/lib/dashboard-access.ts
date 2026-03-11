/**
 * Dashboard access control — determines who can view or edit the dashboard.
 *
 * Access levels:
 *   "admin"  — full edit (create/update/delete sections & links)
 *   "viewer" — read-only (can see and click links)
 *   "none"   — dashboard is hidden entirely
 *
 * Stored globally in config/docit.db under key "dashboard-access.json".
 */

import { readJsonConfig, writeJsonConfig } from "./config";
import type { DashboardAccessConfig, DashboardRole, User } from "./types";

const FILE = "dashboard-access.json";

const EMPTY: DashboardAccessConfig = { allowedUsers: [], allowedAdGroups: [] };

export async function readDashboardAccess(): Promise<DashboardAccessConfig> {
  return readJsonConfig<DashboardAccessConfig>(FILE, { ...EMPTY });
}

export async function writeDashboardAccess(config: DashboardAccessConfig): Promise<void> {
  await writeJsonConfig(FILE, config);
}

/**
 * Determine a user's dashboard access level.
 *
 * 1. Admins always get "admin" (full edit).
 * 2. If the username appears in `allowedUsers` → "viewer".
 * 3. If the user is an AD user and any of their cached `adGroups` match
 *    an entry in `allowedAdGroups` (case-insensitive DN comparison) → "viewer".
 * 4. Otherwise → "none".
 */
export async function getDashboardRole(user: User): Promise<DashboardRole> {
  if (user.isAdmin) return "admin";

  const config = await readDashboardAccess();

  // Check explicit user allow-list
  if (config.allowedUsers.some((u) => u.toLowerCase() === user.username.toLowerCase())) {
    return "viewer";
  }

  // Check AD group membership
  if (user.adGroups && user.adGroups.length > 0 && config.allowedAdGroups.length > 0) {
    const userGroupsLower = user.adGroups.map((g) => g.toLowerCase());
    if (config.allowedAdGroups.some((ag) => userGroupsLower.includes(ag.toLowerCase()))) {
      return "viewer";
    }
  }

  return "none";
}
