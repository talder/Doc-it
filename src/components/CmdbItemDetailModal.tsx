"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Trash2, Link2, Plus, ChevronDown, ChevronRight, LogOut, LogIn, Clock, User, AlertTriangle, Briefcase } from "lucide-react";
import type { CmdbItem, CmdbContainer, CmdbItemType, CmdbRelationship, RelationshipTypeDef, CustomFieldDef, LicenseComplianceEntry, LifecycleWorkflow, Location as CmdbLocation, BusinessService, ComplianceCheckDef, VulnerabilityEntry } from "@/lib/cmdb";
import { getValidTransitions, getLifecycleStateName, getLifecycleStateColor, getLocationPath } from "@/lib/cmdb-shared";

interface ChangeEntry { id: string; date: string; category: string; description: string; risk: string; status: string }

interface Props {
  asset: CmdbItem | null;
  containers: CmdbContainer[];
  customFieldDefs: CustomFieldDef[];
  assetTypes: CmdbItemType[];
  relationships: CmdbRelationship[];
  relationshipTypes: RelationshipTypeDef[];
  assets: CmdbItem[];
  licenseCompliance?: LicenseComplianceEntry[];
  lifecycleWorkflows?: LifecycleWorkflow[];
  locations?: CmdbLocation[];
  businessServices?: BusinessService[];
  complianceCheckDefs?: ComplianceCheckDef[];
  vulnerabilities?: VulnerabilityEntry[];
  onClose: () => void;
  onEdit: (asset: CmdbItem) => void;
  onDelete: (id: string) => Promise<void>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onSelectAsset: (asset: CmdbItem) => void;
  onAddRelationship: () => void;
  onAnalyzeImpact?: (asset: CmdbItem) => void;
  onViewDiagram?: (asset: CmdbItem) => void;
}


export default function CmdbItemDetailModal({ asset, containers, customFieldDefs, assetTypes, relationships, relationshipTypes, assets, licenseCompliance, lifecycleWorkflows = [], locations = [], businessServices = [], complianceCheckDefs = [], vulnerabilities = [], onClose, onEdit, onDelete, onSave, onSelectAsset, onAddRelationship, onAnalyzeImpact, onViewDiagram }: Props) {
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutUser, setCheckoutUser] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    if (!asset) return;
    fetch(`/api/changelog?system=${encodeURIComponent(asset.name)}`)
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((d) => setChanges(d.entries || []))
      .catch(() => setChanges([]));
  }, [asset]);

  if (!asset) return null;

  const container = containers.find((c) => c.id === asset.containerId);
  const assetType = assetTypes.find((t) => t.id === asset.typeId);

  // Relationships for this asset (as source or target)
  const assetRels = relationships.filter((r) => r.sourceId === asset.id || r.targetId === asset.id);

  const handleDelete = async () => {
    if (!confirm(`Delete asset "${asset.name}" (${asset.id})?`)) return;
    await onDelete(asset.id);
    onClose();
  };

  const handleRemoveRel = async (relId: string) => {
    await onSave({ action: "removeRelationship", id: relId });
  };

  const handleCheckout = async () => {
    if (!checkoutUser.trim()) return;
    await onSave({ action: "checkOut", id: asset.id, assignedTo: checkoutUser.trim() });
    setShowCheckout(false);
    setCheckoutUser("");
  };

  const handleCheckin = async () => {
    await onSave({ action: "checkIn", id: asset.id });
  };

  const history = asset.history || [];

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal cl-modal--detail" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            {assetType && <span className="mr-1">{assetType.icon}</span>}
            <span className="cl-detail-id">{asset.id}</span>
            {asset.name}
          </h2>
          <div className="flex items-center gap-1">
            <button className="cl-modal-close" onClick={() => onEdit(asset)} title="Edit"><Pencil className="w-4 h-4" /></button>
            <button className="cl-modal-close" onClick={handleDelete} title="Delete"><Trash2 className="w-4 h-4" /></button>
            <button className="cl-modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="cl-modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          <div className="cl-confirm-grid">
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Lifecycle</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ background: getLifecycleStateColor(asset.lifecycleStateId, lifecycleWorkflows) }}>
                  {getLifecycleStateName(asset.lifecycleStateId, lifecycleWorkflows)}
                </span>
                {getValidTransitions(asset, lifecycleWorkflows).map((t) => (
                  <button
                    key={t.id}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border text-accent hover:bg-muted transition-colors"
                    onClick={() => onSave({ action: "transitionAsset", id: asset.id, transitionId: t.id })}
                    title={`Transition: ${t.label}`}
                  >
                    {t.label} →
                  </button>
                ))}
              </div>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Group</span>
              <span>{container?.name || "—"}</span>
            </div>
            {assetType && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Type</span><span>{assetType.icon} {assetType.name}</span></div>
            )}
            {asset.ipAddresses.length > 0 && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">IP</span><span>{asset.ipAddresses.join(", ")}</span></div>
            )}
            {asset.os && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">OS</span><span>{asset.os}</span></div>
            )}
            {(asset.locationId || asset.location) && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Location</span><span>{getLocationPath(asset.locationId, locations) || asset.location}</span></div>
            )}
            {asset.owner && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Owner</span><span>{asset.owner}</span></div>
            )}
            {asset.purchaseDate && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Purchased</span><span>{asset.purchaseDate}</span></div>
            )}
            {asset.warrantyExpiry && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Warranty</span><span>{asset.warrantyExpiry}</span></div>
            )}
            {asset.notes && (
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Notes</span><p>{asset.notes}</p></div>
            )}
            {asset.lastInventoryAt && (
              <div className="cl-confirm-row"><span className="cl-confirm-label">Last Inventory</span><span className="text-xs text-text-muted">{new Date(asset.lastInventoryAt).toLocaleString()}</span></div>
            )}

            {/* Per-type custom fields */}
            {assetType?.fields.map((def) => {
              const val = asset.customFields[def.id];
              if (val === undefined || val === "") return null;
              return (
                <div key={def.id} className="cl-confirm-row">
                  <span className="cl-confirm-label">{def.name}</span>
                  <span>{String(val)}</span>
                </div>
              );
            })}

            {/* Global custom fields */}
            {customFieldDefs.map((def) => {
              const val = asset.customFields[def.id];
              if (val === undefined || val === "") return null;
              const display = def.type === "boolean" ? (val ? "Yes" : "No")
                : def.type === "url" ? <a href={String(val)} target="_blank" rel="noreferrer" className="cl-link">{String(val)}</a>
                : String(val);
              return (
                <div key={def.id} className="cl-confirm-row">
                  <span className="cl-confirm-label">{def.name}</span>
                  <span>{display}</span>
                </div>
              );
            })}

            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Created</span>
              <span className="text-xs text-text-muted">{asset.createdBy} · {new Date(asset.createdAt).toLocaleString()}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Updated</span>
              <span className="text-xs text-text-muted">{asset.updatedBy} · {new Date(asset.updatedAt).toLocaleString()}</span>
            </div>
          </div>

          {/* ── Business Services ── */}
          {(() => {
            const memberOf = businessServices.filter((s) => s.memberAssetIds.includes(asset.id));
            if (memberOf.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="cl-label mb-2 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Business Services ({memberOf.length})</h4>
                <div className="space-y-1">
                  {memberOf.map((svc) => (
                    <div key={svc.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-sm">
                      <span className="text-text-primary font-medium">{svc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${
                        svc.criticality === "critical" ? "bg-red-500/10 text-red-600" :
                        svc.criticality === "high" ? "bg-orange-500/10 text-orange-600" :
                        svc.criticality === "medium" ? "bg-amber-500/10 text-amber-600" :
                        "bg-green-500/10 text-green-600"
                      }`}>{svc.criticality}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${
                        svc.status === "operational" ? "bg-green-500/10 text-green-600" :
                        svc.status === "degraded" ? "bg-amber-500/10 text-amber-600" :
                        svc.status === "outage" ? "bg-red-500/10 text-red-600" :
                        "bg-blue-500/10 text-blue-600"
                      }`}>{svc.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Compliance Checklist ── */}
          {complianceCheckDefs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="cl-label mb-2">Compliance</h4>
              <div className="space-y-1">
                {complianceCheckDefs.map((def) => {
                  const check = (asset.complianceChecks || []).find((c) => c.defId === def.id);
                  return (
                    <div key={def.id} className="flex items-center gap-2 text-xs">
                      <button
                        className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] font-bold transition-colors ${
                          check?.passed ? "bg-green-500 border-green-500 text-white" : "border-border text-text-muted hover:border-accent"
                        }`}
                        onClick={() => onSave({ action: "setComplianceCheck", assetId: asset.id, defId: def.id, passed: !check?.passed })}
                        title={def.description || def.label}
                      >
                        {check?.passed ? "✓" : ""}
                      </button>
                      <span className="text-text-primary">{def.label}</span>
                      {check && <span className="text-text-muted text-[10px] ml-auto">{check.checkedBy} · {new Date(check.checkedAt).toLocaleDateString()}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Cost Breakdown ── */}
          {asset.costInfo && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="cl-label mb-2">💰 Cost</h4>
              <div className="cl-confirm-grid">
                <div className="cl-confirm-row"><span className="cl-confirm-label">Purchase</span><span>€{asset.costInfo.purchaseCost.toLocaleString()}</span></div>
                <div className="cl-confirm-row"><span className="cl-confirm-label">Monthly</span><span>€{asset.costInfo.monthlyCost.toLocaleString()}/mo</span></div>
                {asset.costInfo.vendor && <div className="cl-confirm-row"><span className="cl-confirm-label">Vendor</span><span>{asset.costInfo.vendor}</span></div>}
                {asset.costInfo.renewalDate && <div className="cl-confirm-row"><span className="cl-confirm-label">Renewal</span><span>{asset.costInfo.renewalDate}</span></div>}
                {asset.costInfo.depreciationYears > 0 && <div className="cl-confirm-row"><span className="cl-confirm-label">Depreciation</span><span>{asset.costInfo.depreciationYears} years</span></div>}
              </div>
            </div>
          )}

          {/* ── Related Vulnerabilities ── */}
          {(() => {
            const assetVulns = vulnerabilities.filter((v) => v.affectedAssetIds.includes(asset.id));
            if (assetVulns.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="cl-label mb-2">🛡️ Vulnerabilities ({assetVulns.length})</h4>
                <div className="space-y-1">
                  {assetVulns.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 text-xs py-0.5">
                      <span className={`w-2 h-2 rounded-full ${v.severity === "critical" ? "bg-red-500" : v.severity === "high" ? "bg-orange-500" : "bg-amber-500"}`} />
                      <span className="flex-1 truncate">{v.cveId && <span className="text-text-muted mr-1">{v.cveId}</span>}{v.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.status === "open" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>{v.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Impact Analysis & Diagram ── */}
          {(onAnalyzeImpact || onViewDiagram) && (
            <div className="mt-4 pt-4 border-t border-border flex gap-2">
              {onAnalyzeImpact && (
                <button className="cl-btn cl-btn--secondary text-xs flex items-center gap-1" onClick={() => onAnalyzeImpact(asset)}>
                  <AlertTriangle className="w-3 h-3" /> Impact Analysis
                </button>
              )}
              {onViewDiagram && assetRels.length > 0 && (
                <button className="cl-btn cl-btn--secondary text-xs flex items-center gap-1" onClick={() => onViewDiagram(asset)}>
                  <Link2 className="w-3 h-3" /> View Diagram
                </button>
              )}
            </div>
          )}

          {/* ── Check-in / Check-out ── */}
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="cl-label mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Assignment</h4>
            {asset.assignedTo ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-primary">Checked out to <strong>{asset.assignedTo}</strong></span>
                <span className="text-xs text-text-muted">{asset.checkedOutAt ? new Date(asset.checkedOutAt).toLocaleString() : ""}</span>
                <button className="cl-btn cl-btn--secondary text-xs py-1 px-2 flex items-center gap-1" onClick={handleCheckin}>
                  <LogIn className="w-3 h-3" /> Check In
                </button>
              </div>
            ) : showCheckout ? (
              <div className="flex items-center gap-2">
                <input className="cl-input flex-1" placeholder="Username" value={checkoutUser} onChange={(e) => setCheckoutUser(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCheckout(); }} autoFocus />
                <button className="cl-btn cl-btn--primary text-xs py-1 px-2" onClick={handleCheckout} disabled={!checkoutUser.trim()}>Confirm</button>
                <button className="cl-btn cl-btn--secondary text-xs py-1 px-2" onClick={() => setShowCheckout(false)}>Cancel</button>
              </div>
            ) : (
              <button className="cl-btn cl-btn--secondary text-xs flex items-center gap-1" onClick={() => setShowCheckout(true)}>
                <LogOut className="w-3 h-3" /> Check Out
              </button>
            )}
          </div>

          {/* ── Relationships ── */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="cl-label flex items-center gap-1"><Link2 className="w-3 h-3" /> Relationships</h4>
              <button className="flex items-center gap-1 text-xs text-accent hover:underline" onClick={onAddRelationship}>
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {assetRels.length === 0 ? (
              <p className="text-xs text-text-muted italic">No relationships.</p>
            ) : (
              <div className="space-y-1">
                {assetRels.map((rel) => {
                  const isSource = rel.sourceId === asset.id;
                  const otherId = isSource ? rel.targetId : rel.sourceId;
                  const other = assets.find((a) => a.id === otherId);
                  const relType = relationshipTypes.find((t) => t.id === rel.typeId);
                  const label = isSource ? relType?.label : relType?.inverseLabel;
                  const otherType = assetTypes.find((t) => t.id === other?.typeId);
                  return (
                    <div key={rel.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-sm">
                      <span className="text-xs text-text-muted whitespace-nowrap">{label}</span>
                      <button className="flex items-center gap-1 text-accent hover:underline flex-1 text-left truncate" onClick={() => other && onSelectAsset(other)}>
                        {otherType?.icon || "📦"} {other?.name || otherId}
                      </button>
                      <span className="text-xs text-text-muted">{other?.id}</span>
                      <button className="p-0.5 text-text-muted hover:text-red-500" title="Remove" onClick={() => handleRemoveRel(rel.id)}><Trash2 className="w-3 h-3" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── History Timeline ── */}
          <div className="mt-4 pt-4 border-t border-border">
            <button className="cl-label flex items-center gap-1 cursor-pointer w-full text-left" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Clock className="w-3 h-3" /> History ({history.length})
            </button>
            {showHistory && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                {history.length === 0 && <p className="text-xs text-text-muted italic">No history.</p>}
                {[...history].reverse().slice(0, 100).map((h, i) => (
                  <div key={i} className="py-1.5 border-b border-border-light last:border-b-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-text-muted whitespace-nowrap">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="font-medium text-text-primary">{h.user}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        h.action === "created" ? "bg-green-500/10 text-green-600" :
                        h.action === "lifecycle-transition" ? "bg-blue-500/10 text-blue-600" :
                        h.action === "status-changed" ? "bg-amber-500/10 text-amber-600" :
                        "bg-muted text-text-muted"
                      }`}>{h.action}</span>
                    </div>
                    {h.changes.length > 0 && (
                      <div className="mt-0.5 pl-4 space-y-0.5">
                        {h.changes.map((c, ci) => (
                          <div key={ci} className="text-[10px] text-text-secondary">
                            <span className="text-text-muted">{c.field}:</span>{" "}
                            <span className="line-through text-red-400">{String(c.oldValue || "—").slice(0, 60)}</span>{" → "}
                            <span className="text-green-600">{String(c.newValue || "—").slice(0, 60)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Related changes */}
          {changes.length > 0 && (
            <div className="am-related-changes mt-4 pt-4 border-t border-border">
              <h4 className="cl-label" style={{ marginBottom: 6 }}>Related Changes</h4>
              {changes.slice(0, 10).map((c) => (
                <a key={c.id} href="/changelog" className="am-related-change">
                  <span className="am-rc-id">{c.id}</span>
                  <span className="am-rc-desc">{c.description.slice(0, 60)}</span>
                  <span className="am-rc-date">{c.date}</span>
                </a>
              ))}
            </div>
          )}

          {/* Software inventory (from agent) */}
          {asset.softwareInventory && asset.softwareInventory.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="cl-label mb-2">Software Inventory ({asset.softwareInventory.length})</h4>
              <div className="max-h-40 overflow-y-auto text-xs space-y-0.5">
                {asset.softwareInventory.slice(0, 200).map((s, i) => {
                  const matchedLicense = licenseCompliance?.find((lc) =>
                    lc.installedAssets.some((a) => a.id === asset.id) &&
                    (s.name.toLowerCase().includes(lc.product.toLowerCase()) || lc.product.toLowerCase().includes(s.name.toLowerCase())),
                  );
                  return (
                    <div key={i} className="flex gap-2 py-0.5 items-center">
                      <span className="text-text-primary flex-1 truncate">{s.name}</span>
                      <span className="text-text-muted">{s.version}</span>
                      {matchedLicense && (
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded-full font-medium ${
                            matchedLicense.complianceStatus === "compliant" ? "bg-green-500/15 text-green-600"
                            : matchedLicense.complianceStatus === "expired" ? "bg-red-500/15 text-red-600"
                            : matchedLicense.complianceStatus === "under-licensed" ? "bg-orange-500/15 text-orange-600"
                            : "bg-amber-500/15 text-amber-600"
                          }`}
                          title={`License: ${matchedLicense.licenseName} (${matchedLicense.allocatedCount}/${matchedLicense.totalSeats || "∞"})`}
                        >
                          {matchedLicense.complianceStatus === "compliant" ? "✓" : matchedLicense.complianceStatus === "expired" ? "Exp" : matchedLicense.complianceStatus === "under-licensed" ? "!" : "Over"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
