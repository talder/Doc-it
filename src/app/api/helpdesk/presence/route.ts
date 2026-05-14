import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * In-memory presence map: ticketId -> Set of { username, connectedAt }
 * This is per-process; sufficient for single-instance deployments.
 */
interface PresenceEntry {
  username: string;
  connectedAt: string;
}

const ticketPresence = new Map<string, Map<string, PresenceEntry>>();
const sseClients = new Map<string, Set<(data: string) => void>>();

function broadcastPresence(ticketId: string) {
  const viewers = ticketPresence.get(ticketId);
  const list = viewers ? Array.from(viewers.values()) : [];
  const payload = JSON.stringify({ ticketId, viewers: list });
  const clients = sseClients.get(ticketId);
  if (clients) {
    for (const send of clients) {
      try { send(payload); } catch { /* client disconnected */ }
    }
  }
}

/** GET /api/helpdesk/presence?ticketId=INC-0001 — SSE stream of who's viewing a ticket */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ticketId = request.nextUrl.searchParams.get("ticketId");
  if (!ticketId) {
    return new Response("ticketId query param required", { status: 400 });
  }

  const username = user.username;

  // Register presence
  if (!ticketPresence.has(ticketId)) ticketPresence.set(ticketId, new Map());
  ticketPresence.get(ticketId)!.set(username, { username, connectedAt: new Date().toISOString() });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Register SSE client
      if (!sseClients.has(ticketId)) sseClients.set(ticketId, new Set());
      sseClients.get(ticketId)!.add(send);

      // Send initial presence
      broadcastPresence(ticketId);

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { clearInterval(heartbeat); }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sseClients.get(ticketId)?.delete(send);
        if (sseClients.get(ticketId)?.size === 0) sseClients.delete(ticketId);
        ticketPresence.get(ticketId)?.delete(username);
        if (ticketPresence.get(ticketId)?.size === 0) ticketPresence.delete(ticketId);
        broadcastPresence(ticketId);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
