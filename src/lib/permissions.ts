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
 */
export async function requireSpaceRole(
  slug: string,
  minRole: "reader" | "writer" | "admin"
): Promise<{ user: User; space: Space; role: SpaceRole }> {
  const user = await getCurrentUser();
  if (!user) throw "Not authenticated";

  const space = await getSpaceBySlug(slug);
  if (!space) throw "Space not found";

  const role = getUserSpaceRole(space, user);
  if (!role) throw "Access denied";

  if (minRole === "writer" && !canWrite(role)) throw "Write access required";
  if (minRole === "admin" && !isSpaceAdmin(role)) throw "Admin access required";

  return { user, space, role };
}
