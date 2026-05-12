import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdGroupMembers, addAdGroupMember, removeAdGroupMember } from "@/lib/ad-management";
import { writeInfraAudit } from "@/lib/provisioning";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dn: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { dn } = await params;
  try {
    const members = await getAdGroupMembers(decodeURIComponent(dn));
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dn: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { dn } = await params;
  const body = await request.json();
  const groupDn = decodeURIComponent(dn);

  try {
    await addAdGroupMember(groupDn, body.userDn);
    writeInfraAudit({
      user: user.username, tab: "ad", action: "group-add-member",
      target: groupDn, status: "success",
      details: { memberDn: body.userDn },
      auditEvent: "provisioning.ad.group.modify",
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dn: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { dn } = await params;
  const memberDn = request.nextUrl.searchParams.get("memberDn") ?? "";
  const groupDn = decodeURIComponent(dn);

  try {
    await removeAdGroupMember(groupDn, memberDn);
    writeInfraAudit({
      user: user.username, tab: "ad", action: "group-remove-member",
      target: groupDn, status: "success",
      details: { memberDn },
      auditEvent: "provisioning.ad.group.modify",
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
