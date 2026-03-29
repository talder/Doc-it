"use client";

import { useState } from "react";
import { X, Plus, Trash2, ArrowRight, Pencil, Check } from "lucide-react";
import type { LifecycleWorkflow, LifecycleState, LifecycleTransition, LifecycleRole } from "@/lib/cmdb";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workflows: LifecycleWorkflow[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

const ROLES: { value: LifecycleRole | ""; label: string }[] = [
  { value: "", label: "Anyone" },
  { value: "writer", label: "Writer" },
  { value: "admin", label: "Admin" },
];

export default function LifecycleEditorModal({ isOpen, onClose, workflows, onSave }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Edit form state
  const [wName, setWName] = useState("");
  const [states, setStates] = useState<LifecycleState[]>([]);
  const [transitions, setTransitions] = useState<LifecycleTransition[]>([]);
  const [initialStateId, setInitialStateId] = useState("");

  // New state form
  const [newStateName, setNewStateName] = useState("");
  const [newStateColor, setNewStateColor] = useState("#6b7280");

  // New transition form
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState<LifecycleRole | "">("");

  if (!isOpen) return null;

  const startEdit = (w: LifecycleWorkflow) => {
    setSelectedId(w.id);
    setWName(w.name);
    setStates([...w.states]);
    setTransitions([...w.transitions]);
    setInitialStateId(w.initialStateId);
    setEditMode(true);
  };

  const startNew = () => {
    setSelectedId("__new__");
    setWName("");
    setStates([]);
    setTransitions([]);
    setInitialStateId("");
    setEditMode(true);
  };

  const addState = () => {
    if (!newStateName.trim()) return;
    const id = `lc-${Date.now()}`;
    setStates((prev) => [...prev, { id, name: newStateName.trim(), color: newStateColor, isFinal: false }]);
    if (states.length === 0) setInitialStateId(id);
    setNewStateName("");
    setNewStateColor("#6b7280");
  };

  const removeState = (id: string) => {
    setStates((prev) => prev.filter((s) => s.id !== id));
    setTransitions((prev) => prev.filter((t) => t.fromStateId !== id && t.toStateId !== id));
    if (initialStateId === id) setInitialStateId(states.find((s) => s.id !== id)?.id || "");
  };

  const toggleFinal = (id: string) => {
    setStates((prev) => prev.map((s) => s.id === id ? { ...s, isFinal: !s.isFinal } : s));
  };

  const addTransition = () => {
    if (!newFrom || !newTo || !newLabel.trim()) return;
    setTransitions((prev) => [...prev, {
      id: `lct-${Date.now()}`,
      fromStateId: newFrom,
      toStateId: newTo,
      label: newLabel.trim(),
      requiredRole: newRole || undefined,
    }]);
    setNewLabel("");
  };

  const removeTransition = (id: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== id));
  };

  const save = async () => {
    if (!wName.trim() || states.length === 0 || !initialStateId) return;
    if (selectedId === "__new__") {
      await onSave({ action: "createWorkflow", name: wName.trim(), states, transitions, initialStateId });
    } else {
      await onSave({ action: "updateWorkflow", id: selectedId, name: wName.trim(), states, transitions, initialStateId });
    }
    setEditMode(false);
    setSelectedId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await onSave({ action: "deleteWorkflow", id });
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Lifecycle Workflows</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          {editMode ? (
            <div className="space-y-4">
              <div className="cl-field">
                <label className="cl-label">Workflow Name</label>
                <input className="cl-input" value={wName} onChange={(e) => setWName(e.target.value)} autoFocus />
              </div>

              {/* States */}
              <div>
                <label className="cl-label mb-1 block">States</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {states.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ background: s.color }}>
                      {s.name}
                      {s.id === initialStateId && <span className="text-[9px] opacity-75">(initial)</span>}
                      {s.isFinal && <span className="text-[9px] opacity-75">(final)</span>}
                      <button className="ml-0.5 opacity-60 hover:opacity-100" onClick={() => toggleFinal(s.id)} title="Toggle final">
                        <Check className="w-2.5 h-2.5" />
                      </button>
                      <button className="opacity-60 hover:opacity-100" onClick={() => setInitialStateId(s.id)} title="Set as initial">●</button>
                      <button className="opacity-60 hover:opacity-100" onClick={() => removeState(s.id)}><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="cl-input flex-1" placeholder="State name" value={newStateName} onChange={(e) => setNewStateName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addState(); }} />
                  <input type="color" className="cl-input" value={newStateColor} onChange={(e) => setNewStateColor(e.target.value)} style={{ width: 40, padding: 2 }} />
                  <button className="cl-btn cl-btn--secondary text-xs py-1 px-2" onClick={addState}><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              {/* Transitions */}
              <div>
                <label className="cl-label mb-1 block">Transitions</label>
                {transitions.length === 0 && <p className="text-xs text-text-muted italic mb-2">No transitions defined.</p>}
                <div className="space-y-1 mb-2">
                  {transitions.map((t) => {
                    const from = states.find((s) => s.id === t.fromStateId);
                    const to = states.find((s) => s.id === t.toStateId);
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
                        <span className="px-1.5 py-0.5 rounded-full text-white text-[10px]" style={{ background: from?.color || "#6b7280" }}>{from?.name || "?"}</span>
                        <ArrowRight className="w-3 h-3 text-text-muted" />
                        <span className="px-1.5 py-0.5 rounded-full text-white text-[10px]" style={{ background: to?.color || "#6b7280" }}>{to?.name || "?"}</span>
                        <span className="flex-1 font-medium">{t.label}</span>
                        {t.requiredRole && <span className="text-text-muted">{t.requiredRole}</span>}
                        <button className="p-0.5 text-text-muted hover:text-red-500" onClick={() => removeTransition(t.id)}><Trash2 className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                </div>
                {states.length >= 2 && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <select className="cl-input text-xs" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}>
                        <option value="">From…</option>
                        {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <select className="cl-input text-xs" value={newTo} onChange={(e) => setNewTo(e.target.value)}>
                        <option value="">To…</option>
                        {states.filter((s) => s.id !== newFrom).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <input className="cl-input text-xs" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTransition(); }} />
                    </div>
                    <div>
                      <select className="cl-input text-xs" value={newRole} onChange={(e) => setNewRole(e.target.value as LifecycleRole | "")}>
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <button className="cl-btn cl-btn--secondary text-xs py-1 px-2" onClick={addTransition}><Plus className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              <div className="cl-modal-footer">
                <button className="cl-btn cl-btn--secondary" onClick={() => { setEditMode(false); setSelectedId(null); }}>Cancel</button>
                <button className="cl-btn cl-btn--primary" disabled={!wName.trim() || states.length === 0} onClick={save}>
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map((w) => (
                <div key={w.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-text-primary">{w.name}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {w.states.map((s) => (
                        <span key={s.id} className="px-1.5 py-0.5 rounded-full text-white text-[9px] font-medium" style={{ background: s.color }}>{s.name}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-text-muted">{w.transitions.length} transitions</span>
                  <button className="p-1 text-text-muted hover:text-accent" onClick={() => startEdit(w)}><Pencil className="w-3.5 h-3.5" /></button>
                  {!w.builtIn && (
                    <button className="p-1 text-text-muted hover:text-red-500" onClick={() => handleDelete(w.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              <button className="am-tree-add mt-2" onClick={startNew}>
                <Plus className="w-3.5 h-3.5" /> New Workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
