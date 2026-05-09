import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditConfig } from "@/lib/audit";

interface FieldValueEntry { value: string; hits: number; }

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

/** GET /api/victorialogs/overview — returns hosts, apps and event types with 24h hit counts. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await getAuditConfig();
  const host = cfg.syslog?.host?.trim();
  if (!host) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const base = `http://${host}:9428`;
  const [hosts, apps, eventTypes] = await Promise.all([
    fetchFieldValues(base, "hostname"),
    fetchFieldValues(base, "app_name"),
    fetchFieldValues(base, "msg_id"),
  ]);

  return NextResponse.json({ hosts, apps, eventTypes });
}
