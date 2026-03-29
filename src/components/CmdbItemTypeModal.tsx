"use client";

import { useState } from "react";
import { X, Plus, Trash2, Pencil, Check } from "lucide-react";
import type { CmdbItemType, CustomFieldDef, CustomFieldType } from "@/lib/cmdb";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Select" },
  { value: "url", label: "URL" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assetTypes: CmdbItemType[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function CmdbItemTypeModal({ isOpen, onClose, assetTypes, onSave }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "📦", color: "#6b7280" });
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const startEdit = (t: CmdbItemType) => {
    setEditingId(t.id);
    setForm({ name: t.name, icon: t.icon, color: t.color });
    setFields([...t.fields]);
    setError("");
  };

  const startNew = () => {
    setEditingId("__new__");
    setForm({ name: "", icon: "📦", color: "#6b7280" });
    setFields([]);
    setError("");
  };

  const cancel = () => { setEditingId(null); setError(""); };

  const addField = () => {
    if (!newFieldName.trim()) return;
    setFields((prev) => [...prev, { id: `tf-${Date.now()}`, name: newFieldName.trim(), type: newFieldType }]);
    setNewFieldName("");
    setNewFieldType("text");
  };

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const save = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setError("");
    if (editingId === "__new__") {
      await onSave({ action: "createAssetType", name: form.name.trim(), icon: form.icon, color: form.color, fields });
    } else {
      await onSave({ action: "updateCmdbItemType", id: editingId, name: form.name.trim(), icon: form.icon, color: form.color, fields });
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this asset type?")) return;
    await onSave({ action: "deleteCmdbItemType", id });
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">CmdbItem Types</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          {editingId ? (
            /* Edit / Create form */
            <div className="space-y-3">
              <div className="cl-form-grid">
                <div className="cl-field cl-field--full">
                  <label className="cl-label">Name</label>
                  <input className="cl-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </div>
                <div className="cl-field">
                  <label className="cl-label">Icon (emoji)</label>
                  <input className="cl-input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} style={{ width: 80 }} />
                </div>
                <div className="cl-field">
                  <label className="cl-label">Color</label>
                  <input type="color" className="cl-input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 60, height: 36, padding: 2 }} />
                </div>
              </div>

              <div>
                <label className="cl-label mb-1 block">Type-Specific Fields</label>
                {fields.length === 0 && <p className="text-xs text-text-muted italic">No per-type fields defined.</p>}
                {fields.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-text-primary flex-1">{f.name}</span>
                    <span className="text-xs text-text-muted">{f.type}</span>
                    <button className="p-0.5 text-text-muted hover:text-red-500" onClick={() => removeField(f.id)}><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input className="cl-input flex-1" placeholder="Field name" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addField(); }} />
                  <select className="cl-input" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)} style={{ width: 100 }}>
                    {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button className="cl-btn cl-btn--secondary text-xs py-1 px-2" onClick={addField}><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="cl-modal-footer">
                <button className="cl-btn cl-btn--secondary" onClick={cancel}>Cancel</button>
                <button className="cl-btn cl-btn--primary" onClick={save}><Check className="w-3.5 h-3.5" /> Save</button>
              </div>
            </div>
          ) : (
            /* List */
            <div className="space-y-1">
              {assetTypes.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                  <span className="text-lg">{t.icon}</span>
                  <span className="flex-1 text-sm font-medium text-text-primary">{t.name}</span>
                  <span className="text-xs text-text-muted">{t.fields.length} fields</span>
                  <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                  <button className="p-1 text-text-muted hover:text-accent" onClick={() => startEdit(t)}><Pencil className="w-3.5 h-3.5" /></button>
                  {!t.builtIn && (
                    <button className="p-1 text-text-muted hover:text-red-500" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              <button className="am-tree-add mt-2" onClick={startNew}>
                <Plus className="w-3.5 h-3.5" /> New CmdbItem Type
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
