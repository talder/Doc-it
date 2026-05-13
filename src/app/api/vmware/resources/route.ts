import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isVmwareAllowed, readVmwareConfig,
  listDatastores, listClusters, listResourcePools, listFolders, listNetworks,
} from "@/lib/vmware";

/** GET /api/vmware/resources?type=datastores|clusters|resource-pools|folders|networks */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted)
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });

  const type = request.nextUrl.searchParams.get("type");

  try {
    switch (type) {
      case "datastores":
        return NextResponse.json({ items: await listDatastores(config) });
      case "clusters":
        return NextResponse.json({ items: await listClusters(config) });
      case "resource-pools":
        return NextResponse.json({ items: await listResourcePools(config) });
      case "folders":
        return NextResponse.json({ items: await listFolders(config) });
      case "networks":
        return NextResponse.json({ items: await listNetworks(config) });
      default:
        return NextResponse.json({ error: "Query param 'type' required (datastores|clusters|resource-pools|folders|networks)" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
