import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

/**
 * Proxy to the DNS/DHCP agents so the wizard can fetch reference data
 * (DNS zones, DHCP scopes) without exposing agent credentials to the browser.
 *
 * Only allows GET requests to a safe allowlist of paths.
 */

const ALLOWED_PATHS = new Set([
  "dns/zones",
  "dhcp/scopes",
  "api/health",
  "api/logs",
]);

/** Patterns for dynamic paths (e.g. dns/zones/{zone}/records). */
const ALLOWED_PATH_PATTERNS = [
  /^dns\/zones\/[^/]+\/records$/,
  /^dns\/zones\/[^/]+\/stats$/,
  /^dhcp\/scopes\/[^/]+\/reservations$/,
  /^dhcp\/scopes\/[^/]+\/leases$/,
  /^dhcp\/scopes\/[^/]+\/stats$/,
  /^dhcp\/scopes\/[^/]+\/options$/,
  /^dhcp\/scopes\/[^/]+\/exclusions$/,
];

function isPathAllowed(agentPath: string): boolean {
  if (ALLOWED_PATHS.has(agentPath)) return true;
  return ALLOWED_PATH_PATTERNS.some(p => p.test(agentPath));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path } = await params;
  const agentPath = path.join("/");

  if (!isPathAllowed(agentPath)) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  const cfg = await readProvisioningConfig();

  // Determine which agent to call based on the path prefix
  let endpoint = "";
  let tokenEncrypted = "";
  let ignoreSsl = false;

  if (agentPath.startsWith("dns/")) {
    endpoint = cfg.dns.endpoint;
    tokenEncrypted = cfg.dns.tokenEncrypted ?? "";
    ignoreSsl = cfg.dns.ignoreSslErrors;
  } else if (agentPath.startsWith("dhcp/")) {
    endpoint = cfg.dhcp.endpoint;
    tokenEncrypted = cfg.dhcp.tokenEncrypted ?? "";
    ignoreSsl = cfg.dhcp.ignoreSslErrors;
  } else if (agentPath.startsWith("api/")) {
    // Agent-level paths (health, logs) — try DNS agent first, then DHCP
    endpoint = cfg.dns.endpoint || cfg.dhcp.endpoint;
    tokenEncrypted = cfg.dns.tokenEncrypted ?? cfg.dhcp.tokenEncrypted ?? "";
    ignoreSsl = cfg.dns.ignoreSslErrors || cfg.dhcp.ignoreSslErrors;
  }

  if (!endpoint) {
    return NextResponse.json({ error: "Agent endpoint not configured" }, { status: 503 });
  }

  const token = tokenEncrypted ? await decryptField(tokenEncrypted) : "";
  const qs = request.nextUrl.search; // preserve ?lines=200&level=ERROR etc.
  const url = `${endpoint.replace(/\/$/, "")}/${agentPath}${qs}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    if (ignoreSsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (ignoreSsl) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `Agent returned ${res.status}: ${txt.slice(0, 200)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 502 },
    );
  }
}
