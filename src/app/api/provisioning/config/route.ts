import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig, saveProvisioningConfig, testNetboxConnection, testDnsAgentConnection, testDhcpAgentConnection } from "@/lib/provisioning";

/** GET /api/provisioning/config — returns config (tokens masked). Admin only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cfg = await readProvisioningConfig();
  return NextResponse.json({
    netbox: {
      url: cfg.netbox.url,
      tokenSet: !!cfg.netbox.tokenEncrypted,
      siteId: cfg.netbox.siteId,
      defaultRoleId: cfg.netbox.defaultRoleId,
      ignoreSslErrors: cfg.netbox.ignoreSslErrors,
    },
    dns: {
      type: cfg.dns.type,
      endpoint: cfg.dns.endpoint,
      tokenSet: !!cfg.dns.tokenEncrypted,
      defaultZone: cfg.dns.defaultZone,
      ignoreSslErrors: cfg.dns.ignoreSslErrors,
    },
    dhcp: {
      type: cfg.dhcp.type,
      endpoint: cfg.dhcp.endpoint,
      tokenSet: !!cfg.dhcp.tokenEncrypted,
      defaultScope: cfg.dhcp.defaultScope,
      ignoreSslErrors: cfg.dhcp.ignoreSslErrors,
    },
    allowedUsers: cfg.allowedUsers,
    allowedDnsZones: cfg.allowedDnsZones,
    dnsFlushTargets: cfg.dnsFlushTargets ?? [],
    dnsFlushTokenSet: !!cfg.dnsFlushTokenEncrypted,
    adManagementEnabled: cfg.adManagementEnabled,
    adManagementAdminOnly: cfg.adManagementAdminOnly,
  });
}

/** PUT /api/provisioning/config — update config. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  await saveProvisioningConfig(body);
  return NextResponse.json({ ok: true });
}

/** POST /api/provisioning/config — test connections. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const target = body.target || body.test;
  if (target === "netbox") {
    const result = await testNetboxConnection();
    return NextResponse.json(result);
  }
  if (target === "dns") {
    const result = await testDnsAgentConnection();
    return NextResponse.json(result);
  }
  if (target === "dhcp") {
    const result = await testDhcpAgentConnection();
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown test target" }, { status: 400 });
}
