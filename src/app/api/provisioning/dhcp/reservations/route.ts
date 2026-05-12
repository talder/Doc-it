import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { scope, ipAddress, macAddress, hostName, description } = body;
  if (!scope || !ipAddress || !macAddress) {
    return NextResponse.json({ error: "scope, ipAddress, and macAddress are required" }, { status: 400 });
  }

  const cfg = await readProvisioningConfig();
  if (!cfg.dhcp.endpoint) return NextResponse.json({ error: "DHCP agent not configured" }, { status: 503 });

  const token = cfg.dhcp.tokenEncrypted ? await decryptField(cfg.dhcp.tokenEncrypted) : "";
  try {
    const res = await fetch(`${cfg.dhcp.endpoint.replace(/\/$/, "")}/dhcp/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ scope, ipAddress, macAddress, hostName, description }),
    });
    const data = await res.json().catch(() => ({}));
    writeInfraAudit({
      user: user.username, tab: "dhcp", action: "create-reservation",
      target: ipAddress, status: res.ok ? "success" : "failure",
      details: { scope, macAddress, ...data },
      auditEvent: "provisioning.dhcp.create",
    });
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent unreachable" }, { status: 502 });
  }
}
