"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CmdbItem, BusinessService, ServiceCriticality, ServiceStatus } from "@/lib/cmdb";

const CRITICALITIES: { value: ServiceCriticality; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUSES: { value: ServiceStatus; label: string }[] = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "outage", label: "Outage" },
  { value: "planned", label: "Planned" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editService?: BusinessService | null;
  assets: CmdbItem[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function BusinessServiceModal({ isOpen, onClose, editService, assets, onSave }: Props) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [criticality, setCriticality] = useState<ServiceCriticality>("medium");
  const [status, setStatus] = useState<ServiceStatus>("planned");
  const [description, setDescription] = useState("");
  const [memberAssetIds, setMemberAssetIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editService) {
      setName(editService.name);
      setOwner(editService.owner);
      setCriticality(editService.criticality);
      setStatus(editService.status);
      setDescription(editService.description);
      setMemberAssetIds([...editService.memberAssetIds]);
    } else {
      setName("");
      setOwner("");
      setCriticality("medium");
      setStatus("planned");
      setDescription("");
      setMemberAssetIds([]);
    }
    setSaving(false);
  }, [isOpen, editService]);

  if (!isOpen) return null;

  const isValid = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSave({
      ...(editService ? { action: "updateService", id: editService.id } : { action: "createService" }),
      name: name.trim(),
      owner: owner.trim(),
      criticality,
      status,
      description: description.trim(),
      memberAssetIds,
    });
    setSaving(false);
    onClose();
  };

  const toggleAsset = (id: string) => {
    setMemberAssetIds((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{editService ? `Edit ${editService.id}` : "New Business Service"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <div className="cl-form-grid">
            <div className="cl-field cl-field--full">
              <label className="cl-label">Service Name *</label>
              <input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Email, ERP, Patient Portal" autoFocus />
            </div>

            <div className="cl-field">
              <label className="cl-label">Owner</label>
              <input className="cl-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Responsible person" />
            </div>

            <div className="cl-field">
              <label className="cl-label">Criticality</label>
              <select className="cl-input" value={criticality} onChange={(e) => setCriticality(e.target.value as ServiceCriticality)}>
                {CRITICALITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="cl-field">
              <label className="cl-label">Status</label>
              <select className="cl-input" value={status} onChange={(e) => setStatus(e.target.value as ServiceStatus)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">Description</label>
              <textarea className="cl-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this service provide…" />
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">Member Assets ({memberAssetIds.length})</label>
              <div className="max-h-40 overflow-y-auto border border-border rounded p-1 space-y-0.5">
                {assets.length === 0 ? (
                  <p className="text-xs text-text-muted italic p-1">No assets available.</p>
                ) : (
                  assets.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-muted rounded cursor-pointer text-xs">
                      <input type="checkbox" checked={memberAssetIds.includes(a.id)} onChange={() => toggleAsset(a.id)} />
                      <span className="text-text-primary">{a.name}</span>
                      <span className="text-text-muted ml-auto">{a.id}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!isValid || saving} onClick={handleSubmit}>
              {saving ? "Saving…" : editService ? "Update Service" : "Create Service"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
