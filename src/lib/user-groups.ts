/**
 * User Groups module — admin-managed groups of users.
 *
 * Stored globally in config/docit.db under key "user-groups.json".
 * Used for dashboard link visibility and other permission targeting.
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { UserGroup, UserGroupsData } from "./types";

const FILE = "user-groups.json";

const EMPTY: UserGroupsData = { groups: [] };

export async function readUserGroups(): Promise<UserGroupsData> {
  return readJsonConfig<UserGroupsData>(FILE, { ...EMPTY, groups: [] });
}

async function writeUserGroups(data: UserGroupsData): Promise<void> {
  await writeJsonConfig(FILE, data);
}

export async function addUserGroup(fields: {
  name: string;
  description?: string;
  members?: string[];
}): Promise<UserGroup> {
  const data = await readUserGroups();
  const group: UserGroup = {
    id: randomUUID(),
    name: fields.name.trim(),
    description: (fields.description || "").trim(),
    members: fields.members || [],
    createdAt: new Date().toISOString(),
  };
  data.groups.push(group);
  await writeUserGroups(data);
  return group;
}

export async function updateUserGroup(
  id: string,
  fields: { name?: string; description?: string; members?: string[] },
): Promise<UserGroup | null> {
  const data = await readUserGroups();
  const idx = data.groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  if (fields.name !== undefined) data.groups[idx].name = fields.name.trim();
  if (fields.description !== undefined) data.groups[idx].description = fields.description.trim();
  if (fields.members !== undefined) data.groups[idx].members = fields.members;
  await writeUserGroups(data);
  return data.groups[idx];
}

export async function deleteUserGroup(id: string): Promise<boolean> {
  const data = await readUserGroups();
  const before = data.groups.length;
  data.groups = data.groups.filter((g) => g.id !== id);
  if (data.groups.length === before) return false;
  await writeUserGroups(data);
  return true;
}

/** Return group IDs that a given username belongs to. */
export async function getUserGroupsForUser(username: string): Promise<string[]> {
  const data = await readUserGroups();
  return data.groups
    .filter((g) => g.members.includes(username))
    .map((g) => g.id);
}
