"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { SlaPolicy, SlaPriorityConfig, SlaBusinessHours, TicketPriority } from "@/lib/helpdesk";

const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface SlaEditorProps {
  policies: SlaPolicy[];
  post: (b: Record<string, unknown>) => Promise<void>;
}

const DEFAULT_PRIORITIES: SlaPriorityConfig[] = [
  { priority: "Low", responseTimeMinutes: 480, resolutionTimeMinutes: 2880 },
  { priority: "Medium", responseTimeMinutes: 240, resolutionTimeMinutes: 1440 },
  { priority: "High", responseTimeMinutes: 60, resolutionTimeMinutes: 480 },
  { priority: "Critical", responseTimeMinutes: 15, resolutionTimeMinutes: 120 },
];

export default function SlaEditor({ policies, post }: SlaEditorProps) {
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">SLA Policies ({policies.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => post({ action: "createSlaPolicy", name: "New SLA Policy", isDefault: policies.length === 0, priorities: DEFAULT_PRIORITIES })}>
          <Plus className="w-3 h-3" /> New Policy
        </button>
      </div>

      {policies.length === 0 && <p className="text-sm text-text-muted">No SLA policies yet. Create one to enable SLA tracking.</p>}
      {policies.map((p) => (
        <div key={p.id}>
          <div className="hd-editor-row">
            <div className="flex-1">
              <div className="hd-editor-name">{p.name} {p.isDefault && <span className="cl-badge hd-status--open">Default</span>}</div>
              <div className="hd-editor-desc">{p.priorities.length} levels{p.businessHours ? ` · ${p.businessHours.start}–${p.businessHours.end}` : ""}</div>
            </div>
            <div className="hd-editor-actions">
              {!p.isDefault && <button className="hd-editor-btn" onClick={() => post({ action: "updateSlaPolicy", id: p.id, isDefault: true })}>Set Default</button>}
              <button className="hd-editor-btn" onClick={() => setEditId(editId === p.id ? null : p.id)}><Pencil className="w-3 h-3" /></button>
              <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete SLA "${p.name}"?`)) post({ action: "deleteSlaPolicy", id: p.id }); }}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
          {editId === p.id && <SlaDetail policy={p} post={post} onDone={() => setEditId(null)} />}
        </div>
      ))}
    </div>
  );
}

function SlaDetail({ policy, post, onDone }: { policy: SlaPolicy; post: (b: Record<string, unknown>) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(policy.name);
  const [priorities, setPriorities] = useState<SlaPriorityConfig[]>(
    PRIORITIES.map((p) => policy.priorities.find((x) => x.priority === p) || { priority: p, responseTimeMinutes: 240, resolutionTimeMinutes: 1440 })
  );
  const [useBizHours, setUseBizHours] = useState(!!policy.businessHours);
  const [bizStart, setBizStart] = useState(policy.businessHours?.start || "09:00");
  const [bizEnd, setBizEnd] = useState(policy.businessHours?.end || "17:00");
  const [bizDays, setBizDays] = useState<number[]>(policy.businessHours?.days || [1, 2, 3, 4, 5]);

  const updatePriority = (idx: number, field: "responseTimeMinutes" | "resolutionTimeMinutes", val: number) => {
    setPriorities(priorities.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };

  const toggleDay = (day: number) => {
    setBizDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const save = async () => {
    const bh: SlaBusinessHours | undefined = useBizHours ? { start: bizStart, end: bizEnd, days: bizDays } : undefined;
    await post({ action: "updateSlaPolicy", id: policy.id, name, priorities, businessHours: bh });
    onDone();
  };

  const formatMinutes = (m: number) => {
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  };

  return (
    <div className="p-4 border border-border rounded-lg mb-3 bg-surface-alt">
      <div className="cl-field"><label className="cl-label">Policy Name</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>

      {/* Priority times */}
      <div className="mt-3">
        <label className="cl-label">Response &amp; Resolution Times</label>
        {priorities.map((p, i) => (
          <div key={p.priority} className="flex items-center gap-3 mb-2">
            <span className={`cl-badge hd-priority--${p.priority.toLowerCase()}`} style={{ minWidth: 70, textAlign: "center" }}>{p.priority}</span>
            <div className="flex items-center gap-1">
              <label className="text-xs text-text-muted">Response:</label>
              <input type="number" className="cl-input" style={{ width: 80 }} value={p.responseTimeMinutes} onChange={(e) => updatePriority(i, "responseTimeMinutes", +e.target.value)} />
              <span className="text-xs text-text-muted">min ({formatMinutes(p.responseTimeMinutes)})</span>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-text-muted">Resolution:</label>
              <input type="number" className="cl-input" style={{ width: 80 }} value={p.resolutionTimeMinutes} onChange={(e) => updatePriority(i, "resolutionTimeMinutes", +e.target.value)} />
              <span className="text-xs text-text-muted">min ({formatMinutes(p.resolutionTimeMinutes)})</span>
            </div>
          </div>
        ))}
      </div>

      {/* Business hours */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={useBizHours} onChange={(e) => setUseBizHours(e.target.checked)} /> Use Business Hours
        </label>
        {useBizHours && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <label className="text-xs text-text-muted">Start:</label>
              <input type="time" className="cl-input" style={{ width: 110 }} value={bizStart} onChange={(e) => setBizStart(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-text-muted">End:</label>
              <input type="time" className="cl-input" style={{ width: 110 }} value={bizEnd} onChange={(e) => setBizEnd(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {DAYS.map((d, i) => (
                <button key={i} className={`hd-comment-toggle-btn${bizDays.includes(i) ? " hd-comment-toggle-btn--active" : ""}`} onClick={() => toggleDay(i)} style={{ padding: "3px 8px", fontSize: "0.625rem" }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button className="cl-btn cl-btn--primary text-xs" onClick={save}>Save Policy</button>
        <button className="cl-btn cl-btn--secondary text-xs" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
