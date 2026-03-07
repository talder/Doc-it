import type { TagInfo, TagsIndex } from "./types";

// --- Normalization ---

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/^#/, "");
}

export function getParentTag(tag: string): string | null {
  const lastSlash = tag.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return tag.substring(0, lastSlash);
}

export function getDisplayName(tag: string): string {
  const lastSlash = tag.lastIndexOf("/");
  if (lastSlash === -1) return tag;
  return tag.substring(lastSlash + 1);
}

// --- Extraction from markdown content ---

export function extractHashtags(content: string): string[] {
  const tags = new Set<string>();

  // 1. Extract tags from data-tag attributes (TagLink nodes)
  const dataTagRegex = /data-tag="([^"]+)"/g;
  let match;
  while ((match = dataTagRegex.exec(content)) !== null) {
    const tag = normalizeTag(match[1]);
    if (tag && !tag.includes("//") && !tag.endsWith("/")) {
      tags.add(tag);
    }
  }

  // 2. Remove code blocks to avoid false positives
  const codeBlockRegex =
    /```[\s\S]*?```|`[^`]+`|<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>/gi;
  let cleaned = content.replace(codeBlockRegex, "");

  // 3. Strip all HTML tags (including attributes) to avoid matching
  //    color codes like #fbcfe8 inside style attributes
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // 4. Match #tag patterns (supports hierarchical tags like #parent/child)
  const hashtagRegex = /(?:^|[\s(])#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
  while ((match = hashtagRegex.exec(cleaned)) !== null) {
    const tag = normalizeTag(match[1]);
    if (tag && !tag.includes("//") && !tag.endsWith("/")) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

// --- Index building ---

function ensureTagEntry(index: TagsIndex, normalizedTag: string) {
  if (!index[normalizedTag]) {
    index[normalizedTag] = {
      name: normalizedTag,
      displayName: getDisplayName(normalizedTag),
      parent: getParentTag(normalizedTag),
      docNames: [],
      totalCount: 0,
    };
  }
}

function getAncestorTags(tag: string): string[] {
  const parts = tag.split("/");
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

export function buildTagsIndex(
  docs: { name: string; tags: string[] }[]
): TagsIndex {
  const index: TagsIndex = {};

  for (const doc of docs) {
    for (const tag of doc.tags) {
      const normalized = normalizeTag(tag);
      if (!normalized) continue;

      ensureTagEntry(index, normalized);
      if (!index[normalized].docNames.includes(doc.name)) {
        index[normalized].docNames.push(doc.name);
      }
    }
  }

  // Ensure ancestor entries exist for tree structure (0 direct docs)
  for (const tagName of [...Object.keys(index)]) {
    for (const ancestor of getAncestorTags(tagName)) {
      ensureTagEntry(index, ancestor);
    }
  }

  // Set totalCount = direct doc count (no ancestor aggregation)
  for (const tagName of Object.keys(index)) {
    index[tagName].totalCount = index[tagName].docNames.length;
  }

  return index;
}

// --- Tree building (client-safe) ---

export function buildTagTree(tagsIndex: TagsIndex): TagInfo[] {
  return Object.values(tagsIndex)
    .filter((t) => !t.parent)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getChildTags(
  tagsIndex: TagsIndex,
  parentTag: string
): TagInfo[] {
  return Object.values(tagsIndex)
    .filter((t) => t.parent === parentTag)
    .sort((a, b) => a.name.localeCompare(b.name));
}
