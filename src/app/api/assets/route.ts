import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readAssets,
  searchAssets,
  addContainer,
  updateContainer,
  deleteContainer,
  addAsset,
  updateAsset,
  deleteAsset,
  addFieldDef,
  updateFieldDef,
  deleteFieldDef,
  bulkCreateAssets,
  VALID_STATUSES,
} from "@/lib/assets";
import type { AssetStatus, CustomFieldType, CreateAssetFields } from "@/lib/assets";

const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "boolean", "select", "url"];

/** GET /api/assets?q=&containerId= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const data = await readAssets();

  let assets = data.assets;
  const q = sp.get("q");
  const containerId = sp.get("containerId");

  if (q && q.length >= 2) {
    assets = searchAssets(assets, q);
  }
  if (containerId) {
    assets = assets.filter((a) => a.containerId === containerId);
  }

  return NextResponse.json({
    containers: data.containers,
    customFieldDefs: data.customFieldDefs,
    assets,
  });
}

/** POST /api/assets — action-based mutations */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  switch (action) {
    // ── Containers ──
    case "createContainer": {
      const { name, parentId } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      const container = await addContainer(name, parentId ?? null);
      return NextResponse.json({ container });
    }
    case "updateContainer": {
      const { id, name, parentId, order } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const container = await updateContainer(id, { name, parentId, order });
      if (!container) return NextResponse.json({ error: "Not found or invalid parent" }, { status: 404 });
      return NextResponse.json({ container });
    }
    case "deleteContainer": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await deleteContainer(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── Assets ──
    case "createAsset": {
      const { name, containerId, status, type, ipAddresses, os, location, owner, purchaseDate, warrantyExpiry, notes, customFields } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!containerId) return NextResponse.json({ error: "Container is required" }, { status: 400 });
      if (status && !VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
      }
      const asset = await addAsset({
        name, containerId, status, type, ipAddresses, os, location, owner,
        purchaseDate, warrantyExpiry, notes, customFields,
        createdBy: user.username,
      });
      return NextResponse.json({ asset });
    }
    case "updateAsset": {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (fields.status && !VALID_STATUSES.includes(fields.status as AssetStatus)) {
        return NextResponse.json({ error: `Invalid status` }, { status: 400 });
      }
      const asset = await updateAsset(id, { ...fields, updatedBy: user.username });
      if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      return NextResponse.json({ asset });
    }
    case "deleteAsset": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteAsset(id);
      if (!ok) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Custom Field Defs ──
    case "createFieldDef": {
      const { name, type, options } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!VALID_FIELD_TYPES.includes(type)) {
        return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_FIELD_TYPES.join(", ")}` }, { status: 400 });
      }
      const def = await addFieldDef(name, type, options);
      return NextResponse.json({ fieldDef: def });
    }
    case "updateFieldDef": {
      const { id, name, type, options } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (type && !VALID_FIELD_TYPES.includes(type)) {
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      }
      const def = await updateFieldDef(id, { name, type, options });
      if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ fieldDef: def });
    }
    case "deleteFieldDef": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteFieldDef(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Bulk import ──
    case "bulkCreateAssets": {
      const { rows } = body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "rows array is required" }, { status: 400 });
      }
      const result = await bulkCreateAssets(
        rows.map((r: Record<string, unknown>) => ({ ...r, createdBy: user.username }) as CreateAssetFields),
      );
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
