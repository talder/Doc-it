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

  try {
    const body = await request.json();
    const profile = createDeviceProfile({
      name: String(body.name ?? "").trim(),
      icon: String(body.icon ?? "📦"),
      netboxRoleId: body.netboxRoleId ?? null,
      defaultVlanId: body.defaultVlanId ?? null,
      defaultPrefixId: body.defaultPrefixId ?? null,
      defaultDnsZone: String(body.defaultDnsZone ?? ""),
      defaultDhcpScope: String(body.defaultDhcpScope ?? ""),
      defaultGateway: String(body.defaultGateway ?? ""),
      defaultTags: Array.isArray(body.defaultTags) ? body.defaultTags : [],
      manufacturerFilter: Array.isArray(body.manufacturerFilter) ? body.manufacturerFilter : [],
      requiresAssetTag: !!body.requiresAssetTag,
      autoCreateCmdb: !!body.autoCreateCmdb,
      vmDeployTemplateId: body.vmDeployTemplateId ?? null,
      netboxClusterId: body.netboxClusterId ?? null,
      nacEndSystemGroup: String(body.nacEndSystemGroup ?? ""),
      checkmkEnabled: !!body.checkmkEnabled,
      checkmkFolder: String(body.checkmkFolder ?? "/"),
      sortOrder: Number(body.sortOrder ?? 0),
    });
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create profile" }, { status: 500 });
  }
}

/** PUT /api/provisioning/device-profiles — update profile. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const profile = updateDeviceProfile(body.id, body);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save profile" }, { status: 500 });
  }
}

/** DELETE /api/provisioning/device-profiles — delete profile. Admin only. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = body.id as string | undefined;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    deleteDeviceProfile(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete profile" }, { status: 500 });
  }
}
