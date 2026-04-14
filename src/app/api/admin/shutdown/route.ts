import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isShutdownPending, notifyShutdown, SHUTDOWN_COUNTDOWN_SECONDS } from "@/lib/shutdown";

/**
 * POST /api/admin/shutdown
 *
 * Triggers a graceful shutdown countdown:
 * 1. Pushes a warning to ALL connected clients via SSE with a 60s countdown
 * 2. Clients auto-save their work and show a countdown banner
 * 3. After the countdown, sessions are invalidated and clients redirect to /login
 *
 * Call this from the installer/updater BEFORE stopping the service:
 *   curl -X POST http://localhost:3000/api/admin/shutdown -H "Cookie: docit-session=..."
 *   # or with a service API key:
 *   curl -X POST http://localhost:3000/api/admin/shutdown -H "Authorization: Bearer dk_s_..."
 *
 * Then wait SHUTDOWN_COUNTDOWN_SECONDS + 10 before killing the process.
 */
export async function POST(request: NextRequest) {
  // Require admin
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    // Also allow service keys — check bearer token
    try {
      const { getBearerToken, resolveServiceApiKey } = await import("@/lib/api-keys");
      const token = await getBearerToken();
      if (!token?.startsWith("dk_s_")) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const svcUser = await resolveServiceApiKey(token);
      if (!svcUser) {
        return NextResponse.json({ error: "Invalid service key" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }

  if (isShutdownPending()) {
    return NextResponse.json({ status: "already_pending", message: "Shutdown countdown already in progress" });
  }

  notifyShutdown();

  return NextResponse.json({
    status: "ok",
    message: `Shutdown countdown started. All clients notified. Sessions will be invalidated in ${SHUTDOWN_COUNTDOWN_SECONDS} seconds.`,
    countdownSeconds: SHUTDOWN_COUNTDOWN_SECONDS,
  });
}
