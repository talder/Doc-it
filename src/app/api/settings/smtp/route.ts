import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import { auditLog } from "@/lib/audit";

const SMTP_FILE = "smtp.json";

const DEFAULT_SMTP = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from: "",
  adminEmail: "",
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await readJsonConfig(SMTP_FILE, DEFAULT_SMTP);
    // Don't leak the password to the frontend
    return NextResponse.json({ ...config, pass: config.pass ? "••••••••" : "" });
  } catch (error) {
    console.error("SMTP GET error:", error);
    return NextResponse.json({ error: "Failed to load SMTP settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const current = await readJsonConfig(SMTP_FILE, DEFAULT_SMTP);

    const updated = {
      host: body.host ?? current.host,
      port: Number(body.port) || current.port,
      secure: body.secure ?? current.secure,
      user: body.user ?? current.user,
      // Only update password if it's not the masked value
      pass: body.pass && body.pass !== "••••••••" ? body.pass : current.pass,
      from: body.from ?? current.from,
      adminEmail: body.adminEmail ?? current.adminEmail,
    };

    await writeJsonConfig(SMTP_FILE, updated);
    auditLog(request, { event: "settings.update", outcome: "success", actor: user.username, resource: "smtp", resourceType: "settings" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SMTP PUT error:", error);
    return NextResponse.json({ error: "Failed to save SMTP settings" }, { status: 500 });
  }
}
