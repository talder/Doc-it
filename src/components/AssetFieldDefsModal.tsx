"use client";

import { useState } from "react";
import { X, Plus, Trash2, Pencil } from "lucide-react";
import type { CustomFieldDef, CustomFieldType } from "@/lib/assets";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
  { value: "select", label: "Dropdown" },
  { value: "url", label: "URL" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fieldDefs: CustomFieldDef[];
  onAdd: (name: string, type: CustomFieldType, options?: string[]) => Promise<void>;
  onUpdate: (id: string, name: string, type: CustomFieldType, options?: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function AssetFieldDefsModal({ isOpen, onClose, fieldDefs, onAdd, onUpdate, onDelete }: Props) {
  const [addMode, setAddMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");

  if (!isOpen) return null;

  const resetForm = () => { setName(""); setType("text"); setOptions(""); setAddMode(false); setEditId(null); };

  const startEdit = (d: CustomFieldDef) => {
    setEditId(d.id);
    setName(d.name);
    setType(d.type);
    setOptions(d.options?.join(", ") || "");
    setAddMode(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const opts = type === "select" ? options.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    if (editId) {
      await onUpdate(editId, name.trim(), type, opts);
    } else {
      await onAdd(name.trim(), type, opts);
    }
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this custom field? Values will be removed from all assets.")) return;
    await onDelete(id);
    if (editId === id) resetForm();
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Custom Fields</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          {/* Existing fields */}
          {fieldDefs.length === 0 && !addMode && (
            <p className="text-sm text-text-muted mb-3">No custom fields defined yet.</p>
          )}
          {fieldDefs.map((d) => (
            <div key={d.id} className="am-fd-row">
              <div className="am-fd-info">
                <span className="am-fd-name">{d.name}</span>
                <span className="am-fd-type">{FIELD_TYPES.find((t) => t.value === d.type)?.label || d.type}</span>
                {d.options && d.options.length > 0 && (
                  <span className="am-fd-opts">{d.options.join(", ")}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button className="cl-modal-close" onClick={() => startEdit(d)}><Pencil className="w-3.5 h-3.5" /></button>
                <button className="cl-modal-close" onClick={() => handleDelete(d.id)}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}

          {/* Add / Edit form */}
          {(addMode || editId) && (
            <div className="am-fd-form">
              <div className="cl-form-grid" style={{ gap: 10 }}>
                <div className="cl-field">
                  <label className="cl-label">Field name *</label>
                  <input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Serial Number" autoFocus />
                </div>
                <div className="cl-field">
                  <label className="cl-label">Type *</label>
                  <select className="cl-input" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
                    {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {type === "select" && (
                  <div className="cl-field cl-field--full">
                    <label className="cl-label">Options (comma-separated) *</label>
                    <input className="cl-input" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Option 1, Option 2, Option 3" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="cl-btn cl-btn--primary" disabled={!name.trim()} onClick={handleSave}>
                  {editId ? "Update" : "Add Field"}
                </button>
                <button className="cl-btn cl-btn--secondary" onClick={resetForm}>Cancel</button>
              </div>
            </div>
          )}

          {!addMode && !editId && (
            <button className="cl-btn cl-btn--secondary mt-3" onClick={() => { resetForm(); setAddMode(true); }}>
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Add Custom Field
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
