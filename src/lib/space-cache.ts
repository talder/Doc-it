/**
 * In-memory per-space cache for the combined init payload.
 *
 * TTL: 60 seconds. Writes (doc create/update/delete, category changes, etc.)
 * call invalidateSpaceCache() to evict the entry immediately so users never
 * see stale sidebar data after their own mutations.
 *
 * This is a process-level cache — it resets on server restart. That is fine
 * because the app targets single-instance self-hosted deployments.
 */

import type { Category, DocFile, TagsIndex, TemplateInfo, DocStatusMap, SpaceCustomization } from "./types";

export interface SpaceInitData {
  categories: Category[];
  docs: DocFile[];
  tags: TagsIndex;
  templates: TemplateInfo[];
  members: { username: string; fullName?: string | null }[];
  customization: SpaceCustomization;
  databases: { id: string; title: string; rowCount: number; createdAt: string }[];
  statuses: DocStatusMap;
}

interface CacheEntry {
  data: SpaceInitData;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds

const cache = new Map<string, CacheEntry>();

export function getSpaceCache(slug: string): SpaceInitData | null {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(slug);
    return null;
  }
  return entry.data;
}

export function setSpaceCache(slug: string, data: SpaceInitData): void {
  cache.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateSpaceCache(slug: string): void {
  cache.delete(slug);
}
