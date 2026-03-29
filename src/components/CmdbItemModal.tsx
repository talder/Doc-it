"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CmdbItem, CmdbContainer, CmdbItemStatus, CmdbItemType, CustomFieldDef, LifecycleWorkflow, Location as CmdbLocation } from "@/lib/cmdb";

const STATUSES: CmdbItemStatus[] = ["Active", "Maintenance", "Decommissioned", "Ordered"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  containers: CmdbContainer[];
  customFieldDefs: CustomFieldDef[];
  assetTypes: CmdbItemType[];
  lifecycleWorkflows?: LifecycleWorkflow[];
  locations?: CmdbLocation[];
  editAsset?: CmdbItem | null;
  defaultContainerId?: string | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

/** Build indented options for container selector */
function containerOptions(containers: CmdbContainer[]): { id: string; label: string }[] {
  const childrenOf = (pid: string | null): CmdbContainer[] =>
    containers.filter((c) => c.parentId === pid).sort((a, b) => a.order - b.order);
  const result: { id: string; label: string }[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const c of childrenOf(pid)) {
      result.push({ id: c.id, label: "\u00A0\u00A0".repeat(depth) + c.name });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

export default function CmdbItemModal({ isOpen, onClose, containers, customFieldDefs, assetTypes, lifecycleWorkflows = [], locations = [], editAsset, defaultContainerId, onSave }: Props) {
  const [name, setName] = useState("");
  const [containerId, setContainerId] = useState("");
  const [status, setStatus] = useState<CmdbItemStatus>("Active");
  const [workflowId, setWorkflowId] = useState("");
  const [lifecycleStateId, setLifecycleStateId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [ipText, setIpText] = useState("");
  const [os, setOs] = useState("");
  const [location, setLocation] = useState("");
  const [locationId, setLocationId] = useState("");
  const [owner, setOwner] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editAsset) {
        setName(editAsset.name);
        setContainerId(editAsset.containerId);
        setStatus(editAsset.status);
        setWorkflowId(editAsset.workflowId || lifecycleWorkflows[0]?.id || "");
        setLifecycleStateId(editAsset.lifecycleStateId || "");
        setTypeId(editAsset.typeId || "");
        setIpText(editAsset.ipAddresses.join(", "));
        setOs(editAsset.os);
        setLocation(editAsset.location);
        setLocationId(editAsset.locationId || "");
        setOwner(editAsset.owner);
        setPurchaseDate(editAsset.purchaseDate);
        setWarrantyExpiry(editAsset.warrantyExpiry);
        setNotes(editAsset.notes);
        setTagsText((editAsset.tags || []).join(", "));
        setCustomFields({ ...editAsset.customFields });
      } else {
        setName("");
        setContainerId(defaultContainerId || containers[0]?.id || "");
        setStatus("Active");
        setWorkflowId(lifecycleWorkflows[0]?.id || "");
        setLifecycleStateId(lifecycleWorkflows[0]?.initialStateId || "");
        setTypeId(assetTypes[0]?.id || "");
        setIpText("");
        setOs("");
        setLocation("");
        setLocationId("");
        setOwner("");
        setPurchaseDate("");
        setWarrantyExpiry("");
        setNotes("");
        setTagsText("");
        setCustomFields({});
      }
      setSaving(false);
    }
  }, [isOpen, editAsset, defaultContainerId, containers, assetTypes, lifecycleWorkflows]);

  if (!isOpen) return null;

  const isValid = name.trim() && containerId;
  const options = containerOptions(containers);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    const ipAddresses = ipText.split(",").map((s) => s.trim()).filter(Boolean);
    const tags = tagsText.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const selectedType = assetTypes.find((t) => t.id === typeId);
    await onSave({
      ...(editAsset ? { id: editAsset.id, action: "updateCmdbItem" } : { action: "createAsset" }),
      name: name.trim(), containerId, status, workflowId, lifecycleStateId, type: selectedType?.name || "", typeId,
      ipAddresses, os: os.trim(), location: location.trim(), locationId: locationId || undefined, owner: owner.trim(),
      purchaseDate, warrantyExpiry, notes: notes.trim(), tags, customFields,
    });
    setSaving(false);
    onClose();
  };

  const setCustom = (id: string, val: string | number | boolean) => {
    setCustomFields((prev) => ({ ...prev, [id]: val }));
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{editAsset ? `Edit ${editAsset.id}` : "New CmdbItem"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <div className="cl-form-grid">
            <div className="cl-field cl-field--full">
              <label className="cl-label">CmdbItem Name / Hostname *</label>
              <input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. vxvictorialog01" autoFocus />
            </div>

            <div className="cl-field">
              <label className="cl-label">Group *</label>
              <select className="cl-input" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
                <option value="" disabled>Select group…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>

            <div className="cl-field">
              <label className="cl-label">Lifecycle State</label>
              {(() => {
                const wf = lifecycleWorkflows.find((w) => w.id === workflowId) || lifecycleWorkflows[0];
                return (
                  <select className="cl-input" value={lifecycleStateId} onChange={(e) => setLifecycleStateId(e.target.value)}>
                    {wf?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) || STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                );
              })()}
            </div>

            <div className="cl-field">
              <label className="cl-label">Type</label>
              <select className="cl-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">— Select —</option>
                {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
            </div>

            <div className="cl-field">
              <label className="cl-label">IP Addresses (comma-separated)</label>
              <input className="cl-input" value={ipText} onChange={(e) => setIpText(e.target.value)} placeholder="192.168.1.10, 10.0.0.5" />
            </div>

            <div className="cl-field">
              <label className="cl-label">OS / Firmware</label>
              <input className="cl-input" value={os} onChange={(e) => setOs(e.target.value)} placeholder="e.g. Ubuntu 22.04" />
            </div>

            <div className="cl-field">
              <label className="cl-label">Location</label>
              {locations.length > 0 ? (
                <select className="cl-input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">— None —</option>
                  {locations.map((l) => {
                    const path: string[] = [];
                    let cur: CmdbLocation | undefined = l;
                    while (cur) { path.unshift(cur.name); cur = cur.parentId ? locations.find((p) => p.id === cur!.parentId) : undefined; }
                    return <option key={l.id} value={l.id}>{path.join(" > ")}</option>;
                  })}
                </select>
              ) : (
                <input className="cl-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. DC1 Rack A3" />
              )}
            </div>

            <div className="cl-field">
              <label className="cl-label">Owner</label>
              <input className="cl-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Responsible person" />
            </div>

            <div className="cl-field">
              <label className="cl-label">Purchase Date</label>
              <input type="date" className="cl-input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>

            <div className="cl-field">
              <label className="cl-label">Warranty Expiry</label>
              <input type="date" className="cl-input" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">Tags (comma-separated)</label>
              <input className="cl-input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. production, pci-scope, dc1" />
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">Notes</label>
              <textarea className="cl-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes…" />
            </div>

            {/* Per-type fields */}
            {(() => {
              const selectedType = assetTypes.find((t) => t.id === typeId);
              return selectedType?.fields.map((def) => (
                <div key={def.id} className="cl-field">
                  <label className="cl-label">{def.name}</label>
                  {def.type === "text" && <input className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} />}
                  {def.type === "number" && <input type="number" className="cl-input" value={(customFields[def.id] as number) ?? ""} onChange={(e) => setCustom(def.id, e.target.value ? Number(e.target.value) : "")} />}
                  {def.type === "date" && <input type="date" className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} />}
                  {def.type === "url" && <input type="url" className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} placeholder="https://…" />}
                </div>
              ));
            })()}

            {/* Global custom fields */}
            {customFieldDefs.map((def) => (
              <div key={def.id} className="cl-field">
                <label className="cl-label">{def.name}</label>
                {def.type === "text" && (
                  <input className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} />
                )}
                {def.type === "number" && (
                  <input type="number" className="cl-input" value={(customFields[def.id] as number) ?? ""} onChange={(e) => setCustom(def.id, e.target.value ? Number(e.target.value) : "")} />
                )}
                {def.type === "date" && (
                  <input type="date" className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} />
                )}
                {def.type === "boolean" && (
                  <div className="cl-radio-group">
                    <label className={`cl-radio${customFields[def.id] === true ? " cl-radio--active" : ""}`}>
                      <input type="radio" className="sr-only" checked={customFields[def.id] === true} onChange={() => setCustom(def.id, true)} /> Yes
                    </label>
                    <label className={`cl-radio${customFields[def.id] === false ? " cl-radio--active" : ""}`}>
                      <input type="radio" className="sr-only" checked={customFields[def.id] === false} onChange={() => setCustom(def.id, false)} /> No
                    </label>
                  </div>
                )}
                {def.type === "select" && (
                  <select className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)}>
                    <option value="">—</option>
                    {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {def.type === "url" && (
                  <input type="url" className="cl-input" value={(customFields[def.id] as string) || ""} onChange={(e) => setCustom(def.id, e.target.value)} placeholder="https://…" />
                )}
              </div>
            ))}
          </div>

          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!isValid || saving} onClick={handleSubmit}>
              {saving ? "Saving…" : editAsset ? "Update CmdbItem" : "Create CmdbItem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
