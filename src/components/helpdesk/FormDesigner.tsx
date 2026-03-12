"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Eye, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import type { HdForm, HdFormField, HdFieldDef } from "@/lib/helpdesk";

const STANDARD_FIELDS: { key: HdFormField["standardField"]; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "description", label: "Description" },
  { key: "priority", label: "Priority" },
  { key: "category", label: "Category" },
  { key: "asset", label: "Linked Asset" },
];

interface FormDesignerProps {
  forms: HdForm[];
  fieldDefs: HdFieldDef[];
  post: (b: Record<string, unknown>) => Promise<void>;
}

export default function FormDesigner({ forms, fieldDefs, post }: FormDesignerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(forms[0]?.id || null);
  const [editingField, setEditingField] = useState<HdFormField | null>(null);
  const [preview, setPreview] = useState(false);
  const [editName, setEditName] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const form = forms.find((f) => f.id === selectedId);

  const saveFields = async (fields: HdFormField[]) => {
    if (!form) return;
    await post({ action: "updateForm", id: form.id, fields });
  };

  const addField = async (std?: HdFormField["standardField"], defId?: string) => {
    if (!form) return;
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const label = std ? STANDARD_FIELDS.find((s) => s.key === std)!.label : fieldDefs.find((d) => d.id === defId)?.name || "Field";
    const newField: HdFormField = {
      id, standardField: std, fieldDefId: defId,
      label, required: !!std, order: form.fields.length, width: "full",
    };
    await saveFields([...form.fields, newField]);
  };

  const removeField = async (fieldId: string) => {
    if (!form) return;
    await saveFields(form.fields.filter((f) => f.id !== fieldId).map((f, i) => ({ ...f, order: i })));
  };

  const moveField = async (fieldId: string, dir: -1 | 1) => {
    if (!form) return;
    const fields = [...form.fields].sort((a, b) => a.order - b.order);
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx + dir < 0 || idx + dir >= fields.length) return;
    [fields[idx], fields[idx + dir]] = [fields[idx + dir], fields[idx]];
    await saveFields(fields.map((f, i) => ({ ...f, order: i })));
  };

  const updateField = async (fieldId: string, updates: Partial<HdFormField>) => {
    if (!form) return;
    await saveFields(form.fields.map((f) => f.id === fieldId ? { ...f, ...updates } : f));
    setEditingField(null);
  };

  // Which standard fields are already in the form
  const usedStandard = new Set(form?.fields.filter((f) => f.standardField).map((f) => f.standardField));
  const usedDefs = new Set(form?.fields.filter((f) => f.fieldDefId).map((f) => f.fieldDefId));

  return (
    <div>
      {/* Form selector */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Forms ({forms.length})</h3>
        <div className="flex gap-2">
          <button className="cl-btn cl-btn--primary text-xs" onClick={() => post({ action: "createForm", name: "New Form", description: "", fields: [], isDefault: forms.length === 0 })}><Plus className="w-3 h-3" /> New Form</button>
        </div>
      </div>

      {/* Form tabs */}
      {forms.length > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {forms.map((f) => (
            <button key={f.id} className={`hd-admin-tab${selectedId === f.id ? " hd-admin-tab--active" : ""}`} onClick={() => { setSelectedId(f.id); setPreview(false); }}>
              {f.name} {f.isDefault && "★"}
            </button>
          ))}
        </div>
      )}

      {form && (
        <>
          {/* Form header */}
          <div className="flex items-center gap-2 mb-3">
            {editName ? (
              <div className="flex gap-2 items-center">
                <input className="cl-input" style={{ width: 200 }} value={formName} onChange={(e) => setFormName(e.target.value)} />
                <input className="cl-input" style={{ width: 300 }} placeholder="Description" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
                <button className="cl-btn cl-btn--primary text-xs" onClick={async () => { await post({ action: "updateForm", id: form.id, name: formName, description: formDesc }); setEditName(false); }}>Save</button>
                <button className="cl-btn cl-btn--secondary text-xs" onClick={() => setEditName(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <span className="text-sm font-bold text-text-primary">{form.name}</span>
                <button className="hd-editor-btn" onClick={() => { setFormName(form.name); setFormDesc(form.description); setEditName(true); }}><Pencil className="w-3 h-3" /></button>
                <button className="hd-editor-btn" onClick={() => setPreview(!preview)}><Eye className="w-3 h-3" /> {preview ? "Edit" : "Preview"}</button>
                {!form.isDefault && <button className="hd-editor-btn" onClick={() => post({ action: "updateForm", id: form.id, isDefault: true })}>Set Default</button>}
                <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm("Delete this form?")) { post({ action: "deleteForm", id: form.id }); setSelectedId(forms.find((f) => f.id !== form.id)?.id || null); } }}><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>

          {preview ? (
            /* Preview mode */
            <div className="hd-form-canvas" style={{ borderStyle: "solid" }}>
              <h4 className="text-sm font-bold mb-3 text-text-primary">{form.name}</h4>
              {form.fields.sort((a, b) => a.order - b.order).map((f) => (
                <div key={f.id} className="cl-field mb-3" style={{ width: f.width === "half" ? "48%" : "100%", display: "inline-block", verticalAlign: "top", marginRight: f.width === "half" ? "4%" : 0 }}>
                  <label className="cl-label">{f.label}{f.required ? " *" : ""}</label>
                  {f.standardField === "description" ? <textarea className="cl-textarea" rows={3} disabled /> : <input className="cl-input" disabled placeholder={f.helpText} />}
                </div>
              ))}
            </div>
          ) : (
            /* Edit mode: palette + canvas */
            <div className="hd-form-designer">
              {/* Palette */}
              <div className="hd-form-palette">
                <p className="text-xs font-bold text-text-muted mb-2">STANDARD FIELDS</p>
                {STANDARD_FIELDS.filter((s) => !usedStandard.has(s.key)).map((s) => (
                  <div key={s.key} className="hd-form-palette-item" onClick={() => addField(s.key)}>
                    <Plus className="w-3 h-3" /> {s.label}
                  </div>
                ))}
                <p className="text-xs font-bold text-text-muted mt-3 mb-2">CUSTOM FIELDS</p>
                {fieldDefs.filter((d) => !usedDefs.has(d.id)).map((d) => (
                  <div key={d.id} className="hd-form-palette-item" onClick={() => addField(undefined, d.id)}>
                    <Plus className="w-3 h-3" /> {d.name} <span className="hd-form-field-type">{d.type}</span>
                  </div>
                ))}
                {fieldDefs.filter((d) => !usedDefs.has(d.id)).length === 0 && STANDARD_FIELDS.filter((s) => !usedStandard.has(s.key)).length === 0 && (
                  <p className="text-xs text-text-muted">All fields added</p>
                )}
              </div>

              {/* Canvas */}
              <div className="hd-form-canvas">
                {form.fields.length === 0 && <p className="text-sm text-text-muted text-center py-8">Click fields from the palette to add them</p>}
                {form.fields.sort((a, b) => a.order - b.order).map((f) => (
                  <div key={f.id} className="hd-form-field-card">
                    <GripVertical className="w-3 h-3 text-text-muted flex-shrink-0" />
                    <div className="hd-form-field-label">{f.label}{f.required ? " *" : ""}</div>
                    <span className="hd-form-field-type">{f.standardField || fieldDefs.find((d) => d.id === f.fieldDefId)?.type || "?"}</span>
                    <span className="hd-form-field-type">{f.width}</span>
                    <div className="flex gap-1">
                      <button className="hd-editor-btn" onClick={() => moveField(f.id, -1)}><ChevronUp className="w-3 h-3" /></button>
                      <button className="hd-editor-btn" onClick={() => moveField(f.id, 1)}><ChevronDown className="w-3 h-3" /></button>
                      <button className="hd-editor-btn" onClick={() => setEditingField(f)}><Pencil className="w-3 h-3" /></button>
                      <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => removeField(f.id)}><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field config modal */}
          {editingField && (
            <FieldConfigModal field={editingField} onSave={(u) => updateField(editingField.id, u)} onClose={() => setEditingField(null)} />
          )}
        </>
      )}
    </div>
  );
}

function FieldConfigModal({ field, onSave, onClose }: { field: HdFormField; onSave: (u: Partial<HdFormField>) => void; onClose: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [required, setRequired] = useState(field.required);
  const [width, setWidth] = useState(field.width);
  const [helpText, setHelpText] = useState(field.helpText || "");

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header"><h2 className="cl-modal-title">Configure Field</h2></div>
        <div className="cl-modal-body">
          <div className="cl-field"><label className="cl-label">Label</label><input className="cl-input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="cl-field mt-2">
            <label className="cl-label">Width</label>
            <select className="cl-input" value={width} onChange={(e) => setWidth(e.target.value as "full" | "half")}>
              <option value="full">Full</option>
              <option value="half">Half</option>
            </select>
          </div>
          <div className="cl-field mt-2"><label className="cl-label">Help Text</label><input className="cl-input" value={helpText} onChange={(e) => setHelpText(e.target.value)} /></div>
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} id="fc-req" />
            <label htmlFor="fc-req" className="text-sm text-text-secondary">Required</label>
          </div>
        </div>
        <div className="cl-modal-footer">
          <button className="cl-btn cl-btn--primary" onClick={() => onSave({ label, required, width, helpText: helpText || undefined })}>Save</button>
          <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
