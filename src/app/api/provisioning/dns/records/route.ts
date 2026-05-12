import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig } from "@/lib/provisioning";
import { writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

/**
 * POST /api/provisioning/dns/records — Create a DNS record via the agent.
 * Checks zone against allowedDnsZones allowlist.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, name, zone, ipAddress, target, text, priority, ttl } = body;

  if (!name || !zone || !type) {
    return NextResponse.json({ error: "name, zone, and type are required" }, { status: 400 });
  }

  const cfg = await readProvisioningConfig();

  // Check zone allowlist
  if (cfg.allowedDnsZones.length > 0 && !cfg.allowedDnsZones.includes(zone)) {
    writeInfraAudit({
      user: user.username, tab: "dns", action: "create-record-denied",
      target: `${name}.${zone}`, status: "failure",
      details: { type, zone, reason: "Zone not in allowlist" },
      auditEvent: "provisioning.dns.create",
    });
    return NextResponse.json({ error: `Zone '${zone}' is not in the allowed DNS zones list` }, { status: 403 });
  }

  if (!cfg.dns.endpoint) {
    return NextResponse.json({ error: "DNS agent not configured" }, { status: 503 });
  }

  const token = cfg.dns.tokenEncrypted ? await decryptField(cfg.dns.tokenEncrypted) : "";
  const agentBody: Record<string, unknown> = { type, name, zone, ttl: ttl || 3600 };
  if (type === "A") agentBody.ipAddress = ipAddress;
  else if (type === "CNAME") agentBody.target = target;
  else if (type === "TXT") agentBody.text = text;
  else if (type === "MX") { agentBody.target = target; agentBody.priority = priority || 10; }
  else if (type === "SRV") { agentBody.target = target; agentBody.priority = priority || 0; }
  else if (type === "PTR") agentBody.target = target;

  try {
    const res = await fetch(`${cfg.dns.endpoint.replace(/\/$/, "")}/dns/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(agentBody),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      writeInfraAudit({
        user: user.username, tab: "dns", action: "create-record",
        target: `${name}.${zone}`, status: "failure",
        details: { type, error: data.error },
        auditEvent: "provisioning.dns.create",
      });
      return NextResponse.json({ error: data.error || `Agent returned ${res.status}` }, { status: res.status });
    }

    writeInfraAudit({
      user: user.username, tab: "dns", action: "create-record",
      target: `${name}.${zone}`, status: "success",
      details: { type, ...(ipAddress ? { ipAddress } : {}), ...(target ? { target } : {}) },
      auditEvent: "provisioning.dns.create",
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent unreachable" }, { status: 502 });
  }
}
