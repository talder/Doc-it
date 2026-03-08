/**
 * Next.js instrumentation — runs once when the server starts.
 *
 * Increases the default EventEmitter max-listener limit on process
 * stdout/stderr to suppress spurious MaxListenersExceeded warnings
 * caused by SSE streams in development mode.
 */
export async function register() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_RUNTIME === "nodejs"
  ) {
    process.stdout.setMaxListeners(30);
    process.stderr.setMaxListeners(30);
  }
}
