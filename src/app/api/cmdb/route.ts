import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readCmdb,
  searchCmdbItems,
  addContainer,
  updateContainer,
  deleteContainer,
  addCmdbItem,
  updateCmdbItem,
  deleteCmdbItem,
  addFieldDef,
  updateFieldDef,
  deleteFieldDef,
  bulkCreateCmdbItems,
  addSoftwareLicense,
  addLifecycleWorkflow,
  addCmdbItemType,
  updateCmdbItemType,
  deleteCmdbItemType,
  deleteSoftwareLicense,
  getLicenseViews,
  addLocation,
  addRelationship,
  removeRelationship,
  addRelationshipType,
  updateRelationshipType,
  deleteRelationshipType,
  checkOutCmdbItem,
  checkInCmdbItem,
  deleteLifecycleWorkflow,
  deleteLocation,
  getLifecycleStateColor,
  getLifecycleStateName,
  getValidTransitions,
  reconcileLicenses,
  summarizeLicenseCompliance,
  transitionCmdbItemLifecycle,
  updateSoftwareLicense,
  updateLifecycleWorkflow,
  updateLocation,
  addBusinessService,
  updateBusinessService,
  deleteBusinessService,
  analyzeImpact,
  collectAllTags,
  getAgentStats,
  getActiveMaintenanceWindows,
  addSavedView,
  deleteSavedView,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  addMaintenanceWindow,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
  bulkUpdateCmdbItems,
  bulkDeleteCmdbItems,
  addComplianceCheckDef,
  deleteComplianceCheckDef,
  setComplianceCheck,
  getAggregateCompliance,
  getAggregateDataQuality,
  getCostSummary,
  detectDuplicates,
  getExpiryAlerts,
  DEFAULT_COMPLIANCE_CHECKS,
  addVulnerability,
  updateVulnerability,
  deleteVulnerability,
  addChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
  setServiceSla,
  addSlaBreach,
  resolveSlaBreach,
  restoreCmdbItem,
  permanentlyDeleteCmdbItem,
  bulkUpsertCmdbItems,
  generateReportHtml,
  updateReportSettings,
  VALID_CMDB_STATUSES,
  VALID_LICENSE_TYPES,
  VALID_LOCATION_TYPES,
  VALID_SERVICE_CRITICALITIES,
  VALID_SERVICE_STATUSES,
} from "@/lib/cmdb";
import type { CmdbItemStatus, CustomFieldType, CreateCmdbItemFields, LicenseType, LocationType, ServiceCriticality, ServiceStatus, SavedViewFilters, VulnSeverity, VulnStatus, CrStatus, CrRisk } from "@/lib/cmdb";
import { addScanConfig, deleteScanConfig, runNetworkScan } from "@/lib/cmdb-scanner";

const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "boolean", "select", "url"];

/** GET /api/cmdb?q=&containerId= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const data = await readCmdb();
  const licenseCompliance = reconcileLicenses(data);

  let assets = data.assets;
  const q = sp.get("q");
  const containerId = sp.get("containerId");

  if (q && q.length >= 2) {
    assets = searchCmdbItems(assets, q);
  }
  if (containerId) {
    assets = assets.filter((a) => a.containerId === containerId);
  }

  return NextResponse.json({
    containers: data.containers,
    locations: data.locations,
    customFieldDefs: data.customFieldDefs,
    assets,
    licenses: getLicenseViews(data.licenses),
    licenseCompliance,
    licenseComplianceSummary: summarizeLicenseCompliance(licenseCompliance),
    assetTypes: data.assetTypes,
    lifecycleWorkflows: data.lifecycleWorkflows,
    relationshipTypes: data.relationshipTypes,
    relationships: data.relationships,
    businessServices: data.businessServices,
    allTags: collectAllTags(data.assets),
    savedViews: data.savedViews || [],
    templates: data.templates || [],
    maintenanceWindows: data.maintenanceWindows || [],
    activeMaintenanceAssetIds: getActiveMaintenanceWindows(data).flatMap((mw) => mw.assetIds),
    agentStats: getAgentStats(data),
    scanConfigs: data.scanConfigs || [],
    scanResults: (data.scanResults || []).slice(0, 10),
    complianceCheckDefs: (data.complianceCheckDefs.length > 0 ? data.complianceCheckDefs : DEFAULT_COMPLIANCE_CHECKS),
    complianceSummary: getAggregateCompliance(data.assets, data.complianceCheckDefs.length > 0 ? data.complianceCheckDefs : DEFAULT_COMPLIANCE_CHECKS),
    vulnerabilities: data.vulnerabilities || [],
    changeRequests: data.changeRequests || [],
    serviceSlas: data.serviceSlas || [],
    costSummary: getCostSummary(data.assets),
    dataQuality: getAggregateDataQuality(data.assets),
    duplicates: detectDuplicates(data.assets),
    expiryAlerts: getExpiryAlerts(data),
    recycleBin: data.recycleBin || [],
    reportSettings: data.reportSettings,
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

    // ── Locations ──
    case "createLocation": {
      const { name, type, parentId } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!VALID_LOCATION_TYPES.includes(type as LocationType)) return NextResponse.json({ error: `Invalid location type. Must be one of: ${VALID_LOCATION_TYPES.join(", ")}` }, { status: 400 });
      const location = await addLocation(name, type as LocationType, parentId ?? null);
      return NextResponse.json({ location });
    }
    case "updateLocation": {
      const { id, name, type, parentId, order } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (type !== undefined && !VALID_LOCATION_TYPES.includes(type as LocationType)) return NextResponse.json({ error: "Invalid location type" }, { status: 400 });
      const location = await updateLocation(id, { name, type, parentId, order });
      if (!location) return NextResponse.json({ error: "Not found or invalid parent" }, { status: 404 });
      return NextResponse.json({ location });
    }
    case "deleteLocation": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await deleteLocation(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── Assets ──
    case "createAsset": {
      const { name, containerId, status, workflowId, lifecycleStateId, type, ipAddresses, os, location, locationId, owner, purchaseDate, warrantyExpiry, notes, customFields } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!containerId) return NextResponse.json({ error: "Container is required" }, { status: 400 });
      if (status && !VALID_CMDB_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_CMDB_STATUSES.join(", ")}` }, { status: 400 });
      }
      const asset = await addCmdbItem({
        name, containerId, status, workflowId, lifecycleStateId, type, ipAddresses, os, location, locationId, owner,
        purchaseDate, warrantyExpiry, notes, customFields, tags: body.tags,
        createdBy: user.username,
      });
      return NextResponse.json({ asset });
    }
    case "updateCmdbItem": {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (fields.status && !VALID_CMDB_STATUSES.includes(fields.status as CmdbItemStatus)) {
        return NextResponse.json({ error: `Invalid status` }, { status: 400 });
      }
      const asset = await updateCmdbItem(id, { ...fields, updatedBy: user.username });
      if (!asset) return NextResponse.json({ error: "CmdbItem not found" }, { status: 404 });
      return NextResponse.json({ asset });
    }
    case "transitionAsset": {
      const { id, transitionId } = body;
      if (!id || !transitionId) return NextResponse.json({ error: "id and transitionId are required" }, { status: 400 });
      const asset = await transitionCmdbItemLifecycle(id, transitionId, user.username);
      if (!asset) return NextResponse.json({ error: "CmdbItem not found or invalid transition" }, { status: 404 });
      const data = await readCmdb();
      return NextResponse.json({
        asset,
        currentStateName: getLifecycleStateName(asset.lifecycleStateId, data.lifecycleWorkflows),
        currentStateColor: getLifecycleStateColor(asset.lifecycleStateId, data.lifecycleWorkflows),
        validTransitions: getValidTransitions(asset, data.lifecycleWorkflows),
      });
    }
    case "deleteCmdbItem": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteCmdbItem(id);
      if (!ok) return NextResponse.json({ error: "CmdbItem not found" }, { status: 404 });
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
    case "bulkCreateCmdbItems": {
      const { rows } = body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "rows array is required" }, { status: 400 });
      }
      const result = await bulkCreateCmdbItems(
        rows.map((r: Record<string, unknown>) => ({ ...r, createdBy: user.username }) as CreateCmdbItemFields),
      );
      return NextResponse.json(result);
    }

    // ── Software Licenses ──
    case "createLicense": {
      const { name, vendor, product, licenseType, licenseKey, totalSeats, purchaseDate, expiryDate, cost, currency, contractRef, notes } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!product?.trim()) return NextResponse.json({ error: "Product is required" }, { status: 400 });
      if (!VALID_LICENSE_TYPES.includes(licenseType as LicenseType)) {
        return NextResponse.json({ error: `Invalid license type. Must be one of: ${VALID_LICENSE_TYPES.join(", ")}` }, { status: 400 });
      }
      const parsedSeats = Number(totalSeats ?? 0);
      const parsedCost = Number(cost ?? 0);
      if (!Number.isFinite(parsedSeats) || parsedSeats < 0) return NextResponse.json({ error: "totalSeats must be a non-negative number" }, { status: 400 });
      if (!Number.isFinite(parsedCost) || parsedCost < 0) return NextResponse.json({ error: "cost must be a non-negative number" }, { status: 400 });
      const license = await addSoftwareLicense({
        name: name.trim(),
        vendor,
        product: product.trim(),
        licenseType: licenseType as LicenseType,
        licenseKey,
        totalSeats: parsedSeats,
        purchaseDate,
        expiryDate,
        cost: parsedCost,
        currency,
        contractRef,
        notes,
        createdBy: user.username,
      });
      return NextResponse.json({ license: getLicenseViews([license])[0] });
    }
    case "updateLicense": {
      const { id, licenseType, totalSeats, cost, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (licenseType !== undefined && !VALID_LICENSE_TYPES.includes(licenseType as LicenseType)) {
        return NextResponse.json({ error: `Invalid license type. Must be one of: ${VALID_LICENSE_TYPES.join(", ")}` }, { status: 400 });
      }
      const updates: Record<string, unknown> = { ...fields, updatedBy: user.username };
      if (licenseType !== undefined) updates.licenseType = licenseType;
      if (totalSeats !== undefined) {
        const parsedSeats = Number(totalSeats);
        if (!Number.isFinite(parsedSeats) || parsedSeats < 0) return NextResponse.json({ error: "totalSeats must be a non-negative number" }, { status: 400 });
        updates.totalSeats = parsedSeats;
      }
      if (cost !== undefined) {
        const parsedCost = Number(cost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) return NextResponse.json({ error: "cost must be a non-negative number" }, { status: 400 });
        updates.cost = parsedCost;
      }
      const license = await updateSoftwareLicense(id, updates as unknown as Parameters<typeof updateSoftwareLicense>[1]);
      if (!license) return NextResponse.json({ error: "License not found" }, { status: 404 });
      return NextResponse.json({ license: getLicenseViews([license])[0] });
    }
    case "deleteLicense": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteSoftwareLicense(id);
      if (!ok) return NextResponse.json({ error: "License not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "getLicenseCompliance": {
      const data = await readCmdb();
      const licenseCompliance = reconcileLicenses(data);
      return NextResponse.json({
        licenseCompliance,
        licenseComplianceSummary: summarizeLicenseCompliance(licenseCompliance),
      });
    }

    // ── Lifecycle Workflows ──
    case "createWorkflow": {
      const { name, states, transitions, initialStateId } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!Array.isArray(states) || states.length === 0) return NextResponse.json({ error: "states array is required" }, { status: 400 });
      if (!initialStateId) return NextResponse.json({ error: "initialStateId is required" }, { status: 400 });
      const workflow = await addLifecycleWorkflow({ name: name.trim(), states, transitions: transitions || [], initialStateId, builtIn: false });
      return NextResponse.json({ workflow });
    }
    case "updateWorkflow": {
      const { id, name, states, transitions, initialStateId } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const workflow = await updateLifecycleWorkflow(id, { name, states, transitions, initialStateId });
      if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ workflow });
    }
    case "deleteWorkflow": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await deleteLifecycleWorkflow(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── CmdbItem Types ──
    case "createAssetType": {
      const { name, icon, color, fields } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      const assetType = await addCmdbItemType({ name: name.trim(), icon: icon || "📦", color: color || "#6b7280", fields: fields || [] });
      return NextResponse.json({ assetType });
    }
    case "updateCmdbItemType": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const assetType = await updateCmdbItemType(id, updates);
      if (!assetType) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ assetType });
    }
    case "deleteCmdbItemType": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await deleteCmdbItemType(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── Relationships ──
    case "addRelationship": {
      const { sourceId, targetId, typeId, label } = body;
      if (!sourceId || !targetId || !typeId) return NextResponse.json({ error: "sourceId, targetId, and typeId are required" }, { status: 400 });
      const rel = await addRelationship(sourceId, targetId, typeId, label, user.username);
      return NextResponse.json({ relationship: rel });
    }
    case "removeRelationship": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await removeRelationship(id, user.username);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Relationship Types ──
    case "createRelationshipType": {
      const { label, inverseLabel } = body;
      if (!label?.trim() || !inverseLabel?.trim()) return NextResponse.json({ error: "label and inverseLabel are required" }, { status: 400 });
      const relType = await addRelationshipType(label.trim(), inverseLabel.trim());
      return NextResponse.json({ relationshipType: relType });
    }
    case "updateRelationshipType": {
      const { id, label, inverseLabel } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const relType = await updateRelationshipType(id, { label, inverseLabel });
      if (!relType) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ relationshipType: relType });
    }
    case "deleteRelationshipType": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await deleteRelationshipType(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── Check-in / Check-out ──
    case "checkOut": {
      const { id, assignedTo } = body;
      if (!id || !assignedTo?.trim()) return NextResponse.json({ error: "id and assignedTo are required" }, { status: 400 });
      const asset = await checkOutCmdbItem(id, assignedTo.trim(), user.username);
      if (!asset) return NextResponse.json({ error: "CmdbItem not found" }, { status: 404 });
      return NextResponse.json({ asset });
    }
    case "checkIn": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const asset = await checkInCmdbItem(id, user.username);
      if (!asset) return NextResponse.json({ error: "CmdbItem not found" }, { status: 404 });
      return NextResponse.json({ asset });
    }

    // ── Business Services ──
    case "createService": {
      const { name, owner, criticality, description, status, memberAssetIds } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (criticality && !VALID_SERVICE_CRITICALITIES.includes(criticality as ServiceCriticality)) {
        return NextResponse.json({ error: `Invalid criticality` }, { status: 400 });
      }
      if (status && !VALID_SERVICE_STATUSES.includes(status as ServiceStatus)) {
        return NextResponse.json({ error: `Invalid status` }, { status: 400 });
      }
      const svc = await addBusinessService({ name, owner, criticality, description, status, memberAssetIds, createdBy: user.username });
      return NextResponse.json({ service: svc });
    }
    case "updateService": {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (fields.criticality && !VALID_SERVICE_CRITICALITIES.includes(fields.criticality as ServiceCriticality)) {
        return NextResponse.json({ error: `Invalid criticality` }, { status: 400 });
      }
      if (fields.status && !VALID_SERVICE_STATUSES.includes(fields.status as ServiceStatus)) {
        return NextResponse.json({ error: `Invalid status` }, { status: 400 });
      }
      const svc = await updateBusinessService(id, { ...fields, updatedBy: user.username });
      if (!svc) return NextResponse.json({ error: "Service not found" }, { status: 404 });
      return NextResponse.json({ service: svc });
    }
    case "deleteService": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteBusinessService(id);
      if (!ok) return NextResponse.json({ error: "Service not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Impact Analysis ──
    case "analyzeImpact": {
      const { assetId, direction, maxDepth } = body;
      if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });
      const data = await readCmdb();
      const result = analyzeImpact(assetId, data, direction || "both", maxDepth ?? 10);
      return NextResponse.json(result);
    }

    // ── Saved Views ──
    case "createView": {
      const { name, filters } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      const view = await addSavedView(name, (filters || {}) as SavedViewFilters, user.username);
      return NextResponse.json({ view });
    }
    case "deleteView": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteSavedView(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Templates ──
    case "createTemplate": {
      const { name, description, typeId, containerId, tags, fields } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      const template = await addTemplate({ name: name.trim(), description: description || "", typeId, containerId, tags: tags || [], fields: fields || {}, createdBy: user.username });
      return NextResponse.json({ template });
    }
    case "updateTemplate": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const template = await updateTemplate(id, updates);
      if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ template });
    }
    case "deleteTemplate": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteTemplate(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Maintenance Windows ──
    case "createMaintenanceWindow": {
      const { title, description, assetIds, serviceIds, startTime, endTime, recurring, recurrenceRule } = body;
      if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      if (!startTime || !endTime) return NextResponse.json({ error: "startTime and endTime are required" }, { status: 400 });
      const mw = await addMaintenanceWindow({ title: title.trim(), description: description || "", assetIds: assetIds || [], serviceIds: serviceIds || [], startTime, endTime, recurring: !!recurring, recurrenceRule, createdBy: user.username });
      return NextResponse.json({ maintenanceWindow: mw });
    }
    case "updateMaintenanceWindow": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const mw = await updateMaintenanceWindow(id, updates);
      if (!mw) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ maintenanceWindow: mw });
    }
    case "deleteMaintenanceWindow": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteMaintenanceWindow(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Bulk Operations ──
    case "bulkUpdate": {
      const { ids, updates } = body;
      if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "ids array is required" }, { status: 400 });
      const count = await bulkUpdateCmdbItems(ids, updates || {}, user.username);
      return NextResponse.json({ updated: count });
    }
    case "bulkDelete": {
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "ids array is required" }, { status: 400 });
      const deleted = await bulkDeleteCmdbItems(ids);
      return NextResponse.json({ deleted });
    }

    // ── Compliance ──
    case "createComplianceDef": {
      const { label, description } = body;
      if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
      const def = await addComplianceCheckDef(label, description);
      return NextResponse.json({ complianceDef: def });
    }
    case "deleteComplianceDef": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      await deleteComplianceCheckDef(id);
      return NextResponse.json({ ok: true });
    }
    case "setComplianceCheck": {
      const { assetId, defId, passed, notes } = body;
      if (!assetId || !defId) return NextResponse.json({ error: "assetId and defId required" }, { status: 400 });
      await setComplianceCheck(assetId, defId, !!passed, user.username, notes);
      return NextResponse.json({ ok: true });
    }

    // ── Vulnerabilities ──
    case "createVulnerability": {
      const { cveId, title, description, severity, affectedAssetIds, remediationNotes } = body;
      if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      const vuln = await addVulnerability({ cveId, title: title.trim(), description: description || "", severity: severity || "medium", status: "open" as VulnStatus, affectedAssetIds: affectedAssetIds || [], remediationNotes: remediationNotes || "", createdBy: user.username });
      return NextResponse.json({ vulnerability: vuln });
    }
    case "updateVulnerability": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const vuln = await updateVulnerability(id, updates);
      if (!vuln) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ vulnerability: vuln });
    }
    case "deleteVulnerability": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      await deleteVulnerability(id);
      return NextResponse.json({ ok: true });
    }

    // ── Change Requests ──
    case "createChangeRequest": {
      const { title, description, risk, affectedAssetIds, affectedServiceIds, rollbackPlan, scheduledStart, scheduledEnd } = body;
      if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      const cr = await addChangeRequest({ title: title.trim(), description: description || "", risk: risk || "medium", status: "draft" as CrStatus, affectedAssetIds: affectedAssetIds || [], affectedServiceIds: affectedServiceIds || [], rollbackPlan: rollbackPlan || "", scheduledStart, scheduledEnd, createdBy: user.username });
      return NextResponse.json({ changeRequest: cr });
    }
    case "updateChangeRequest": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      // Handle approval
      if (updates.status === "approved") { updates.approvedBy = user.username; updates.approvedAt = new Date().toISOString(); }
      if (updates.status === "implemented") { updates.implementedBy = user.username; updates.implementedAt = new Date().toISOString(); }
      const cr = await updateChangeRequest(id, updates);
      if (!cr) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ changeRequest: cr });
    }
    case "deleteChangeRequest": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      await deleteChangeRequest(id);
      return NextResponse.json({ ok: true });
    }

    // ── Service SLA ──
    case "setServiceSla": {
      const { serviceId, uptimeTarget, responseTimeTarget } = body;
      if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
      const sla = await setServiceSla(serviceId, uptimeTarget ?? 99.9, responseTimeTarget);
      return NextResponse.json({ sla });
    }
    case "addSlaBreach": {
      const { serviceId, duration, description } = body;
      if (!serviceId || !duration) return NextResponse.json({ error: "serviceId and duration required" }, { status: 400 });
      const breach = await addSlaBreach(serviceId, duration, description || "");
      if (!breach) return NextResponse.json({ error: "SLA not found" }, { status: 404 });
      return NextResponse.json({ breach });
    }
    case "resolveSlaBreach": {
      const { serviceId, breachId } = body;
      if (!serviceId || !breachId) return NextResponse.json({ error: "serviceId and breachId required" }, { status: 400 });
      await resolveSlaBreach(serviceId, breachId);
      return NextResponse.json({ ok: true });
    }

    // ── Network Scanning ──
    case "createScanConfig": {
      const { name, ipRange, ports, defaultContainerId } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (!ipRange?.trim()) return NextResponse.json({ error: "IP range is required" }, { status: 400 });
      const config = await addScanConfig({ name: name.trim(), ipRange: ipRange.trim(), ports: ports || [], defaultContainerId, createdBy: user.username });
      return NextResponse.json({ scanConfig: config });
    }
    case "deleteScanConfig": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteScanConfig(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "runScan": {
      const { configId } = body;
      if (!configId) return NextResponse.json({ error: "configId is required" }, { status: 400 });
      // Run scan async — don't await, return immediately
      runNetworkScan(configId).catch(() => {});
      return NextResponse.json({ ok: true, message: "Scan started" });
    }
    case "importDiscovered": {
      // Import discovered devices — skip duplicates by checking existing CIs
      const { devices, containerId } = body;
      if (!Array.isArray(devices) || devices.length === 0) return NextResponse.json({ error: "devices array is required" }, { status: 400 });
      if (!containerId) return NextResponse.json({ error: "containerId is required" }, { status: 400 });
      const currentData = await readCmdb();
      const existingIps = new Set(currentData.assets.flatMap((a) => a.ipAddresses));
      const existingNames = new Set(currentData.assets.map((a) => a.name.toLowerCase()));
      let imported = 0;
      let skipped = 0;
      for (const d of devices) {
        if (d.alreadyExists) { skipped++; continue; }
        const name = d.hostname || d.ip;
        // Skip if IP or hostname already exists as a CI
        if (existingIps.has(d.ip) || existingNames.has(name.toLowerCase())) { skipped++; continue; }
        await addCmdbItem({ name, containerId, ipAddresses: [d.ip], typeId: d.guessedTypeId, type: d.guessedType, tags: ["discovered"], createdBy: user.username });
        existingIps.add(d.ip);
        existingNames.add(name.toLowerCase());
        imported++;
      }
      return NextResponse.json({ imported, skipped });
    }

    // ── Recycle Bin ──
    case "restoreCmdbItem": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await restoreCmdbItem(id);
      if (!ok) return NextResponse.json({ error: "Not found in recycle bin" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "permanentlyDelete": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await permanentlyDeleteCmdbItem(id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ── Bulk Upsert (CSV update mode) ──
    case "bulkUpsertCmdbItems": {
      const { rows } = body;
      if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "rows required" }, { status: 400 });
      const result = await bulkUpsertCmdbItems(rows.map((r: Record<string, unknown>) => ({ ...r, createdBy: user.username }) as CreateCmdbItemFields));
      return NextResponse.json(result);
    }

    // ── Report Settings ──
    case "updateReportSettings": {
      const { enabled, schedule, recipients, dayOfWeek, dayOfMonth } = body;
      const settings = await updateReportSettings({ enabled, schedule, recipients, dayOfWeek, dayOfMonth });
      return NextResponse.json({ settings });
    }
    case "sendReport": {
      // Send report now
      const data = await readCmdb();
      const html = generateReportHtml(data);
      const recipients = data.reportSettings.recipients;
      if (recipients.length === 0) return NextResponse.json({ error: "No recipients configured" }, { status: 400 });
      // Use existing email infrastructure
      try {
        const { sendMail } = await import("@/lib/email");
        for (const email of recipients) {
          await sendMail(email, `CMDB Report — ${new Date().toISOString().slice(0, 10)}`, html);
        }
        return NextResponse.json({ ok: true, sent: recipients.length });
      } catch (err) {
        return NextResponse.json({ error: "Email sending failed" }, { status: 500 });
      }
    }

    // ── Agent API Key ──
    case "createAgentKey": {
      if (!user.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
      try {
        const { createServiceApiKey } = await import("@/lib/api-keys");
        const { record, secret } = await createServiceApiKey(
          user.username,
          `CMDB Agent (${new Date().toISOString().slice(0, 10)})`,
          { "*": "writer" },
        );
        return NextResponse.json({ key: record, secret });
      } catch {
        return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
