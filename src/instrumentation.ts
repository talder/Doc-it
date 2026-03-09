/**
 * Next.js instrumentation — runs once when the server starts.
 *
 * Node.js‑specific logic (EventEmitter tuning, backup scheduler) lives in
 * instrumentation-node.ts and is loaded via dynamic import so the Edge
 * bundler never pulls in Node-only modules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
