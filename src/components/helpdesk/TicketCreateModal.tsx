"use client";

import { useEffect, useRef, useState } from "react";
import { X, Paperclip, Monitor } from "lucide-react";
import type { HdCategory, HdGroup, HdFieldDef, HdForm, TicketPriority, TicketAttachment } from "@/lib/helpdesk";

const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: HdCategory[];
  groups: HdGroup[];
  fieldDefs: HdFieldDef[];
  forms: HdForm[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function TicketCreateModal({ isOpen, onClose, categories, groups, fieldDefs, forms, onSave }: TicketCreateModalProps) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [category, setCategory] = useState("");
  const [assignedGroup, setAssignedGroup] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assetId, setAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<{ id: string; name: string }[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string | number | boolean | string[]>>({});
  const [tags, setTags] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubject(""); setDescription(""); setPriority("Medium"); setCategory("");
      setAssignedGroup(""); setAssignedTo(""); setAssetId(""); setAssetSearch("");
      setAssetResults([]); setCustomFields({}); setTags(""); setAttachments([]);
      setSaving(false); setSelectedFormId(forms.find((f) => f.isDefault)?.id || "");
    }
  }, [isOpen, forms]);

  // CmdbItem search
  useEffect(() => {
    if (assetSearch.length < 2) { setAssetResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/cmdb?q=${encodeURIComponent(assetSearch)}`)
        .then((r) => r.ok ? r.json() : { assets: [] })
        .then((d) => setAssetResults((d.assets || []).slice(0, 6)))
        .catch(() => setAssetResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [assetSearch]);

  if (!isOpen) return null;

  const selectedForm = forms.find((f) => f.id === selectedFormId);
  const groupMembers = assignedGroup
    ? groups.find((g) => g.id === assignedGroup)?.members || []
    : [];

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/helpdesk/attachments", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, data]);
      }
    } catch {}
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    await onSave({
      action: "createTicket",
      subject, description, priority, category, assignedGroup: assignedGroup || undefined,
      assignedTo: assignedTo || undefined, assetId: assetId || undefined,
      formId: selectedFormId || undefined, customFields,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      attachments,
    });
    setSaving(false);
    onClose();
  };

  const setCustomField = (id: string, value: string | number | boolean | string[]) => {
    setCustomFields((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">New Ticket</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Form selector */}
          {forms.length > 1 && (
            <div className="cl-field" style={{ marginBottom: 14 }}>
              <label className="cl-label">Form</label>
              <select className="cl-input" value={selectedFormId} onChange={(e) => setSelectedFormId(e.target.value)}>
                {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          <div className="cl-form-grid">
            {/* Subject */}
            <div className="cl-field cl-field--full">
              <label className="cl-label">Subject *</label>
              <input className="cl-input" placeholder="Brief summary of the issue" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            {/* Description */}
            <div className="cl-field cl-field--full">
              <label className="cl-label">Description</label>
              <textarea className="cl-textarea" rows={4} placeholder="Detailed description..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* Priority */}
            <div className="cl-field">
              <label className="cl-label">Priority</label>
              <select className="cl-input" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Category */}
            <div className="cl-field">
              <label className="cl-label">Category</label>
              <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— None —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Assigned group */}
            <div className="cl-field">
              <label className="cl-label">Assign to Group</label>
              <select className="cl-input" value={assignedGroup} onChange={(e) => { setAssignedGroup(e.target.value); setAssignedTo(""); }}>
                <option value="">— Unassigned —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            {/* Assigned person */}
            <div className="cl-field">
              <label className="cl-label">Assign to Person</label>
              <select className="cl-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {groupMembers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* CmdbItem picker */}
            <div className="cl-field cl-field--full relative">
              <label className="cl-label">Linked CmdbItem</label>
              <div className="flex items-center gap-2">
                <input
                  className="cl-input" placeholder="Search assets..."
                  value={assetSearch} onChange={(e) => { setAssetSearch(e.target.value); if (!e.target.value) setAssetId(""); }}
                />
                {assetId && <Monitor className="w-4 h-4 text-accent flex-shrink-0" />}
              </div>
              {assetResults.length > 0 && (
                <div className="cl-suggest">
                  {assetResults.map((a) => (
                    <button key={a.id} className="cl-suggest-item" onClick={() => { setAssetId(a.id); setAssetSearch(a.name); setAssetResults([]); }}>{a.name} ({a.id})</button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="cl-field cl-field--full">
              <label className="cl-label">Tags (comma separated)</label>
              <input className="cl-input" placeholder="e.g. urgent, vpn, network" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>

            {/* Dynamic custom fields from selected form or all field defs */}
            {(selectedForm
              ? selectedForm.fields.filter((f) => f.fieldDefId).map((ff) => ({ formField: ff, def: fieldDefs.find((d) => d.id === ff.fieldDefId) })).filter((x) => x.def)
              : fieldDefs.map((d) => ({ formField: null, def: d }))
            ).map(({ formField, def }) => {
              if (!def) return null;
              const label = formField?.label || def.name;
              const required = formField?.required ?? def.required;
              const val = customFields[def.id] ?? def.defaultValue ?? "";
              const width = formField?.width === "half" ? "" : "cl-field--full";

              return (
                <div key={def.id} className={`cl-field ${width}`}>
                  <label className="cl-label">{label}{required ? " *" : ""}</label>
                  {def.type === "textarea" ? (
                    <textarea className="cl-textarea" rows={2} value={String(val)} onChange={(e) => setCustomField(def.id, e.target.value)} />
                  ) : def.type === "select" ? (
                    <select className="cl-input" value={String(val)} onChange={(e) => setCustomField(def.id, e.target.value)}>
                      <option value="">— Select —</option>
                      {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : def.type === "boolean" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!val} onChange={(e) => setCustomField(def.id, e.target.checked)} />
                      {label}
                    </label>
                  ) : (
                    <input
                      className="cl-input"
                      type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "email" ? "email" : def.type === "url" ? "url" : "text"}
                      placeholder={def.placeholder}
                      value={String(val)}
                      onChange={(e) => setCustomField(def.id, def.type === "number" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                  {formField?.helpText && <span className="text-xs text-text-muted">{formField.helpText}</span>}
                </div>
              );
            })}
          </div>

          {/* Attachments */}
          <div style={{ marginTop: 14 }}>
            <label className="cl-label">Attachments</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {attachments.map((a) => (
                <span key={a.id} className="hd-attach-chip">
                  {a.originalName}
                  <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="ml-1 text-text-muted hover:text-red-500">&times;</button>
                </span>
              ))}
              <button className="hd-attach-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Paperclip className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Add file"}
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>

          {/* Footer */}
          <div className="cl-modal-footer">
            <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cl-btn cl-btn--primary" disabled={!subject.trim() || saving} onClick={handleSubmit}>
              {saving ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
