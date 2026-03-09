/**
 * Asset Management module — IT asset registry.
 *
 * Global store at config/assets.json.
 * Assets are organized in user-defined containers (tree structure).
 * Supports custom field definitions of various types.
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";

// ── Types ────────────────────────────────────────────────────────────

export type AssetStatus = "Active" | "Maintenance" | "Decommissioned" | "Ordered";

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "url";

export interface AssetContainer {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[]; // for select type
}

export interface Asset {
  id: string;           // AST-0001
  name: string;         // hostname / asset name
  containerId: string;
  status: AssetStatus;
  type: string;         // free-text: "Rack Server", "Laptop", etc.
  ipAddresses: string[];
  os: string;
  location: string;
  owner: string;
  purchaseDate: string; // YYYY-MM-DD or ""
  warrantyExpiry: string;
  notes: string;
  customFields: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface AssetData {
  nextNumber: number;
  containers: AssetContainer[];
  customFieldDefs: CustomFieldDef[];
  assets: Asset[];
}

// ── Constants ────────────────────────────────────────────────────────

const ASSETS_FILE = "assets.json";

const EMPTY: AssetData = { nextNumber: 1, containers: [], customFieldDefs: [], assets: [] };

export const VALID_STATUSES: AssetStatus[] = ["Active", "Maintenance", "Decommissioned", "Ordered"];

// ── Storage ──────────────────────────────────────────────────────────

export async function readAssets(): Promise<AssetData> {
  return readJsonConfig<AssetData>(ASSETS_FILE, { ...EMPTY, containers: [], customFieldDefs: [], assets: [] });
}

async function writeAssets(data: AssetData): Promise<void> {
  await writeJsonConfig(ASSETS_FILE, data);
}

// ── Container CRUD ───────────────────────────────────────────────────

export async function addContainer(name: string, parentId: string | null): Promise<AssetContainer> {
  const data = await readAssets();
  const siblings = data.containers.filter((c) => c.parentId === parentId);
  const container: AssetContainer = {
    id: randomUUID(),
    name: name.trim(),
    parentId,
    order: siblings.length,
  };
  data.containers.push(container);
  await writeAssets(data);
  return container;
}

export async function updateContainer(id: string, updates: { name?: string; parentId?: string | null; order?: number }): Promise<AssetContainer | null> {
  const data = await readAssets();
  const idx = data.containers.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  // Prevent setting parentId to self or descendant
  if (updates.parentId !== undefined) {
    if (updates.parentId === id) return null;
    if (updates.parentId && isDescendant(data.containers, id, updates.parentId)) return null;
  }

  if (updates.name !== undefined) data.containers[idx].name = updates.name.trim();
  if (updates.parentId !== undefined) data.containers[idx].parentId = updates.parentId;
  if (updates.order !== undefined) data.containers[idx].order = updates.order;
  await writeAssets(data);
  return data.containers[idx];
}

export async function deleteContainer(id: string): Promise<{ ok: boolean; error?: string }> {
  const data = await readAssets();
  const hasChildren = data.containers.some((c) => c.parentId === id);
  if (hasChildren) return { ok: false, error: "Container has sub-groups. Remove them first." };
  const hasAssets = data.assets.some((a) => a.containerId === id);
  if (hasAssets) return { ok: false, error: "Container has assets. Move or delete them first." };
  data.containers = data.containers.filter((c) => c.id !== id);
  await writeAssets(data);
  return { ok: true };
}

function isDescendant(containers: AssetContainer[], ancestorId: string, candidateId: string): boolean {
  let current = containers.find((c) => c.id === candidateId);
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? containers.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

// ── Asset CRUD ───────────────────────────────────────────────────────

export interface CreateAssetFields {
  name: string;
  containerId: string;
  status?: AssetStatus;
  type?: string;
  ipAddresses?: string[];
  os?: string;
  location?: string;
  owner?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
  customFields?: Record<string, string | number | boolean>;
  createdBy: string;
}

export async function addAsset(fields: CreateAssetFields): Promise<Asset> {
  const data = await readAssets();
  const num = data.nextNumber || 1;
  const id = `AST-${String(num).padStart(4, "0")}`;

  const asset: Asset = {
    id,
    name: fields.name.trim(),
    containerId: fields.containerId,
    status: fields.status || "Active",
    type: fields.type?.trim() || "",
    ipAddresses: fields.ipAddresses || [],
    os: fields.os?.trim() || "",
    location: fields.location?.trim() || "",
    owner: fields.owner?.trim() || "",
    purchaseDate: fields.purchaseDate || "",
    warrantyExpiry: fields.warrantyExpiry || "",
    notes: fields.notes?.trim() || "",
    customFields: fields.customFields || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: fields.createdBy,
    updatedBy: fields.createdBy,
  };

  data.assets.push(asset);
  data.nextNumber = num + 1;
  await writeAssets(data);
  return asset;
}

export interface UpdateAssetFields {
  name?: string;
  containerId?: string;
  status?: AssetStatus;
  type?: string;
  ipAddresses?: string[];
  os?: string;
  location?: string;
  owner?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
  customFields?: Record<string, string | number | boolean>;
  updatedBy: string;
}

export async function updateAsset(id: string, fields: UpdateAssetFields): Promise<Asset | null> {
  const data = await readAssets();
  const idx = data.assets.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const a = data.assets[idx];
  if (fields.name !== undefined) a.name = fields.name.trim();
  if (fields.containerId !== undefined) a.containerId = fields.containerId;
  if (fields.status !== undefined) a.status = fields.status;
  if (fields.type !== undefined) a.type = fields.type.trim();
  if (fields.ipAddresses !== undefined) a.ipAddresses = fields.ipAddresses;
  if (fields.os !== undefined) a.os = fields.os.trim();
  if (fields.location !== undefined) a.location = fields.location.trim();
  if (fields.owner !== undefined) a.owner = fields.owner.trim();
  if (fields.purchaseDate !== undefined) a.purchaseDate = fields.purchaseDate;
  if (fields.warrantyExpiry !== undefined) a.warrantyExpiry = fields.warrantyExpiry;
  if (fields.notes !== undefined) a.notes = fields.notes.trim();
  if (fields.customFields !== undefined) a.customFields = fields.customFields;
  a.updatedAt = new Date().toISOString();
  a.updatedBy = fields.updatedBy;

  await writeAssets(data);
  return a;
}

export async function deleteAsset(id: string): Promise<boolean> {
  const data = await readAssets();
  const before = data.assets.length;
  data.assets = data.assets.filter((a) => a.id !== id);
  if (data.assets.length === before) return false;
  await writeAssets(data);
  return true;
}

// ── Custom Field Def CRUD ────────────────────────────────────────────

export async function addFieldDef(name: string, type: CustomFieldType, options?: string[]): Promise<CustomFieldDef> {
  const data = await readAssets();
  const def: CustomFieldDef = {
    id: randomUUID(),
    name: name.trim(),
    type,
    ...(type === "select" && options ? { options } : {}),
  };
  data.customFieldDefs.push(def);
  await writeAssets(data);
  return def;
}

export async function updateFieldDef(id: string, updates: { name?: string; type?: CustomFieldType; options?: string[] }): Promise<CustomFieldDef | null> {
  const data = await readAssets();
  const idx = data.customFieldDefs.findIndex((d) => d.id === id);
  if (idx === -1) return null;

  if (updates.name !== undefined) data.customFieldDefs[idx].name = updates.name.trim();
  if (updates.type !== undefined) data.customFieldDefs[idx].type = updates.type;
  if (updates.options !== undefined) data.customFieldDefs[idx].options = updates.options;
  await writeAssets(data);
  return data.customFieldDefs[idx];
}

export async function deleteFieldDef(id: string): Promise<boolean> {
  const data = await readAssets();
  const before = data.customFieldDefs.length;
  data.customFieldDefs = data.customFieldDefs.filter((d) => d.id !== id);
  if (data.customFieldDefs.length === before) return false;
  // Remove field values from all assets
  for (const asset of data.assets) {
    delete asset.customFields[id];
  }
  await writeAssets(data);
  return true;
}

// ── Search & Lookup ──────────────────────────────────────────────────

export function searchAssets(assets: Asset[], q: string): Asset[] {
  const lower = q.toLowerCase();
  return assets.filter(
    (a) =>
      a.id.toLowerCase().includes(lower) ||
      a.name.toLowerCase().includes(lower) ||
      a.type.toLowerCase().includes(lower) ||
      a.ipAddresses.some((ip) => ip.toLowerCase().includes(lower)) ||
      a.os.toLowerCase().includes(lower) ||
      a.location.toLowerCase().includes(lower) ||
      a.owner.toLowerCase().includes(lower) ||
      a.notes.toLowerCase().includes(lower) ||
      a.status.toLowerCase().includes(lower),
  );
}

export function getAssetByName(assets: Asset[], name: string): Asset | undefined {
  const lower = name.toLowerCase();
  return assets.find((a) => a.name.toLowerCase() === lower);
}

// ── Bulk Import ──────────────────────────────────────────────────────

export async function bulkCreateAssets(
  rows: CreateAssetFields[],
): Promise<{ created: number; errors: string[] }> {
  const data = await readAssets();
  const errors: string[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) {
      errors.push(`Row ${i + 1}: name is required`);
      continue;
    }
    if (!row.containerId) {
      errors.push(`Row ${i + 1}: container is required`);
      continue;
    }
    // Check container exists
    if (!data.containers.some((c) => c.id === row.containerId)) {
      errors.push(`Row ${i + 1}: invalid container`);
      continue;
    }

    const num = data.nextNumber || 1;
    const id = `AST-${String(num).padStart(4, "0")}`;

    const asset: Asset = {
      id,
      name: row.name.trim(),
      containerId: row.containerId,
      status: row.status && VALID_STATUSES.includes(row.status) ? row.status : "Active",
      type: row.type?.trim() || "",
      ipAddresses: row.ipAddresses || [],
      os: row.os?.trim() || "",
      location: row.location?.trim() || "",
      owner: row.owner?.trim() || "",
      purchaseDate: row.purchaseDate || "",
      warrantyExpiry: row.warrantyExpiry || "",
      notes: row.notes?.trim() || "",
      customFields: row.customFields || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.createdBy,
    };

    data.assets.push(asset);
    data.nextNumber = num + 1;
    created++;
  }

  await writeAssets(data);
  return { created, errors };
}
