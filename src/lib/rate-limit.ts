/**
 * In-memory sliding-window rate limiter (NIS2 compliance).
 *
 * Two presets:
 *   - "auth"    — 10 requests / 60 s per IP  (login, register, MFA endpoints)
 *   - "api"     — 60 requests / 60 s per IP  (general API)
 *
 * Usage:
 *   const blocked = checkRateLimit(request, "auth");
 *   if (blocked) return blocked;   // 429 Too Many Requests
 */

import { NextRequest, NextResponse } from "next/server";

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// Evict stale entries every 5 minutes to prevent unbounded growth
const EVICT_INTERVAL_MS = 5 * 60 * 1000;
const WINDOW_MS = 60 * 1000; // 1-minute window

let lastEvict = Date.now();

function evictStale() {
  const now = Date.now();
  if (now - lastEvict < EVICT_INTERVAL_MS) return;
  lastEvict = now;
  const cutoff = now - WINDOW_MS;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

const PRESETS: Record<string, number> = {
  auth: 10,
  api: 60,
};

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Check whether the request exceeds the rate limit for the given preset.
 * Returns a 429 NextResponse if blocked, or `null` if the request is allowed.
 */
export function checkRateLimit(
  request: NextRequest,
  preset: "auth" | "api"
): NextResponse | null {
  evictStale();

  const ip = getClientIp(request);
  const key = `${preset}:${ip}`;
  const maxRequests = PRESETS[preset] ?? 60;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + WINDOW_MS - now) / 1000
    );
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, retryAfter)),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  entry.timestamps.push(now);

  return null; // allowed
}
