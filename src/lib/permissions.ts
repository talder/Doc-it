import { readJsonConfig } from "./config";
import { getCurrentUser } from "./auth";
import type { Space, SpaceRole, User } from "./types";

const SPACES_FILE = "spaces.json";

export async function getSpaces(): Promise<Space[]> {
  return readJsonConfig<Space[]>(SPACES_FILE, []);
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  const spaces = await getSpaces();
  return spaces.find((s) => s.slug === slug) || null;
}

export async function getAccessibleSpaces(user: User): Promise<Space[]> {
  const spaces = await getSpaces();
  if (user.isAdmin) return spaces;
  return spaces.filter((s) => s.permissions[user.username] !== undefined);
}

export function getUserSpaceRole(space: Space, user: User): SpaceRole | null {
  if (user.isAdmin) return "admin";
  return space.permissions[user.username] || null;
}

export function canRead(role: SpaceRole | null): boolean {
  return role !== null;
}

export function canWrite(role: SpaceRole | null): boolean {
  return role === "admin" || role === "writer";
}

export function isSpaceAdmin(role: SpaceRole | null): boolean {
  return role === "admin";
}

/**
 * Check if the current user has at least the given role in a space.
 * Returns { user, space, role } or throws a descriptive error string.
 * Supports both cookie/bearer-user-key auth and service key (dk_s_...) bearer auth.
 */
export async function requireSpaceRole(
  slug: string,
  minRole: "reader" | "writer" | "admin"
): Promise<{ user: User; space: Space; role: SpaceRole }> {
  const space = await getSpaceBySlug(slug);
  if (!space) throw "Space not found";

  // ── Path 1: regular user (cookie or user API key) ─────────────────────────
  const user = await getCurrentUser();
  if (user) {
    const role = getUserSpaceRole(space, user);
    if (!role) throw "Access denied";
    if (minRole === "writer" && !canWrite(role)) throw "Write access required";
    if (minRole === "admin" && !isSpaceAdmin(role)) throw "Admin access required";
    return { user, space, role };
  }

  // ── Path 2: service API key (dk_s_...) ────────────────────────────────────
  const { getBearerToken, resolveServiceApiKey, serviceKeyRoleForSpace, syntheticServiceUser } =
    await import("./api-keys");
  const token = await getBearerToken();
  if (token?.startsWith("dk_s_")) {
    const svcKey = await resolveServiceApiKey(token);
    if (!svcKey) throw "Invalid or expired service key";

    const role = serviceKeyRoleForSpace(svcKey, slug);
    if (!role) throw "Access denied";
    if (minRole === "writer" && !canWrite(role)) throw "Write access required";
    if (minRole === "admin" && !isSpaceAdmin(role)) throw "Admin access required";

    return { user: syntheticServiceUser(svcKey), space, role };
  }

  throw "Not authenticated";
}
