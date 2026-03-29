"use client";

import { useState } from "react";
import { X, Plus, Trash2, Pencil, ChevronDown, ChevronRight, MapPin, Check } from "lucide-react";
import type { Location, LocationType } from "@/lib/cmdb";

const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "site", label: "Site" },
  { value: "building", label: "Building" },
  { value: "floor", label: "Floor" },
  { value: "room", label: "Room" },
  { value: "rack", label: "Rack" },
  { value: "slot", label: "Slot" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locations: Location[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function LocationTreeModal({ isOpen, onClose, locations, onSave }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "site" as LocationType, parentId: null as string | null });
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startNew = (parentId: string | null) => {
    const parentType = parentId ? locations.find((l) => l.id === parentId)?.type : null;
    const typeIdx = parentType ? LOCATION_TYPES.findIndex((t) => t.value === parentType) + 1 : 0;
    setEditingId("__new__");
    setForm({ name: "", type: LOCATION_TYPES[Math.min(typeIdx, LOCATION_TYPES.length - 1)].value, parentId });
    setError("");
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setForm({ name: loc.name, type: loc.type, parentId: loc.parentId });
    setError("");
  };

  const cancel = () => { setEditingId(null); setError(""); };

  const save = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setError("");
    if (editingId === "__new__") {
      await onSave({ action: "createLocation", name: form.name.trim(), type: form.type, parentId: form.parentId });
    } else {
      await onSave({ action: "updateLocation", id: editingId, name: form.name.trim(), type: form.type, parentId: form.parentId });
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    await onSave({ action: "deleteLocation", id });
  };

  const rootLocations = locations.filter((l) => l.parentId === null).sort((a, b) => a.order - b.order);

  const TreeNode = ({ loc, depth }: { loc: Location; depth: number }) => {
    const children = locations.filter((l) => l.parentId === loc.id).sort((a, b) => a.order - b.order);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(loc.id);
    const isEditing = editingId === loc.id;

    return (
      <>
        <div className="flex items-center gap-1 py-1 hover:bg-muted rounded px-1 group" style={{ paddingLeft: 8 + depth * 20 }}>
          <button className="w-4 h-4 flex-shrink-0" onClick={() => toggleExpand(loc.id)}>
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />) : <span className="w-3.5" />}
          </button>
          <MapPin className="w-3 h-3 text-text-muted flex-shrink-0" />
          {isEditing ? (
            <div className="flex gap-1 flex-1">
              <input className="cl-input text-xs flex-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }} autoFocus />
              <select className="cl-input text-xs" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LocationType })} style={{ width: 90 }}>
                {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="p-1 text-accent" onClick={save}><Check className="w-3.5 h-3.5" /></button>
              <button className="p-1 text-text-muted" onClick={cancel}><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <span className="text-sm text-text-primary flex-1">{loc.name}</span>
              <span className="text-[10px] text-text-muted capitalize">{loc.type}</span>
              <button className="p-0.5 text-text-muted hover:text-accent opacity-0 group-hover:opacity-100" onClick={() => startEdit(loc)}><Pencil className="w-3 h-3" /></button>
              <button className="p-0.5 text-text-muted hover:text-accent opacity-0 group-hover:opacity-100" onClick={() => startNew(loc.id)} title="Add child"><Plus className="w-3 h-3" /></button>
              <button className="p-0.5 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(loc.id)}><Trash2 className="w-3 h-3" /></button>
            </>
          )}
        </div>
        {isExpanded && children.map((child) => <TreeNode key={child.id} loc={child} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Locations</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {locations.length === 0 && editingId !== "__new__" && (
            <p className="text-sm text-text-muted italic mb-3">No locations defined yet. Add your first site to get started.</p>
          )}

          {rootLocations.map((loc) => <TreeNode key={loc.id} loc={loc} depth={0} />)}

          {editingId === "__new__" && (
            <div className="flex gap-1 mt-2 items-center">
              <MapPin className="w-3 h-3 text-text-muted flex-shrink-0" />
              <input className="cl-input text-xs flex-1" placeholder="Location name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }} autoFocus />
              <select className="cl-input text-xs" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LocationType })} style={{ width: 90 }}>
                {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="p-1 text-accent" onClick={save}><Check className="w-3.5 h-3.5" /></button>
              <button className="p-1 text-text-muted" onClick={cancel}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

          {editingId !== "__new__" && (
            <button className="am-tree-add mt-2" onClick={() => startNew(null)}>
              <Plus className="w-3.5 h-3.5" /> New Location
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
