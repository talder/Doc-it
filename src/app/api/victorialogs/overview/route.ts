import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditConfig } from "@/lib/audit";

interface FieldValueEntry { value: string; hits: number; }

/** Try the native field-values API (works for log fields). */
async function fetchFieldValues(base: string, field: string): Promise<FieldValueEntry[]> {
  const params = new URLSearchParams({ field, query: "*", start: "now-24h", end: "now", limit: "100" });
  try {
    const res = await fetch(`${base}/select/logsql/field-values?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return text.trim().split("\n").filter(Boolean)
      .map((line) => { try { return JSON.parse(line) as FieldValueEntry; } catch { return null; } })
      .filter((v): v is FieldValueEntry => v !== null && !!v.value)
      .sort((a, b) => b.hits - a.hits);
  } catch {
    return [];
  }
}

/** Fallback: run a quick query and extract field values from results + _stream labels. */
async function fetchOverviewByQuery(base: string): Promise<{ hosts: FieldValueEntry[]; apps: FieldValueEntry[]; eventTypes: FieldValueEntry[] }> {
  const empty = { hosts: [], apps: [], eventTypes: [] };
  try {
    const params = new URLSearchParams({ query: "*", start: "now-24h", end: "now", limit: "2000" });
    const res = await fetch(`${base}/select/logsql/query?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return empty;
    const text = await res.text();
    const hostCounts = new Map<string, number>();
    const appCounts = new Map<string, number>();
    const eventCounts = new Map<string, number>();
    const fields: [string, Map<string, number>][] = [
      ["hostname", hostCounts], ["app_name", appCounts], ["msg_id", eventCounts],
    ];
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as Record<string, string | undefined>;
        for (const [field, map] of fields) {
          let val = entry[field];
          if (!val && entry._stream) {
            const m = entry._stream.match(new RegExp(`${field}="([^"]*?)"`));
            if (m) val = m[1];
          }
          if (val && val !== "-" && val !== "") map.set(val, (map.get(val) ?? 0) + 1);
        }
      } catch {}
    }
    const toList = (m: Map<string, number>): FieldValueEntry[] =>
      Array.from(m.entries()).map(([value, hits]) => ({ value, hits })).sort((a, b) => b.hits - a.hits);
    return { hosts: toList(hostCounts), apps: toList(appCounts), eventTypes: toList(eventCounts) };
  } catch { return empty; }
}

/** GET /api/victorialogs/overview — returns hosts, apps and event types with 24h hit counts. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await getAuditConfig();
  const host = cfg.syslog?.host?.trim();
  if (!host) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const base = `http://${host}:9428`;

  // Try native field-values API first (fast)
  const [hosts, apps, eventTypes] = await Promise.all([
    fetchFieldValues(base, "hostname"),
    fetchFieldValues(base, "app_name"),
    fetchFieldValues(base, "msg_id"),
  ]);

  // If native API returned nothing, fall back to query-based extraction
  // (syslog stream labels like hostname/app_name may not appear in field-values)
  if (hosts.length === 0 && apps.length === 0 && eventTypes.length === 0) {
    const fallback = await fetchOverviewByQuery(base);
    return NextResponse.json(fallback);
  }

  return NextResponse.json({ hosts, apps, eventTypes });
}
