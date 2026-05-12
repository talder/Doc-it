import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

/**
 * POST /api/provisioning/dns/flush-cache
 * Flushes DNS server cache (local + configured remote forwarders) via the agent.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await readProvisioningConfig();
  if (!cfg.dns.endpoint) {
    return NextResponse.json({ error: "DNS agent not configured" }, { status: 503 });
  }

  const token = cfg.dns.tokenEncrypted ? await decryptField(cfg.dns.tokenEncrypted) : "";
  const url = `${cfg.dns.endpoint.replace(/\/$/, "")}/dns/flush-cache`;
  const flushTargets = cfg.dnsFlushTargets ?? [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    if (cfg.dns.ignoreSslErrors) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ targets: flushTargets }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (cfg.dns.ignoreSslErrors) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      writeInfraAudit({
        user: user.username, tab: "dns", action: "flush-cache",
        target: "dns-cache", status: "failure",
        details: { error: data.error || `Agent returned ${res.status}` },
        auditEvent: "provisioning.dns.flush",
      });
      return NextResponse.json({ error: data.error || `Agent returned ${res.status}` }, { status: res.status });
    }

    // Determine overall success from per-host results
    const results = data.results ?? [];
    const allOk = results.length > 0 && results.every((r: { success: boolean }) => r.success);
    const hosts = results.map((r: { host: string }) => r.host).join(", ");

    writeInfraAudit({
      user: user.username, tab: "dns", action: "flush-cache",
      target: hosts || "dns-cache", status: allOk ? "success" : "failure",
      details: { results },
      auditEvent: "provisioning.dns.flush",
    });

    return NextResponse.json(data);
  } catch (err) {
    writeInfraAudit({
      user: user.username, tab: "dns", action: "flush-cache",
      target: "dns-cache", status: "failure",
      details: { error: err instanceof Error ? err.message : "Agent unreachable" },
      auditEvent: "provisioning.dns.flush",
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 502 },
    );
  }
}
