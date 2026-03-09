import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/audit";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await verifyAuditChain();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Audit verify-integrity error:", error);
    return NextResponse.json(
      { error: "Failed to verify audit chain integrity" },
      { status: 500 }
    );
  }
}
