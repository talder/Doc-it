import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditConfig } from "@/lib/audit";

/**
 * POST /api/victorialogs/query
 * Body: { query: string, start: string, end: string, limit: number }
 * Proxies a LogsQL query to VictoriaLogs and returns parsed NDJSON as a JSON array.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await getAuditConfig();
  const host = cfg.syslog?.host?.trim();
  if (!host) {
    return NextResponse.json(
      { error: "VictoriaLogs not configured. Set a syslog host in Admin → Audit → Settings." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const {
    query = "*",
    start = "now-1h",
    end = "now",
    limit = 500,
  } = body as { query?: string; start?: string; end?: string; limit?: number };

  const params = new URLSearchParams({
    query: String(query) || "*",
    start: String(start),
    end: String(end),
    limit: String(Math.min(Number(limit) || 500, 10_000)),
  });

  const url = `http://${host}:9428/select/logsql/query?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text.trim() || `VictoriaLogs returned HTTP ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const text = await res.text();
    const entries = text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); }
        catch { return { _msg: line, _time: "", _stream: "" }; }
      });

    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect to VictoriaLogs";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
