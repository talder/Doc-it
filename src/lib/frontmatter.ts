import matter from "gray-matter";
import type { DocMetadata, DocClassification, CustomPropertyType } from "./types";

/**
 * Parse a .md file that may contain YAML frontmatter.
 * Returns the body (without frontmatter) and the extracted metadata.
 */
export function parseFrontmatter(raw: string): { body: string; metadata: DocMetadata } {
  try {
    const { data, content } = matter(raw);
    const metadata: DocMetadata = {};

    if (data.createdAt) metadata.createdAt = String(data.createdAt);
    if (data.createdBy) metadata.createdBy = String(data.createdBy);
    if (data.updatedAt) metadata.updatedAt = String(data.updatedAt);
    if (data.updatedBy) metadata.updatedBy = String(data.updatedBy);
    if (Array.isArray(data.tags)) {
      metadata.tags = data.tags.map((t: unknown) => String(t));
    }
    if (data.classification && ["public", "internal", "confidential", "restricted"].includes(data.classification)) {
      metadata.classification = data.classification as DocClassification;
    }
    if (data.custom && typeof data.custom === "object") {
      metadata.custom = {};
      for (const [key, val] of Object.entries(data.custom)) {
        const v = val as Record<string, unknown>;
        if (v && typeof v === "object" && "type" in v && "value" in v) {
          metadata.custom[key] = {
            type: v.type as CustomPropertyType,
            value: v.value as string | number | boolean,
          };
        }
      }
      if (Object.keys(metadata.custom).length === 0) delete metadata.custom;
    }

    return { body: content, metadata };
  } catch {
    // If parsing fails, treat entire content as body
    return { body: raw, metadata: {} };
  }
}

/**
 * Reconstruct a .md file with YAML frontmatter prepended.
 * Omits the frontmatter block entirely if metadata is empty.
 */
export function stringifyFrontmatter(body: string, metadata: DocMetadata): string {
  // Build a clean data object, omitting undefined/empty fields
  const data: Record<string, unknown> = {};
  if (metadata.createdAt) data.createdAt = metadata.createdAt;
  if (metadata.createdBy) data.createdBy = metadata.createdBy;
  if (metadata.updatedAt) data.updatedAt = metadata.updatedAt;
  if (metadata.updatedBy) data.updatedBy = metadata.updatedBy;
  if (metadata.tags && metadata.tags.length > 0) data.tags = metadata.tags;
  if (metadata.classification) data.classification = metadata.classification;
  if (metadata.custom && Object.keys(metadata.custom).length > 0) data.custom = metadata.custom;

  if (Object.keys(data).length === 0) {
    return body;
  }

  return matter.stringify(body, data);
}
