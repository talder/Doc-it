"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Asset, AssetContainer, AssetStatus, CustomFieldDef } from "@/lib/assets";

const STATUSES: AssetStatus[] = ["Active", "Maintenance", "Decommissioned", "Ordered"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  containers: AssetContainer[];
  customFieldDefs: CustomFieldDef[];
  editAsset?: Asset | null;
  defaultContainerId?: string | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

/** Build indented options for container selector */
function containerOptions(containers: AssetContainer[]): { id: string; label: string }[] {
  const childrenOf = (pid: string | null): AssetContainer[] =>
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

export default function AssetModal({ isOpen, onClose, containers, customFieldDefs, editAsset, defaultContainerId, onSave }: Props) {
  const [name, setName] = useState("");
  const [containerId, setContainerId] = useState("");
  const [status, setStatus] = useState<AssetStatus>("Active");
  const [type, setType] = useState("");
  const [ipText, setIpText] = useState("");
  const [os, setOs] = useState("");
  const [location, setLocation] = useState("");
  const [owner, setOwner] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editAsset) {
        setName(editAsset.name);
        setContainerId(editAsset.containerId);
        setStatus(editAsset.status);
        setType(editAsset.type);
        setIpText(editAsset.ipAddresses.join(", "));
        setOs(editAsset.os);
        setLocation(editAsset.location);
        setOwner(editAsset.owner);
        setPurchaseDate(editAsset.purchaseDate);
        setWarrantyExpiry(editAsset.warrantyExpiry);
        setNotes(editAsset.notes);
        setCustomFields({ ...editAsset.customFields });
      } else {
        setName("");
        setContainerId(defaultContainerId || containers[0]?.id || "");
        setStatus("Active");
        setType("");
        setIpText("");
        setOs("");
        setLocation("");
        setOwner("");
        setPurchaseDate("");
        setWarrantyExpiry("");
        setNotes("");
        setCustomFields({});
      }
      setSaving(false);
    }
  }, [isOpen, editAsset, defaultContainerId, containers]);

  if (!isOpen) return null;

  const isValid = name.trim() && containerId;
  const options = containerOptions(containers);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    const ipAddresses = ipText.split(",").map((s) => s.trim()).filter(Boolean);
    await onSave({
      ...(editAsset ? { id: editAsset.id, action: "updateAsset" } : { action: "createAsset" }),
      name: name.trim(), containerId, status, type: type.trim(),
      ipAddresses, os: os.trim(), location: location.trim(), owner: owner.trim(),
      purchaseDate, warrantyExpiry, notes: notes.trim(), customFields,
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
          <h2 className="cl-modal-title">{editAsset ? `Edit ${editAsset.id}` : "New Asset"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <div className="cl-form-grid">
            <div className="cl-field cl-field--full">
              <label className="cl-label">Asset Name / Hostname *</label>
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
              <label className="cl-label">Status</label>
              <select className="cl-input" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="cl-field">
              <label className="cl-label">Type</label>
              <input className="cl-input" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Rack Server" />
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
              <input className="cl-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. DC1 Rack A3" />
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
              <label className="cl-label">Notes</label>
              <textarea className="cl-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes…" />
            </div>

            {/* Custom fields */}
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
              {saving ? "Saving…" : editAsset ? "Update Asset" : "Create Asset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
