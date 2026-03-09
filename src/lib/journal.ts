/**
 * Journal module — types & storage helpers.
 *
 * User journals:  config/users/{username}/journal.json  (content encrypted)
 * Space journals: config/spaces/{slug}/journal.json      (plaintext)
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  date: string;            // YYYY-MM-DD
  title: string;
  content: string;         // markdown (encrypted at rest for user journals)
  tags: string[];
  mood: string;            // emoji
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: string;          // username
}

export interface JournalTemplate {
  id: string;
  name: string;
  content: string;         // markdown template body
  tags: string[];           // default tags
  scope: "user" | "space";
  createdBy: string;
}

export interface JournalData {
  entries: JournalEntry[];
  templates: JournalTemplate[];
}

const EMPTY: JournalData = { entries: [], templates: [] };

// ── Paths ────────────────────────────────────────────────────────────

function userJournalPath(username: string): string {
  return `users/${username}/journal.json`;
}

function spaceJournalPath(slug: string): string {
  return `spaces/${slug}/journal.json`;
}

// ── User journal (encrypted content) ─────────────────────────────────

export async function readUserJournal(username: string): Promise<JournalData> {
  const data = await readJsonConfig<JournalData>(userJournalPath(username), { ...EMPTY });
  // Decrypt content fields
  const entries = await Promise.all(
    (data.entries || []).map(async (e) => ({
      ...e,
      content: await decryptField(e.content),
    })),
  );
  return { entries, templates: data.templates || [] };
}

export async function writeUserJournal(username: string, data: JournalData): Promise<void> {
  // Encrypt content fields before writing
  const entries = await Promise.all(
    data.entries.map(async (e) => ({
      ...e,
      content: await encryptField(e.content),
    })),
  );
  await writeJsonConfig(userJournalPath(username), { entries, templates: data.templates });
}

// ── Space journal (plaintext) ────────────────────────────────────────

export async function readSpaceJournal(slug: string): Promise<JournalData> {
  return readJsonConfig<JournalData>(spaceJournalPath(slug), { ...EMPTY });
}

export async function writeSpaceJournal(slug: string, data: JournalData): Promise<void> {
  await writeJsonConfig(spaceJournalPath(slug), data);
}

// ── Helpers ──────────────────────────────────────────────────────────

export function createEntry(
  fields: { date: string; title?: string; content: string; tags?: string[]; mood?: string; author: string },
): JournalEntry {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    date: fields.date,
    title: fields.title || formatDateTitle(fields.date),
    content: fields.content,
    tags: fields.tags || [],
    mood: fields.mood || "",
    pinned: false,
    createdAt: now,
    updatedAt: now,
    author: fields.author,
  };
}

function formatDateTitle(date: string): string {
  try {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

export function filterEntries(
  entries: JournalEntry[],
  opts: { from?: string; to?: string; tag?: string; pinned?: boolean; search?: string },
): JournalEntry[] {
  let result = entries;
  if (opts.from) result = result.filter((e) => e.date >= opts.from!);
  if (opts.to) result = result.filter((e) => e.date <= opts.to!);
  if (opts.tag) result = result.filter((e) => e.tags.includes(opts.tag!));
  if (opts.pinned !== undefined) result = result.filter((e) => e.pinned === opts.pinned);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return result;
}
