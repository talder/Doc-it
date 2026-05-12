import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, writeInfraAudit } from "@/lib/provisioning";
import { decryptField } from "@/lib/crypto";

/**
 * POST /api/provisioning/dns/flush-cache
 * Flushes DNS cache on each configured flush-target agent endpoint.
 * Each target runs its own agent instance and flushes locally — no WinRM.
 * The main DNS agent (on the DC) is NOT flushed — only the forwarder/caching servers.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await readProvisioningConfig();
  if (!cfg.dns.endpoint) {
    return NextResponse.json({ error: "DNS agent not configured" }, { status: 503 });
  }

  const token = cfg.dns.tokenEncrypted ? await decryptField(cfg.dns.tokenEncrypted) : "";
  const ignoreSsl = cfg.dns.ignoreSslErrors;
  const allResults: Array<{ host: string; success: boolean; detail: string }> = [];

  /** Call an agent's /api/dns/flush-cache and return its results array. */
  async function flushAgent(endpoint: string, label: string): Promise<void> {
    const url = `${endpoint.replace(/\/$/, "")}/api/dns/flush-cache`;
    try {
      const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (ignoreSsl) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (ignoreSsl) {
        if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        allResults.push({ host: label, success: false, detail: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      const data = await res.json().catch(() => ({})) as { results?: Array<{ host: string; success: boolean; detail: string }> };
      if (data.results?.length) {
        // Use the label so the UI shows the friendly name
        for (const r of data.results) {
          allResults.push({ host: label, success: r.success, detail: r.detail });
        }
      } else {
        allResults.push({ host: label, success: true, detail: "Cache cleared" });
      }
    } catch (err) {
      allResults.push({ host: label, success: false, detail: err instanceof Error ? err.message : "Agent unreachable" });
    }
  }

  // Flush each configured target agent in parallel
  const flushTargets = cfg.dnsFlushTargets ?? [];
  if (flushTargets.length === 0) {
    return NextResponse.json({ error: "No DNS flush targets configured" }, { status: 400 });
  }

  await Promise.all(
    flushTargets.map(target => {
      let label = target;
      try { label = new URL(target).hostname; } catch { /* keep raw value */ }
      return flushAgent(target, label);
    }),
  );

  const allOk = allResults.length > 0 && allResults.every(r => r.success);
  const hosts = allResults.map(r => r.host).join(", ");

  writeInfraAudit({
    user: user.username, tab: "dns", action: "flush-cache",
    target: hosts || "dns-cache", status: allOk ? "success" : "failure",
    details: { results: allResults },
    auditEvent: "provisioning.dns.flush",
  });

  return NextResponse.json({ results: allResults });
}
