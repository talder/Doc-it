import { NextRequest } from "next/server";
import { getEditors, subscribe, unsubscribe } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * Multiplexed presence SSE stream.
 *
 * Accepts a comma-separated list of doc keys via the `docs` query param
 * (each key in the format "spaceSlug/category/docName") and streams
 * presence updates for all of them over a single connection.
 *
 * Events are JSON objects: { docKey: string, editors: string[] }
 */
export async function GET(request: NextRequest) {
  const docsParam = request.nextUrl.searchParams.get("docs") || "";
  const docKeys = docsParam
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (docKeys.length === 0) {
    return new Response("Missing ?docs= parameter", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (docKey: string, editors: string[]) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ docKey, editors })}\n\n`)
          );
        } catch {
          closed = true;
          cleanup();
        }
      };

      // Build one callback per doc key
      const callbacks = new Map<string, (editors: string[]) => void>();

      for (const docKey of docKeys) {
        const cb = (editors: string[]) => send(docKey, editors);
        callbacks.set(docKey, cb);
        subscribe(docKey, cb);

        // Send initial state for this doc
        send(docKey, getEditors(docKey));
      }

      // Keepalive every 20s
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
          cleanup();
        }
      }, 20_000);

      function cleanup() {
        for (const [docKey, cb] of callbacks) {
          unsubscribe(docKey, cb);
        }
        callbacks.clear();
        clearInterval(keepalive);
      }

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
