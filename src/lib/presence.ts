/**
 * In-memory document presence store.
 *
 * Tracks which users are currently editing each document and notifies
 * SSE subscribers when the editor list changes.
 *
 * docKey format: "spaceSlug/category/docName"
 */

const STALE_MS = 30_000;   // evict after 30 s without heartbeat
const CLEANUP_MS = 15_000; // run global cleanup every 15 s

interface PresenceEntry {
  username: string;
  lastSeen: number; // Date.now()
}

type PresenceCallback = (editors: string[]) => void;

// docKey -> Map<username, PresenceEntry>
const store = new Map<string, Map<string, PresenceEntry>>();

// docKey -> Set<callback>
const subscribers = new Map<string, Set<PresenceCallback>>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function docMap(docKey: string): Map<string, PresenceEntry> {
  let m = store.get(docKey);
  if (!m) {
    m = new Map();
    store.set(docKey, m);
  }
  return m;
}

function evictStale(m: Map<string, PresenceEntry>): boolean {
  const now = Date.now();
  let changed = false;
  for (const [username, entry] of m) {
    if (now - entry.lastSeen > STALE_MS) {
      m.delete(username);
      changed = true;
    }
  }
  return changed;
}

function editorList(m: Map<string, PresenceEntry>): string[] {
  return Array.from(m.values()).map((e) => e.username);
}

function notify(docKey: string) {
  const cbs = subscribers.get(docKey);
  if (!cbs || cbs.size === 0) return;
  const editors = getEditors(docKey);
  for (const cb of cbs) {
    try { cb(editors); } catch { /* ignore */ }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function join(docKey: string, username: string): string[] {
  const m = docMap(docKey);
  m.set(username, { username, lastSeen: Date.now() });
  evictStale(m);
  notify(docKey);
  return editorList(m);
}

export function leave(docKey: string, username: string): string[] {
  const m = store.get(docKey);
  if (m) {
    m.delete(username);
    evictStale(m);
    if (m.size === 0) store.delete(docKey);
  }
  notify(docKey);
  return m ? editorList(m) : [];
}

export function heartbeat(docKey: string, username: string): string[] {
  const m = docMap(docKey);
  const existing = m.get(username);
  if (existing) {
    existing.lastSeen = Date.now();
  } else {
    m.set(username, { username, lastSeen: Date.now() });
  }
  evictStale(m);
  // Heartbeats don't notify — they just keep the entry alive.
  // If eviction changed the list, notify.
  return editorList(m);
}

export function getEditors(docKey: string): string[] {
  const m = store.get(docKey);
  if (!m) return [];
  evictStale(m);
  if (m.size === 0) { store.delete(docKey); return []; }
  return editorList(m);
}

export function subscribe(docKey: string, cb: PresenceCallback) {
  let s = subscribers.get(docKey);
  if (!s) {
    s = new Set();
    subscribers.set(docKey, s);
  }
  s.add(cb);
}

export function unsubscribe(docKey: string, cb: PresenceCallback) {
  const s = subscribers.get(docKey);
  if (s) {
    s.delete(cb);
    if (s.size === 0) subscribers.delete(docKey);
  }
}

export function makeDocKey(spaceSlug: string, category: string, docName: string): string {
  return `${spaceSlug}/${category}/${docName}`;
}

// ── Global cleanup interval ──────────────────────────────────────────────────

if (typeof globalThis !== "undefined") {
  // Ensure only one interval per process (hot-reload safe)
  const key = "__presence_cleanup";
  if (!(globalThis as any)[key]) {
    (globalThis as any)[key] = setInterval(() => {
      for (const [docKey, m] of store) {
        const changed = evictStale(m);
        if (m.size === 0) store.delete(docKey);
        if (changed) notify(docKey);
      }
    }, CLEANUP_MS);
  }
}
