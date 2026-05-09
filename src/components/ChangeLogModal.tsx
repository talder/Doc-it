"use client";

import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, Zap, ChevronRight, HelpCircle, Check } from "lucide-react";
import type { ChangeCategory, ChangeRisk, ChangeLifecycleStatus, ChangeLogEntry, ChangeTemplate } from "@/lib/changelog-shared";
import { RISK_QUESTIONS, calculateRiskFromAnswers } from "@/lib/changelog-shared";

const DEFAULT_CATS: ChangeCategory[] = ["Disk","Network","Security","Software","Hardware","Configuration","Other"];
const RISKS: ChangeRisk[] = ["Low","Medium","High","Critical"];
const TYPES = ["Standard","Normal","Emergency"] as const;
const RISK_COLORS: Record<ChangeRisk,string> = { Low:"cl-risk--low", Medium:"cl-risk--medium", High:"cl-risk--high", Critical:"cl-risk--critical" };
const TYPE_COLORS = { Standard:"bg-green-100 text-green-800 border-green-200", Normal:"bg-blue-100 text-blue-800 border-blue-200", Emergency:"bg-red-100 text-red-800 border-red-200" };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<{ conflicts?: { id: string; system: string }[] }>;
  knownSystems: string[];
  categories?: string[];
  templates?: ChangeTemplate[];
  prefill?: Partial<ChangeLogEntry>;
}

function today(): string { return new Date().toISOString().slice(0, 10); }

export default function ChangeLogModal({ isOpen, onClose, onSave, knownSystems, categories, templates = [], prefill }: Props) {
  const cats = categories && categories.length > 0 ? categories : DEFAULT_CATS;

  // State
  const [step, setStep] = useState<"form"|"questionnaire"|"confirm">("form");
  const [changeType, setChangeType] = useState<typeof TYPES[number]>("Normal");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [system, setSystem] = useState("");
  const [category, setCategory] = useState<ChangeCategory>("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  const [backoutPlan, setBackoutPlan] = useState("");
  const [risk, setRisk] = useState<ChangeRisk>("Medium");
  const [riskAnswers, setRiskAnswers] = useState<Record<string,boolean>>({});
  const [useQuestionnaire, setUseQuestionnaire] = useState(false);
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [rollbackOf, setRollbackOf] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<{ id: string; system: string }[]>([]);
  const [showSystemSuggest, setShowSystemSuggest] = useState(false);
  const [assetNames, setAssetNames] = useState<string[]>([]);
  const [userList, setUserList] = useState<{ username: string; fullName: string | null }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const systemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep("form");
    setChangeType(prefill ? "Normal" : "Normal");
    setDate(prefill?.date || today()); setTime(prefill?.time || "");
    setSystem(prefill?.system || ""); setCategory((prefill?.category as ChangeCategory) || "");
    setDescription(prefill?.description || ""); setImpact(prefill?.impact || "");
    setBackoutPlan(prefill?.backoutPlan || ""); setRisk(prefill?.risk || "Medium");
    setRiskAnswers({}); setUseQuestionnaire(false);
    setPlannedStart(""); setPlannedEnd(""); setDowntimeMinutes(""); setCcEmails("");
    setAssignedTo(prefill?.assignedTo || "");
    setRollbackOf(prefill?.id || ""); setSaving(false); setConflicts([]); setSelectedTemplate("");
    fetch("/api/cmdb").then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setAssetNames((d.assets || []).map((a: { name: string }) => a.name))).catch(() => {});
    fetch("/api/changelog/users").then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUserList(d.users || [])).catch(() => {});
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const applyTemplate = (tplId: string) => {
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    setSelectedTemplate(tplId);
    setChangeType(tpl.changeType);
    setCategory(tpl.category);
    setRisk(tpl.risk);
    setDescription(tpl.description);
    setImpact(tpl.impact);
    setBackoutPlan(tpl.backoutPlan);
  };

  const allSystems = Array.from(new Set([...knownSystems, ...assetNames]));
  const filteredSystems = system.trim() ? allSystems.filter(s => s.toLowerCase().includes(system.toLowerCase()) && s.toLowerCase() !== system.toLowerCase()) : allSystems;
  const isFormValid = date && system.trim() && category && description.trim() && impact.trim();

  const handleQuestionnaireNext = () => {
    const calc = calculateRiskFromAnswers(riskAnswers);
    setRisk(calc);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await onSave({
        changeType, date, ...(time ? { time } : {}),
        system: system.trim(), category,
        description: description.trim(), impact: impact.trim(),
        ...(backoutPlan.trim() ? { backoutPlan: backoutPlan.trim() } : {}),
        risk, ...(useQuestionnaire ? { riskAnswers } : {}),
        ...(plannedStart ? { plannedStart } : {}),
        ...(plannedEnd ? { plannedEnd } : {}),
        ...(downtimeMinutes ? { downtimeMinutes: Number(downtimeMinutes) } : {}),
        ...(ccEmails.trim() ? { ccEmails: ccEmails.split(",").map(e => e.trim()).filter(Boolean) } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(rollbackOf.trim() ? { rollbackOf: rollbackOf.trim() } : {}),
      });
      if (res?.conflicts?.length) setConflicts(res.conflicts);
      else onClose();
    } finally { setSaving(false); }
  };

  const typeDesc: Record<typeof TYPES[number], string> = {
    Standard: "Pre-approved, recurring change. Auto-approved on submit.",
    Normal: "Requires review and CAB approval before implementation.",
    Emergency: "Urgent unplanned change. Bypasses CAB, notifies all admins.",
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            {step === "form" ? (rollbackOf ? `Log Rollback of ${rollbackOf}` : "Log New Change") :
             step === "questionnaire" ? "Risk Assessment Questionnaire" : "Confirm Change"}
          </h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>

        {/* ── FORM STEP ── */}
        {step === "form" && (
          <div className="cl-modal-body">
            {/* Template picker */}
            {templates.length > 0 && (
              <div className="mb-4 p-3 bg-surface-alt border border-border rounded-lg">
                <label className="cl-label text-xs mb-1.5 block">Apply Template (optional)</label>
                <select className="cl-input" value={selectedTemplate} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">— Start from scratch —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.changeType})</option>)}
                </select>
              </div>
            )}

            {/* Change Type */}
            <div className="cl-field cl-field--full mb-1">
              <label className="cl-label">Change Type *</label>
              <div className="flex gap-2 flex-wrap">
                {TYPES.map(t => (
                  <button key={t} type="button"
                    onClick={() => setChangeType(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${changeType === t ? TYPE_COLORS[t] + " ring-2 ring-offset-1 ring-current" : "border-border text-text-secondary hover:bg-muted"}`}
                  >
                    {t === "Emergency" && <Zap className="w-3.5 h-3.5" />}
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-muted mt-1">{typeDesc[changeType]}</p>
            </div>

            <div className="cl-form-grid">
              <div className="cl-field">
                <label className="cl-label">Date *</label>
                <input type="date" className="cl-input" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Time (HH:MM)</label>
                <input type="time" className="cl-input" value={time} onChange={e => setTime(e.target.value)} />
              </div>
              <div className="cl-field cl-field--full relative">
                <label className="cl-label">System / Asset *</label>
                <input ref={systemRef} type="text" className="cl-input" placeholder="e.g. vxsrv01.domain.be"
                  value={system} onChange={e => { setSystem(e.target.value); setShowSystemSuggest(true); }}
                  onFocus={() => setShowSystemSuggest(true)} onBlur={() => setTimeout(() => setShowSystemSuggest(false), 150)} />
                {showSystemSuggest && filteredSystems.length > 0 && (
                  <div className="cl-suggest">{filteredSystems.slice(0, 8).map(s => (
                    <button key={s} className="cl-suggest-item" onMouseDown={() => { setSystem(s); setShowSystemSuggest(false); }}>{s}</button>
                  ))}</div>
                )}
              </div>
              <div className="cl-field">
                <label className="cl-label">Category *</label>
                <select className="cl-input" value={category} onChange={e => setCategory(e.target.value as ChangeCategory)}>
                  <option value="" disabled>Select…</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Description *</label>
                <textarea className="cl-textarea" rows={2} placeholder="What will be changed?" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Impact *</label>
                <textarea className="cl-textarea" rows={2} placeholder="Business/service impact of this change?" value={impact} onChange={e => setImpact(e.target.value)} />
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Backout Plan {changeType !== "Standard" ? "*" : ""}</label>
                <textarea className="cl-textarea" rows={2} placeholder="Step-by-step procedure to roll back if this change fails" value={backoutPlan} onChange={e => setBackoutPlan(e.target.value)} />
              </div>

              {/* Risk */}
              <div className="cl-field cl-field--full">
                <div className="flex items-center justify-between mb-1">
                  <label className="cl-label mb-0">Risk Level</label>
                  <label className="flex items-center gap-1.5 text-xs text-accent cursor-pointer">
                    <input type="checkbox" checked={useQuestionnaire} onChange={e => setUseQuestionnaire(e.target.checked)} className="rounded" />
                    <HelpCircle className="w-3.5 h-3.5" />Use questionnaire to calculate
                  </label>
                </div>
                {!useQuestionnaire && (
                  <div className="cl-radio-group">
                    {RISKS.map(r => (
                      <label key={r} className={`cl-radio ${RISK_COLORS[r]}${risk === r ? " cl-radio--active" : ""}`}>
                        <input type="radio" name="risk" value={r} checked={risk === r} onChange={() => setRisk(r)} className="sr-only" />{r}
                      </label>
                    ))}
                  </div>
                )}
                {useQuestionnaire && <p className="text-xs text-text-muted">Answer questions on the next step to auto-calculate risk.</p>}
              </div>

              {/* Planned window */}
              <div className="cl-field">
                <label className="cl-label">Planned Start</label>
                <input type="datetime-local" className="cl-input" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Planned End</label>
                <input type="datetime-local" className="cl-input" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Est. Downtime (min)</label>
                <input type="number" min="0" className="cl-input" placeholder="0 = no downtime" value={downtimeMinutes} onChange={e => setDowntimeMinutes(e.target.value)} />
              </div>

              {/* CC + rollback */}
              <div className="cl-field">
                <label className="cl-label">Notify (CC emails)</label>
                <input type="text" className="cl-input" placeholder="email1@co, email2@co" value={ccEmails} onChange={e => setCcEmails(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Assigned To</label>
                <select className="cl-input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {userList.map(u => (
                    <option key={u.username} value={u.username}>
                      {u.fullName ? `${u.fullName} (${u.username})` : u.username}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cl-field">
                <label className="cl-label">Rollback of (CHG-#)</label>
                <input type="text" className="cl-input" placeholder="CHG-000012" value={rollbackOf} onChange={e => setRollbackOf(e.target.value)} />
              </div>
            </div>

            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="cl-btn cl-btn--primary" disabled={!isFormValid}
                onClick={() => useQuestionnaire ? setStep("questionnaire") : setStep("confirm")}>
                {useQuestionnaire ? "Next: Risk Questions" : "Review & Submit"} <ChevronRight className="w-3.5 h-3.5 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* ── QUESTIONNAIRE STEP ── */}
        {step === "questionnaire" && (
          <div className="cl-modal-body">
            <p className="text-sm text-text-muted mb-4">Answer each question to auto-calculate the risk level for this change.</p>
            <div className="space-y-3">
              {RISK_QUESTIONS.map(q => (
                <label key={q.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${riskAnswers[q.id] ? "bg-accent/5 border-accent" : "border-border hover:bg-muted"}`}>
                  <input type="checkbox" checked={!!riskAnswers[q.id]}
                    onChange={e => setRiskAnswers(a => ({ ...a, [q.id]: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded" />
                  <span className="text-sm text-text-primary flex-1">{q.question}</span>
                  {riskAnswers[q.id] && <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />}
                </label>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-surface-alt border border-border">
              <span className="text-xs text-text-muted">Calculated risk: </span>
              <span className={`cl-badge ${RISK_COLORS[calculateRiskFromAnswers(riskAnswers)]}`}>{calculateRiskFromAnswers(riskAnswers)}</span>
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={() => setStep("form")}>← Back</button>
              <button className="cl-btn cl-btn--primary" onClick={handleQuestionnaireNext}>Review & Submit</button>
            </div>
          </div>
        )}

        {/* ── CONFIRM STEP ── */}
        {step === "confirm" && (
          <div className="cl-modal-body">
            {conflicts.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Scheduling conflict detected</p>
                {conflicts.map(c => <p key={c.id} className="text-xs text-amber-700">{c.id} also targets <strong>{c.system}</strong> in this window</p>)}
                <p className="text-xs text-amber-700 mt-1">You can still proceed, but review the conflict first.</p>
              </div>
            )}
            <div className="cl-confirm-warning">
              <AlertTriangle className="w-4 h-4" />
              <span>Review carefully. The change will start as <strong>{changeType === "Standard" ? "Approved" : "Draft"}</strong>.</span>
            </div>
            <div className="cl-confirm-grid">
              <div className="cl-confirm-row"><span className="cl-confirm-label">Type</span>
                <span className={`cl-badge ${TYPE_COLORS[changeType]}`}>{changeType}</span>
              </div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{date}{time ? ` at ${time}` : ""}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">System</span><span className="font-semibold">{system}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Category</span><span>{category}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Risk</span><span className={`cl-badge ${RISK_COLORS[risk]}`}>{risk}</span></div>
              {assignedTo && <div className="cl-confirm-row"><span className="cl-confirm-label">Assigned To</span><span className="font-medium">{assignedTo}</span></div>}
              {rollbackOf && <div className="cl-confirm-row"><span className="cl-confirm-label">Rollback of</span><span className="font-mono text-amber-700">{rollbackOf}</span></div>}
              {plannedStart && <div className="cl-confirm-row"><span className="cl-confirm-label">Window</span><span>{new Date(plannedStart).toLocaleString()} → {plannedEnd ? new Date(plannedEnd).toLocaleString() : "—"}</span></div>}
              {downtimeMinutes && <div className="cl-confirm-row"><span className="cl-confirm-label">Downtime</span><span>{downtimeMinutes} min</span></div>}
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Description</span><p>{description}</p></div>
              <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Impact</span><p>{impact}</p></div>
              {backoutPlan && <div className="cl-confirm-row cl-confirm-row--block"><span className="cl-confirm-label">Backout Plan</span><p>{backoutPlan}</p></div>}
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={() => setStep(useQuestionnaire ? "questionnaire" : "form")}>← Back</button>
              <button className="cl-btn cl-btn--primary" disabled={saving} onClick={handleConfirm}>
                {saving ? "Logging…" : changeType === "Standard" ? "Submit & Auto-Approve" : "Submit for Review"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
