/**
 * Graceful-shutdown signalling.
 *
 * When the server receives SIGTERM, instrumentation-node.ts calls
 * notifyShutdown().  The /api/system/events SSE route subscribes here
 * and forwards the event to all connected browser clients.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function isShutdownPending(): boolean {
  return pending;
}

export function notifyShutdown(): void {
  pending = true;
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeShutdown(fn: Listener): void {
  listeners.add(fn);
}

export function unsubscribeShutdown(fn: Listener): void {
  listeners.delete(fn);
}
