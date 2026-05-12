import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ip: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ip } = await params;
  const body = await request.json();
  const { description, scope } = body;

  if (typeof description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const cfg = await readProvisioningConfig();
  if (!cfg.dhcp.endpoint) return NextResponse.json({ error: "DHCP agent not configured" }, { status: 503 });

  const token = cfg.dhcp.tokenEncrypted ? await decryptField(cfg.dhcp.tokenEncrypted) : "";
  try {
    const res = await fetch(`${cfg.dhcp.endpoint.replace(/\/$/, "")}/dhcp/reservations/${encodeURIComponent(ip)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ description, scope }),
    });
    const data = await res.json().catch(() => ({}));
    writeInfraAudit({
      user: user.username, tab: "dhcp", action: "update-reservation",
      target: ip, status: res.ok ? "success" : "failure",
      details: { description, scope, ...data },
      auditEvent: "provisioning.dhcp.update",
    });
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent unreachable" }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ip: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ip } = await params;
  const scope = request.nextUrl.searchParams.get("scope") ?? "";

  const cfg = await readProvisioningConfig();
  if (!cfg.dhcp.endpoint) return NextResponse.json({ error: "DHCP agent not configured" }, { status: 503 });

  const token = cfg.dhcp.tokenEncrypted ? await decryptField(cfg.dhcp.tokenEncrypted) : "";
  try {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : "";
    const res = await fetch(`${cfg.dhcp.endpoint.replace(/\/$/, "")}/dhcp/reservations/${encodeURIComponent(ip)}${qs}`, {
      method: "DELETE",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    writeInfraAudit({
      user: user.username, tab: "dhcp", action: "delete-reservation",
      target: ip, status: res.ok ? "success" : "failure",
      details: { scope, ...data },
      auditEvent: "provisioning.dhcp.delete",
    });
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent unreachable" }, { status: 502 });
  }
}
