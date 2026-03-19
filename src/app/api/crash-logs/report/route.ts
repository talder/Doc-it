import { NextRequest, NextResponse } from "next/server";
import { writeCrashEntry } from "@/lib/crash-log";

// ── Simple in-memory IP rate limiter (20 reports per minute) ───────────────

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT;
}

// Periodically prune stale buckets (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(ip);
  }
}, 5 * 60_000);

// ── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "Unknown client error";
    const stack = typeof body.stack === "string" ? body.stack.slice(0, 8000) : undefined;
    const url = typeof body.url === "string" ? body.url.slice(0, 500) : undefined;

    writeCrashEntry({
      source: "client",
      level: "error",
      message,
      stack,
      url,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
