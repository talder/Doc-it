import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

interface AgentLogEntry {
  timestamp: string;
  level: string;
  message: string;
  host: string;
}

interface AgentLogResponse {
  count: number;
  host: string;
  entries: Array<{ timestamp: string; level: string; message: string }>;
}

async function fetchAgentLogs(
  endpoint: string,
  tokenEncrypted: string,
  ignoreSsl: boolean,
  params: URLSearchParams,
): Promise<AgentLogResponse | null> {
  if (!endpoint) return null;
  const token = tokenEncrypted ? await decryptField(tokenEncrypted) : "";
  const url = `${endpoint.replace(/\/$/, "")}/api/logs?${params}`;
  try {
    if (ignoreSsl) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (ignoreSsl) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (!res.ok) return null;
    return await res.json() as AgentLogResponse;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await readProvisioningConfig();
  const params = new URLSearchParams();
  const lines = request.nextUrl.searchParams.get("lines") ?? "200";
  const level = request.nextUrl.searchParams.get("level");
  params.set("lines", lines);
  if (level) params.set("level", level);

  // Fetch from all configured agents in parallel
  const dnsEndpoint = cfg.dns.endpoint;
  const dhcpEndpoint = cfg.dhcp.endpoint;

  // Deduplicate if both point to the same agent
  const isSameAgent = dnsEndpoint && dhcpEndpoint && dnsEndpoint.replace(/\/$/, "") === dhcpEndpoint.replace(/\/$/, "");

  const fetches: Promise<AgentLogResponse | null>[] = [];
  if (dnsEndpoint) {
    fetches.push(fetchAgentLogs(dnsEndpoint, cfg.dns.tokenEncrypted ?? "", cfg.dns.ignoreSslErrors, params));
  }
  if (dhcpEndpoint && !isSameAgent) {
    fetches.push(fetchAgentLogs(dhcpEndpoint, cfg.dhcp.tokenEncrypted ?? "", cfg.dhcp.ignoreSslErrors, params));
  }

  const results = await Promise.all(fetches);

  // Merge entries with host prefix
  const merged: AgentLogEntry[] = [];
  for (const r of results) {
    if (!r) continue;
    const host = r.host || "unknown";
    for (const e of r.entries ?? []) {
      merged.push({ ...e, host });
    }
  }

  // Sort by timestamp ascending
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Collect unique hosts
  const hosts = [...new Set(merged.map(e => e.host))];

  return NextResponse.json({ entries: merged, hosts, count: merged.length });
}
