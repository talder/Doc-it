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
  if (pending) return; // already in progress
  pending = true;
  deadline = new Date(Date.now() + SHUTDOWN_COUNTDOWN_SECONDS * 1000).toISOString();
  for (const fn of listeners) {
    try { fn(deadline); } catch { /* ignore */ }
  }

  // Schedule session invalidation after countdown
  setTimeout(async () => {
    try {
      const { invalidateAllSessions } = await import("./auth");
      const count = await invalidateAllSessions();
      console.log(`[shutdown] Invalidated ${count} session(s) after countdown.`);
    } catch (err) {
      console.error("[shutdown] Failed to invalidate sessions:", err);
    }
  }, SHUTDOWN_COUNTDOWN_SECONDS * 1000);
}

export function subscribeShutdown(fn: Listener): void {
  listeners.add(fn);
}

export function unsubscribeShutdown(fn: Listener): void {
  listeners.delete(fn);
}
