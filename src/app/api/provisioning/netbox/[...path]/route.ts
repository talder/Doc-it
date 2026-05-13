import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { netboxFetch, clearNetboxCache } from "@/lib/provisioning";

/**
 * GET /api/provisioning/netbox/{...path} — proxy read-only Netbox API requests.
 * Caches reference data (manufacturers, device-types, sites, vlans, prefixes, device-roles).
 * Passes through query params.
 */

const ALLOWED_PREFIXES = [
  "/dcim/manufacturers/",
  "/dcim/device-types/",
  "/dcim/device-roles/",
  "/dcim/sites/",
  "/ipam/vlans/",
  "/ipam/prefixes/",
  "/dcim/devices/",
  "/dcim/interfaces/",
  "/ipam/ip-addresses/",
  "/virtualization/clusters/",
];

// Paths that accept POST (create) requests
const POST_ALLOWED_PREFIXES = [
  "/dcim/device-types/",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: segments } = await params;
  // Ensure trailing slash — Netbox API requires it and ALLOWED_PREFIXES expect it
  let apiPath = "/" + segments.join("/");
  if (!apiPath.endsWith("/")) apiPath += "/";

  // Security: only allow known Netbox API paths
  if (!ALLOWED_PREFIXES.some(p => apiPath.startsWith(p))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  // Forward query params
  const url = new URL(request.url);
  const qs = url.search; // includes leading ?

  // Cache reference data (not device/IP lookups)
  const isRefData = ["/manufacturers/", "/device-types/", "/device-roles/", "/sites/", "/vlans/", "/prefixes/"].some(p => apiPath.includes(p))
    && !apiPath.includes("available-ips");

  try {
    const data = await netboxFetch(`${apiPath}${qs}`, {}, isRefData);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Netbox request failed" },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: segments } = await params;
  let apiPath = "/" + segments.join("/");
  if (!apiPath.endsWith("/")) apiPath += "/";

  if (!POST_ALLOWED_PREFIXES.some(p => apiPath.startsWith(p))) {
    return NextResponse.json({ error: "POST not allowed for this path" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = await netboxFetch(apiPath, { method: "POST", body: JSON.stringify(body) });
    // Invalidate cached GET responses for the same resource type
    clearNetboxCache(apiPath);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Netbox request failed" },
      { status: 502 },
    );
  }
}
