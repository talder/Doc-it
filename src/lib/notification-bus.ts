/**
 * In-memory pub/sub for real-time notification delivery.
 *
 * When writeNotifications() persists a new notification to disk it calls
 * broadcastNotification() so that any connected SSE client (via
 * /api/system/events) receives it immediately without polling.
 */

import type { AppNotification } from "./notifications";

type Listener = (username: string, notif: AppNotification) => void;

const listeners = new Set<Listener>();

export function broadcastNotification(username: string, notif: AppNotification): void {
  for (const fn of listeners) {
    try { fn(username, notif); } catch { /* ignore */ }
  }
}

export function subscribeNotifications(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
