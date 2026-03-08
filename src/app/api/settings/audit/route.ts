import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditConfig, saveAuditConfig, auditLog } from "@/lib/audit";
import type { AuditConfig } from "@/lib/types";

const VALID_PROTOCOLS = ["udp", "tcp"] as const;
const VALID_FACILITIES = [
  "kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news",
  "uucp", "cron", "authpriv", "ftp",
  "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7",
];

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await getAuditConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Audit config GET error:", error);
    return NextResponse.json({ error: "Failed to load audit settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const current = await getAuditConfig();

    // Validate syslog fields if provided
    const protocol = body.syslog?.protocol ?? current.syslog.protocol;
    if (!VALID_PROTOCOLS.includes(protocol)) {
      return NextResponse.json(
        { error: `Invalid protocol: must be one of ${VALID_PROTOCOLS.join(", ")}` },
        { status: 400 }
      );
    }

    const facility = body.syslog?.facility ?? current.syslog.facility;
    if (!VALID_FACILITIES.includes(facility)) {
      return NextResponse.json(
        { error: `Invalid facility: must be one of ${VALID_FACILITIES.join(", ")}` },
        { status: 400 }
      );
    }

    const port = body.syslog?.port !== undefined ? Number(body.syslog.port) : current.syslog.port;
    if (port < 1 || port > 65535 || !Number.isInteger(port)) {
      return NextResponse.json(
        { error: "Invalid port: must be an integer between 1 and 65535" },
        { status: 400 }
      );
    }

    const retentionDays =
      body.localFile?.retentionDays !== undefined
        ? Number(body.localFile.retentionDays)
        : current.localFile.retentionDays;
    if (retentionDays < 1 || !Number.isInteger(retentionDays)) {
      return NextResponse.json(
        { error: "Invalid retentionDays: must be a positive integer" },
        { status: 400 }
      );
    }

    const updated: AuditConfig = {
      enabled: body.enabled ?? current.enabled,
      localFile: {
        retentionDays,
      },
      syslog: {
        enabled: body.syslog?.enabled ?? current.syslog.enabled,
        host: body.syslog?.host ?? current.syslog.host,
        port,
        protocol,
        facility,
        appName: body.syslog?.appName ?? current.syslog.appName,
        hostname: body.syslog?.hostname ?? current.syslog.hostname,
      },
    };

    await saveAuditConfig(updated);
    auditLog(request, { event: "settings.update", outcome: "success", actor: user.username, resource: "audit", resourceType: "settings" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Audit config PUT error:", error);
    return NextResponse.json({ error: "Failed to save audit settings" }, { status: 500 });
  }
}
