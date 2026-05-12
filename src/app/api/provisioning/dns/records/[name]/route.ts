import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const zone = request.nextUrl.searchParams.get("zone") ?? "";
  const type = request.nextUrl.searchParams.get("type") ?? "A";

  if (!name || !zone) {
    return NextResponse.json({ error: "name and zone are required" }, { status: 400 });
  }

  // Block SOA/NS deletions
  if (type === "SOA" || type === "NS") {
    return NextResponse.json({ error: "Cannot delete SOA or NS records" }, { status: 403 });
  }

  const cfg = await readProvisioningConfig();

  if (cfg.allowedDnsZones.length > 0 && !cfg.allowedDnsZones.includes(zone)) {
    writeInfraAudit({
      user: user.username, tab: "dns", action: "delete-record-denied",
      target: `${name}.${zone}`, status: "failure",
      details: { type, zone, reason: "Zone not in allowlist" },
      auditEvent: "provisioning.dns.delete",
    });
    return NextResponse.json({ error: `Zone '${zone}' is not in the allowed DNS zones list` }, { status: 403 });
  }

  if (!cfg.dns.endpoint) {
    return NextResponse.json({ error: "DNS agent not configured" }, { status: 503 });
  }

  const token = cfg.dns.tokenEncrypted ? await decryptField(cfg.dns.tokenEncrypted) : "";

  try {
    const res = await fetch(
      `${cfg.dns.endpoint.replace(/\/$/, "")}/dns/records/${encodeURIComponent(name)}?zone=${encodeURIComponent(zone)}&type=${encodeURIComponent(type)}`,
      {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      },
    );

    const data = await res.json().catch(() => ({}));
    const status = res.ok ? "success" : "failure";
    writeInfraAudit({
      user: user.username, tab: "dns", action: "delete-record",
      target: `${name}.${zone}`, status,
      details: { type, ...data },
      auditEvent: "provisioning.dns.delete",
    });

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent unreachable" }, { status: 502 });
  }
}
