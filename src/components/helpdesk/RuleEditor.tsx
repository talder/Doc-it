"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import type { HdRule, RuleCondition, RuleAction, RuleConditionOp, RuleActionType, RuleMatchType, HdGroup, HdCategory } from "@/lib/helpdesk";

const COND_FIELDS = ["priority", "category", "subject", "requester", "requesterType", "assignedGroup"];
const COND_OPS: { value: RuleConditionOp; label: string }[] = [
  { value: "equals", label: "equals" }, { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" }, { value: "not_contains", label: "not contains" },
  { value: "in", label: "in" }, { value: "not_in", label: "not in" },
  { value: "gt", label: ">" }, { value: "lt", label: "<" },
];
const ACTION_TYPES: { value: RuleActionType; label: string }[] = [
  { value: "assign_group", label: "Assign Group" }, { value: "assign_person", label: "Assign Person" },
  { value: "set_priority", label: "Set Priority" }, { value: "set_status", label: "Set Status" },
  { value: "send_notification", label: "Send Notification" }, { value: "add_tag", label: "Add Tag" },
];

interface RuleEditorProps {
  rules: HdRule[];
  groups: HdGroup[];
  categories: HdCategory[];
  post: (b: Record<string, unknown>) => Promise<void>;
}

export default function RuleEditor({ rules, groups, categories, post }: RuleEditorProps) {
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Rules ({rules.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => post({ action: "createRule", name: "New Rule", enabled: true, matchType: "all", conditions: [], actions: [], order: rules.length, stopOnMatch: false })}>
          <Plus className="w-3 h-3" /> New Rule
        </button>
      </div>

      {rules.length === 0 && <p className="text-sm text-text-muted">No rules yet. Rules auto-assign tickets on creation.</p>}
      {rules.sort((a, b) => a.order - b.order).map((r) => (
        <div key={r.id}>
          <div className="hd-editor-row">
            <div className="flex-1">
              <div className="hd-editor-name">
                {r.name}
                {!r.enabled && <span className="cl-badge hd-status--closed ml-1">Disabled</span>}
                {r.stopOnMatch && <span className="cl-badge hd-status--waiting ml-1">Stop</span>}
              </div>
              <div className="hd-editor-desc">{r.conditions.length} conditions ({r.matchType}) → {r.actions.length} actions</div>
            </div>
            <div className="hd-editor-actions">
              <button className="hd-editor-btn" onClick={() => post({ action: "updateRule", id: r.id, order: Math.max(0, r.order - 1) })}><ChevronUp className="w-3 h-3" /></button>
              <button className="hd-editor-btn" onClick={() => post({ action: "updateRule", id: r.id, order: r.order + 1 })}><ChevronDown className="w-3 h-3" /></button>
              <button className="hd-editor-btn" onClick={() => post({ action: "updateRule", id: r.id, enabled: !r.enabled })}>{r.enabled ? "Disable" : "Enable"}</button>
              <button className="hd-editor-btn" onClick={() => setEditId(editId === r.id ? null : r.id)}><Pencil className="w-3 h-3" /></button>
              <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete rule "${r.name}"?`)) post({ action: "deleteRule", id: r.id }); }}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
          {editId === r.id && <RuleDetail rule={r} groups={groups} categories={categories} post={post} onDone={() => setEditId(null)} />}
        </div>
      ))}
    </div>
  );
}

function RuleDetail({ rule, groups, categories, post, onDone }: { rule: HdRule; groups: HdGroup[]; categories: HdCategory[]; post: (b: Record<string, unknown>) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(rule.name);
  const [matchType, setMatchType] = useState<RuleMatchType>(rule.matchType);
  const [conditions, setConditions] = useState<RuleCondition[]>(rule.conditions);
  const [actions, setActions] = useState<RuleAction[]>(rule.actions);
  const [stopOnMatch, setStopOnMatch] = useState(rule.stopOnMatch);

  const save = async () => {
    await post({ action: "updateRule", id: rule.id, name, matchType, conditions, actions, stopOnMatch });
    onDone();
  };

  const addCondition = () => setConditions([...conditions, { field: "priority", operator: "equals", value: "" }]);
  const removeCondition = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, u: Partial<RuleCondition>) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, ...u } : c));

  const addAction = () => setActions([...actions, { type: "assign_group", value: "" }]);
  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));
  const updateAction = (i: number, u: Partial<RuleAction>) => setActions(actions.map((a, idx) => idx === i ? { ...a, ...u } : a));

  return (
    <div className="p-4 border border-border rounded-lg mb-3 bg-surface-alt">
      <div className="cl-field"><label className="cl-label">Rule Name</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>

      <div className="flex items-center gap-3 mt-3">
        <label className="cl-label mb-0">Match</label>
        <select className="cl-input" style={{ width: 100 }} value={matchType} onChange={(e) => setMatchType(e.target.value as RuleMatchType)}>
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span className="text-xs text-text-muted">conditions</span>
        <label className="flex items-center gap-1 text-xs text-text-secondary ml-auto">
          <input type="checkbox" checked={stopOnMatch} onChange={(e) => setStopOnMatch(e.target.checked)} /> Stop on match
        </label>
      </div>

      {/* Conditions */}
      <div className="mt-3">
        <label className="cl-label">Conditions</label>
        <div className="hd-rule-conditions">
          {conditions.map((c, i) => (
            <div key={i} className="hd-rule-cond-row">
              <select className="cl-input" value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                {COND_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="cl-input" value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value as RuleConditionOp })}>
                {COND_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input className="cl-input" value={Array.isArray(c.value) ? c.value.join(", ") : c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="value" />
              <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => removeCondition(i)}><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <button className="hd-editor-btn text-xs" onClick={addCondition}><Plus className="w-3 h-3" /> Add Condition</button>
      </div>

      {/* Actions */}
      <div className="mt-3">
        <label className="cl-label">Actions</label>
        <div className="hd-rule-actions-list">
          {actions.map((a, i) => (
            <div key={i} className="hd-rule-action-row">
              <select className="cl-input" value={a.type} onChange={(e) => updateAction(i, { type: e.target.value as RuleActionType })}>
                {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {a.type === "assign_group" ? (
                <select className="cl-input" value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })}>
                  <option value="">— Select —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              ) : (
                <input className="cl-input" value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} placeholder="value" />
              )}
              <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => removeAction(i)}><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <button className="hd-editor-btn text-xs" onClick={addAction}><Plus className="w-3 h-3" /> Add Action</button>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="cl-btn cl-btn--primary text-xs" onClick={save}>Save Rule</button>
        <button className="cl-btn cl-btn--secondary text-xs" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
