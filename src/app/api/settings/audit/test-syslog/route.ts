import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { testSyslog } from "@/lib/audit";
import type { AuditSyslogConfig } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Partial<AuditSyslogConfig>;

    const cfg: AuditSyslogConfig = {
      enabled: true,
      host: body.host ?? "",
      port: body.port ?? 514,
      protocol: body.protocol ?? "udp",
      facility: body.facility ?? "local0",
      appName: body.appName ?? "doc-it",
      hostname: body.hostname ?? "",
    };

    if (!cfg.host) {
      return NextResponse.json({ ok: false, error: "Syslog host is required" }, { status: 400 });
    }

    const result = await testSyslog(cfg);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Syslog test error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
