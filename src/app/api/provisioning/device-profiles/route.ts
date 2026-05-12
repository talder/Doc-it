import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listDeviceProfiles, createDeviceProfile, updateDeviceProfile, deleteDeviceProfile,
} from "@/lib/provisioning";

/** GET /api/provisioning/device-profiles — list all profiles. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profiles: listDeviceProfiles() });
}

/** POST /api/provisioning/device-profiles — create profile. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const profile = createDeviceProfile({
    name: String(body.name ?? "").trim(),
    icon: String(body.icon ?? "📦"),
    netboxRoleId: body.netboxRoleId ?? null,
    defaultVlanId: body.defaultVlanId ?? null,
    defaultPrefixId: body.defaultPrefixId ?? null,
    defaultDnsZone: String(body.defaultDnsZone ?? ""),
    defaultDhcpScope: String(body.defaultDhcpScope ?? ""),
    manufacturerFilter: Array.isArray(body.manufacturerFilter) ? body.manufacturerFilter : [],
    requiresAssetTag: !!body.requiresAssetTag,
    autoCreateCmdb: !!body.autoCreateCmdb,
    sortOrder: Number(body.sortOrder ?? 0),
  });
  return NextResponse.json({ profile });
}

/** PUT /api/provisioning/device-profiles — update profile. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const profile = updateDeviceProfile(body.id, body);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile });
}

/** DELETE /api/provisioning/device-profiles — delete profile. Admin only. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteDeviceProfile(id);
  return NextResponse.json({ ok: true });
}
