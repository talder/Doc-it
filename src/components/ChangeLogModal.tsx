"use client";

import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ChangeCategory, ChangeRisk, ChangeStatus } from "@/lib/changelog";

const DEFAULT_CATEGORIES_FALLBACK: ChangeCategory[] = ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"];
const RISKS: ChangeRisk[] = ["Low", "Medium", "High", "Critical"];
const STATUSES: ChangeStatus[] = ["Completed", "Failed", "Rolled Back"];

const RISK_COLORS: Record<ChangeRisk, string> = {
  Low: "cl-risk--low",
  Medium: "cl-risk--medium",
  High: "cl-risk--high",
  Critical: "cl-risk--critical",
};

interface ChangeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    date: string;
    system: string;
    category: ChangeCategory;
    description: string;
    impact: string;
    risk: ChangeRisk;
    status: ChangeStatus;
  }) => Promise<void>;
  knownSystems: string[];
  categories?: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ChangeLogModal({ isOpen, onClose, onSave, knownSystems, categories }: ChangeLogModalProps) {
  const activeCategories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES_FALLBACK;
  const [date, setDate] = useState(today());
  const [system, setSystem] = useState("");
  const [category, setCategory] = useState<ChangeCategory>("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  const [risk, setRisk] = useState<ChangeRisk>("Medium");
  const [status, setStatus] = useState<ChangeStatus>("Completed");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSystemSuggest, setShowSystemSuggest] = useState(false);
  const [assetNames, setAssetNames] = useState<string[]>([]);
  const systemRef = useRef<HTMLInputElement>(null);

  // Reset form when opened + fetch asset names
  useEffect(() => {
    if (isOpen) {
      setDate(today());
      setSystem("");
      setCategory("");
      setDescription("");
      setImpact("");
      setRisk("Medium");
      setStatus("Completed");
      setShowConfirm(false);
      setSaving(false);
      // Fetch asset names for system autocomplete
      fetch("/api/assets")
        .then((r) => r.ok ? r.json() : { assets: [] })
        .then((data) => setAssetNames((data.assets || []).map((a: { name: string }) => a.name)))
        .catch(() => setAssetNames([]));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = date && system.trim() && category && description.trim() && impact.trim();

  // Merge known systems with asset names, deduplicated
  const allSystems = Array.from(new Set([...knownSystems, ...assetNames]));
  const filteredSystems = system.trim()
    ? allSystems.filter((s) => s.toLowerCase().includes(system.toLowerCase()) && s.toLowerCase() !== system.toLowerCase())
    : allSystems;

  const handleSubmit = () => {
    if (!isValid) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setSaving(true);
    await onSave({ date, system: system.trim(), category, description: description.trim(), impact: impact.trim(), risk, status });
    setSaving(false);
    onClose();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{showConfirm ? "Confirm Change Entry" : "Log New Change"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>

        {!showConfirm ? (
          /* ── Form step ── */
          <div className="cl-modal-body">
            <div className="cl-form-grid">
              <div className="cl-field">
                <label className="cl-label">Date of change *</label>
                <input type="date" className="cl-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="cl-field relative">
                <label className="cl-label">System / Asset *</label>
                <input
                  ref={systemRef}
                  type="text"
                  className="cl-input"
                  placeholder="e.g. vxvictorialog01"
                  value={system}
                  onChange={(e) => { setSystem(e.target.value); setShowSystemSuggest(true); }}
                  onFocus={() => setShowSystemSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSystemSuggest(false), 150)}
                />
                {showSystemSuggest && filteredSystems.length > 0 && (
                  <div className="cl-suggest">
                    {filteredSystems.slice(0, 8).map((s) => (
                      <button key={s} className="cl-suggest-item" onMouseDown={() => { setSystem(s); setShowSystemSuggest(false); }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="cl-field">
                <label className="cl-label">Category *</label>
                <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value as ChangeCategory)}>
                  <option value="" disabled>Select…</option>
                  {activeCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="cl-field">
                <label className="cl-label">Status</label>
                <div className="cl-radio-group">
                  {STATUSES.map((s) => (
                    <label key={s} className={`cl-radio${status === s ? " cl-radio--active" : ""}`}>
                      <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="cl-field cl-field--full">
                <label className="cl-label">Description *</label>
                <textarea className="cl-textarea" rows={2} placeholder="What was changed?" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="cl-field cl-field--full">
                <label className="cl-label">Impact *</label>
                <textarea className="cl-textarea" rows={2} placeholder="What is the impact of this change?" value={impact} onChange={(e) => setImpact(e.target.value)} />
              </div>

              <div className="cl-field cl-field--full">
                <label className="cl-label">Risk Level</label>
                <div className="cl-radio-group">
                  {RISKS.map((r) => (
                    <label key={r} className={`cl-radio ${RISK_COLORS[r]}${risk === r ? " cl-radio--active" : ""}`}>
                      <input type="radio" name="risk" value={r} checked={risk === r} onChange={() => setRisk(r)} className="sr-only" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="cl-btn cl-btn--primary" disabled={!isValid} onClick={handleSubmit}>Review & Submit</button>
            </div>
          </div>
        ) : (
          /* ── Confirmation step ── */
          <div className="cl-modal-body">
            <div className="cl-confirm-warning">
              <AlertTriangle className="w-4 h-4" />
              <span>This entry is <strong>immutable</strong> — it cannot be edited or deleted after submission.</span>
            </div>

            <div className="cl-confirm-grid">
              <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{date}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">System</span><span>{system}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Category</span><span>{category}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Status</span><span>{status}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Risk</span><span className={`cl-badge ${RISK_COLORS[risk]}`}>{risk}</span></div>
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Description</span><p>{description}</p></div>
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Impact</span><p>{impact}</p></div>
            </div>

            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={() => setShowConfirm(false)}>← Back to edit</button>
              <button className="cl-btn cl-btn--primary" disabled={saving} onClick={handleConfirm}>
                {saving ? "Logging…" : "Confirm & Log Change"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
