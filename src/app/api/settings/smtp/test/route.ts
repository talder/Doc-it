import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { to } = await request.json();
    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "Recipient email address is required" }, { status: 400 });
    }

    const ok = await sendMail(
      to,
      "[Doc-it] Test Email",
      `<h2>Doc-it SMTP Test</h2>
       <p>This is a test email sent from your Doc-it instance.</p>
       <p>If you received this message, your SMTP settings are configured correctly.</p>
       <p><small>Sent at ${new Date().toISOString()}</small></p>`
    );

    if (ok) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Failed to send email. Check your SMTP settings and server logs." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("SMTP test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send test email" },
      { status: 500 }
    );
  }
}
