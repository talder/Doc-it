import { NextRequest } from "next/server";
import { getEditors, subscribe, unsubscribe, makeDocKey } from "@/lib/presence";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";
  const docKey = makeDocKey(slug, category, name);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initial = getEditors(docKey);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ editors: initial })}\n\n`)
      );

      // Subscribe to changes
      const onUpdate = (editors: string[]) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ editors })}\n\n`)
          );
        } catch {
          // Stream closed
          closed = true;
          unsubscribe(docKey, onUpdate);
        }
      };

      subscribe(docKey, onUpdate);

      // Send keepalive comment every 20s to prevent proxy/browser timeout
      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
          unsubscribe(docKey, onUpdate);
        }
      }, 20_000);

      // Cleanup when the client disconnects
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe(docKey, onUpdate);
        try { controller.close(); } catch { /* already closed */ }
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
