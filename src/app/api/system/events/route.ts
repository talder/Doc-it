import { isShutdownPending, subscribeShutdown, unsubscribeShutdown } from "@/lib/shutdown";
import { subscribeNotifications } from "@/lib/notification-bus";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const username = user?.username ?? null;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      // If the server is already shutting down, tell the client immediately
      if (isShutdownPending()) {
        send("shutdown", JSON.stringify({ reason: "Server is shutting down" }));
        try { controller.close(); } catch { /* ignore */ }
        return;
      }

      // Subscribe to future shutdown signals
      const onShutdown = () => {
        send("shutdown", JSON.stringify({ reason: "Server is shutting down" }));
        closed = true;
        clearInterval(keepalive);
        unsubNotifs();
        try { controller.close(); } catch { /* ignore */ }
      };
      subscribeShutdown(onShutdown);

      // Subscribe to per-user notification events
      const unsubNotifs = username
        ? subscribeNotifications((notifUsername, notif) => {
            if (notifUsername !== username) return;
            send("notification", JSON.stringify(notif));
          })
        : () => {};

      // Keepalive every 25s to prevent proxy timeouts
      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
          unsubscribeShutdown(onShutdown);
          unsubNotifs();
        }
      }, 25_000);

      // Clean up when the client disconnects
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribeShutdown(onShutdown);
        unsubNotifs();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
