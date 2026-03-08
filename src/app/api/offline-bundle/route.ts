import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateOfflineBundle } from "@/lib/offline-bundle";
import { auditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let passphrase: string;
  try {
    const body = await request.json();
    passphrase = body?.passphrase ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!passphrase || passphrase.length < 12) {
    return NextResponse.json(
      { error: "Passphrase must be at least 12 characters" },
      { status: 400 },
    );
  }

  try {
    const { buffer, filename } = await generateOfflineBundle(user, passphrase);

    auditLog(request, {
      event: "offline.bundle.download",
      outcome: "success",
      actor: user.username,
      details: { filename },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    auditLog(request, {
      event: "offline.bundle.download",
      outcome: "failure",
      actor: user.username,
      details: { error: String(err) },
    });
    console.error("offline-bundle generation failed:", err);
    return NextResponse.json(
      { error: "Bundle generation failed" },
      { status: 500 },
    );
  }
}
