/**
 * Graceful-shutdown signalling.
 *
 * When the server receives SIGTERM, instrumentation-node.ts calls
 * notifyShutdown().  The /api/system/events SSE route subscribes here
 * and forwards the event to all connected browser clients.
 */

type Listener = (deadline: string) => void;

const listeners = new Set<Listener>();
let pending = false;
let deadline = "";

/** Countdown duration in seconds before sessions are killed */
export const SHUTDOWN_COUNTDOWN_SECONDS = 60;

export function isShutdownPending(): boolean {
  return pending;
}

export function getShutdownDeadline(): string {
  return deadline;
}

export function notifyShutdown(): void {
  pending = true;
  deadline = new Date(Date.now() + SHUTDOWN_COUNTDOWN_SECONDS * 1000).toISOString();
  for (const fn of listeners) {
    try { fn(deadline); } catch { /* ignore */ }
  }
}

export function subscribeShutdown(fn: Listener): void {
  listeners.add(fn);
}

export function unsubscribeShutdown(fn: Listener): void {
  listeners.delete(fn);
}
