"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { LicenseType, SoftwareLicenseView } from "@/lib/cmdb";

const LICENSE_TYPES: { value: LicenseType; label: string }[] = [
  { value: "per-seat", label: "Per Seat" },
  { value: "per-device", label: "Per Device" },
  { value: "volume", label: "Volume" },
  { value: "site", label: "Site" },
  { value: "oem", label: "OEM" },
  { value: "subscription", label: "Subscription" },
  { value: "freeware", label: "Freeware" },
  { value: "open-source", label: "Open Source" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editLicense?: SoftwareLicenseView | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function LicenseModal({ isOpen, onClose, editLicense, onSave }: Props) {
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [product, setProduct] = useState("");
  const [licenseType, setLicenseType] = useState<LicenseType>("per-seat");
  const [licenseKey, setLicenseKey] = useState("");
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [totalSeats, setTotalSeats] = useState("0");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cost, setCost] = useState("0");
  const [currency, setCurrency] = useState("EUR");
  const [contractRef, setContractRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editLicense) {
      setName(editLicense.name);
      setVendor(editLicense.vendor);
      setProduct(editLicense.product);
      setLicenseType(editLicense.licenseType);
      setLicenseKey("");
      setClearStoredKey(false);
      setTotalSeats(String(editLicense.totalSeats));
      setPurchaseDate(editLicense.purchaseDate || "");
      setExpiryDate(editLicense.expiryDate || "");
      setCost(String(editLicense.cost ?? 0));
      setCurrency(editLicense.currency || "EUR");
      setContractRef(editLicense.contractRef || "");
      setNotes(editLicense.notes || "");
    } else {
      setName("");
      setVendor("");
      setProduct("");
      setLicenseType("per-seat");
      setLicenseKey("");
      setClearStoredKey(false);
      setTotalSeats("0");
      setPurchaseDate("");
      setExpiryDate("");
      setCost("0");
      setCurrency("EUR");
      setContractRef("");
      setNotes("");
    }
    setSaving(false);
  }, [isOpen, editLicense]);

  if (!isOpen) return null;

  const isValid = name.trim() && product.trim();

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      ...(editLicense ? { action: "updateLicense", id: editLicense.id } : { action: "createLicense" }),
      name: name.trim(),
      vendor: vendor.trim(),
      product: product.trim(),
      licenseType,
      totalSeats: Number(totalSeats || "0"),
      purchaseDate,
      expiryDate,
      cost: Number(cost || "0"),
      currency: currency.trim() || "EUR",
      contractRef: contractRef.trim(),
      notes: notes.trim(),
    };

    if (licenseKey.trim()) payload.licenseKey = licenseKey.trim();
    else if (editLicense && clearStoredKey) payload.licenseKey = "";

    await onSave(payload);
    setSaving(false);
    onClose();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{editLicense ? `Edit ${editLicense.id}` : "New License"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <div className="cl-form-grid">
            <div className="cl-field cl-field--full">
              <label className="cl-label">License Name *</label>
              <input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Microsoft 365 E3" autoFocus />
            </div>

            <div className="cl-field">
              <label className="cl-label">Vendor</label>
              <input className="cl-input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Microsoft" />
            </div>

            <div className="cl-field">
              <label className="cl-label">Matched Product *</label>
              <input className="cl-input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Matches inventory software name" />
            </div>

            <div className="cl-field">
              <label className="cl-label">License Type</label>
              <select className="cl-input" value={licenseType} onChange={(e) => setLicenseType(e.target.value as LicenseType)}>
                {LICENSE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="cl-field">
              <label className="cl-label">Seats</label>
              <input type="number" min="0" className="cl-input" value={totalSeats} onChange={(e) => setTotalSeats(e.target.value)} placeholder="0 = unlimited" />
            </div>

            <div className="cl-field">
              <label className="cl-label">Purchase Date</label>
              <input type="date" className="cl-input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>

            <div className="cl-field">
              <label className="cl-label">Expiry Date</label>
              <input type="date" className="cl-input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>

            <div className="cl-field">
              <label className="cl-label">Cost</label>
              <input type="number" min="0" step="0.01" className="cl-input" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>

            <div className="cl-field">
              <label className="cl-label">Currency</label>
              <input className="cl-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="EUR" maxLength={6} />
            </div>

            <div className="cl-field">
              <label className="cl-label">Contract Ref</label>
              <input className="cl-input" value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="Optional" />
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">{editLicense?.hasLicenseKey ? "Replace License Key" : "License Key"}</label>
              <input
                className="cl-input"
                value={licenseKey}
                onChange={(e) => { setLicenseKey(e.target.value); if (e.target.value) setClearStoredKey(false); }}
                placeholder={editLicense?.hasLicenseKey ? "Leave blank to keep current key" : "Optional"}
              />
              {editLicense?.hasLicenseKey && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-text-muted">A license key is already stored securely for this record.</p>
                  <label className="text-xs text-text-muted inline-flex items-center gap-2">
                    <input type="checkbox" checked={clearStoredKey} onChange={(e) => setClearStoredKey(e.target.checked)} />
                    Clear the stored key
                  </label>
                </div>
              )}
            </div>

            <div className="cl-field cl-field--full">
              <label className="cl-label">Notes</label>
              <textarea className="cl-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this license…" />
            </div>
          </div>

          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!isValid || saving} onClick={handleSubmit}>
              {saving ? "Saving…" : editLicense ? "Update License" : "Create License"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
