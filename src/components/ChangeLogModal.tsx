"use client";

import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ChangeCategory, ChangeRisk, ChangeStatus, ChangeLogEntry } from "@/lib/changelog";

const DEFAULT_CATEGORIES_FALLBACK: ChangeCategory[] = ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"];
const RISKS: ChangeRisk[] = ["Low", "Medium", "High", "Critical"];
const STATUSES: ChangeStatus[] = ["Planned", "In Progress", "Completed", "Failed", "Rolled Back"];
const RISK_COLORS: Record<ChangeRisk, string> = { Low: "cl-risk--low", Medium: "cl-risk--medium", High: "cl-risk--high", Critical: "cl-risk--critical" };
const STATUS_FUTURE = new Set<ChangeStatus>(["Planned", "In Progress"]);

interface ChangeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    date: string; time?: string; system: string; category: ChangeCategory;
    description: string; impact: string; risk: ChangeRisk; status: ChangeStatus;
    approvedBy?: string; plannedStart?: string; plannedEnd?: string; rollbackOf?: string;
  }) => Promise<void>;
  knownSystems: string[];
  categories?: string[];
  prefill?: Partial<ChangeLogEntry>;
}

function today(): string { return new Date().toISOString().slice(0, 10); }

export default function ChangeLogModal({ isOpen, onClose, onSave, knownSystems, categories, prefill }: ChangeLogModalProps) {
  const activeCategories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES_FALLBACK;
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [system, setSystem] = useState("");
  const [category, setCategory] = useState<ChangeCategory>("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  const [risk, setRisk] = useState<ChangeRisk>("Medium");
  const [status, setStatus] = useState<ChangeStatus>("Completed");
  const [approvedBy, setApprovedBy] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [rollbackOf, setRollbackOf] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSystemSuggest, setShowSystemSuggest] = useState(false);
  const [assetNames, setAssetNames] = useState<string[]>([]);
  const systemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDate(prefill?.date || today()); setTime(prefill?.time || "");
    setSystem(prefill?.system || ""); setCategory(prefill?.category || "");
    setDescription(prefill?.description || ""); setImpact(prefill?.impact || "");
    setRisk(prefill?.risk || "Medium"); setStatus(prefill ? "Rolled Back" : "Completed");
    setApprovedBy(""); setPlannedStart(""); setPlannedEnd(""); setRollbackOf(prefill?.id || "");
    setShowConfirm(false); setSaving(false);
    fetch("/api/cmdb").then((r) => r.ok ? r.json() : { assets: [] })
      .then((d) => setAssetNames((d.assets || []).map((a: { name: string }) => a.name))).catch(() => setAssetNames([]));
  }, [isOpen, prefill]);

  if (!isOpen) return null;
  const isValid = date && system.trim() && category && description.trim() && impact.trim();
  const showChangeWindow = STATUS_FUTURE.has(status);
  const allSystems = Array.from(new Set([...knownSystems, ...assetNames]));
  const filteredSystems = system.trim() ? allSystems.filter((s) => s.toLowerCase().includes(system.toLowerCase()) && s.toLowerCase() !== system.toLowerCase()) : allSystems;

  const handleConfirm = async () => {
    setSaving(true);
    await onSave({ date, ...(time ? { time } : {}), system: system.trim(), category, description: description.trim(), impact: impact.trim(), risk, status,
      ...(approvedBy.trim() ? { approvedBy: approvedBy.trim() } : {}), ...(plannedStart ? { plannedStart } : {}), ...(plannedEnd ? { plannedEnd } : {}), ...(rollbackOf.trim() ? { rollbackOf: rollbackOf.trim() } : {}) });
    setSaving(false); onClose();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{showConfirm ? "Confirm Change Entry" : rollbackOf ? `Log Rollback of ${rollbackOf}` : "Log New Change"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>

        {!showConfirm ? (
          <div className="cl-modal-body">
            <div className="cl-form-grid">
              <div className="cl-field">
                <label className="cl-label">Date *</label>
                <input type="date" className="cl-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Time (HH:MM)</label>
                <input type="time" className="cl-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="cl-field cl-field--full relative">
                <label className="cl-label">System / Asset *</label>
                <input ref={systemRef} type="text" className="cl-input" placeholder="e.g. vxvictorialog01" value={system}
                  onChange={(e) => { setSystem(e.target.value); setShowSystemSuggest(true); }}
                  onFocus={() => setShowSystemSuggest(true)} onBlur={() => setTimeout(() => setShowSystemSuggest(false), 150)} />
                {showSystemSuggest && filteredSystems.length > 0 && (
                  <div className="cl-suggest">{filteredSystems.slice(0, 8).map((s) => (
                    <button key={s} className="cl-suggest-item" onMouseDown={() => { setSystem(s); setShowSystemSuggest(false); }}>{s}</button>
                  ))}</div>
                )}
              </div>
              <div className="cl-field">
                <label className="cl-label">Category *</label>
                <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value as ChangeCategory)}>
                  <option value="" disabled>Select…</option>
                  {activeCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Status</label>
                <div className="cl-radio-group" style={{ flexWrap: "wrap" }}>
                  {STATUSES.map((s) => (
                    <label key={s} className={`cl-radio${status === s ? " cl-radio--active" : ""}`}>
                      <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />{s}
                    </label>
                  ))}
                </div>
              </div>
              {showChangeWindow && (<>
                <div className="cl-field"><label className="cl-label">Planned Start</label><input type="datetime-local" className="cl-input" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} /></div>
                <div className="cl-field"><label className="cl-label">Planned End</label><input type="datetime-local" className="cl-input" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} /></div>
              </>)}
              <div className="cl-field cl-field--full"><label className="cl-label">Description *</label><textarea className="cl-textarea" rows={2} placeholder="What was / will be changed?" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="cl-field cl-field--full"><label className="cl-label">Impact *</label><textarea className="cl-textarea" rows={2} placeholder="What is the impact of this change?" value={impact} onChange={(e) => setImpact(e.target.value)} /></div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Risk Level</label>
                <div className="cl-radio-group">{RISKS.map((r) => (
                  <label key={r} className={`cl-radio ${RISK_COLORS[r]}${risk === r ? " cl-radio--active" : ""}`}>
                    <input type="radio" name="risk" value={r} checked={risk === r} onChange={() => setRisk(r)} className="sr-only" />{r}
                  </label>
                ))}</div>
              </div>
              <div className="cl-field"><label className="cl-label">Approved By</label><input type="text" className="cl-input" placeholder="Optional" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></div>
              <div className="cl-field"><label className="cl-label">Rollback of (CHG-#)</label><input type="text" className="cl-input" placeholder="e.g. CHG-000012" value={rollbackOf} onChange={(e) => setRollbackOf(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="cl-btn cl-btn--primary" disabled={!isValid} onClick={() => setShowConfirm(true)}>Review & Submit</button>
            </div>
          </div>
        ) : (
          <div className="cl-modal-body">
            <div className="cl-confirm-warning"><AlertTriangle className="w-4 h-4" /><span>This entry is <strong>immutable</strong> — it cannot be edited or deleted after submission.</span></div>
            <div className="cl-confirm-grid">
              <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{date}{time ? ` at ${time}` : ""}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">System</span><span>{system}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Category</span><span>{category}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Status</span><span>{status}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Risk</span><span className={`cl-badge ${RISK_COLORS[risk]}`}>{risk}</span></div>
              {approvedBy && <div className="cl-confirm-row"><span className="cl-confirm-label">Approved By</span><span>{approvedBy}</span></div>}
              {rollbackOf && <div className="cl-confirm-row"><span className="cl-confirm-label">Rollback of</span><span>{rollbackOf}</span></div>}
              {plannedStart && <div className="cl-confirm-row"><span className="cl-confirm-label">Planned Start</span><span>{new Date(plannedStart).toLocaleString()}</span></div>}
              {plannedEnd && <div className="cl-confirm-row"><span className="cl-confirm-label">Planned End</span><span>{new Date(plannedEnd).toLocaleString()}</span></div>}
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Description</span><p>{description}</p></div>
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Impact</span><p>{impact}</p></div>
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={() => setShowConfirm(false)}>← Back to edit</button>
              <button className="cl-btn cl-btn--primary" disabled={saving} onClick={handleConfirm}>{saving ? "Logging…" : "Confirm & Log Change"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
