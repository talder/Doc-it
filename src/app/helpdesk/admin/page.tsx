"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headset, Plus, Pencil, Trash2, Users, Tag, ListChecks, FileText, Zap, Clock, Layout } from "lucide-react";
import type { HdGroup, HdCategory, HdFieldDef, HdForm, HdRule, SlaPolicy, HdPortalPage, HdFieldType, HelpdeskConfig } from "@/lib/helpdesk";
import FormDesigner from "@/components/helpdesk/FormDesigner";
import RuleEditor from "@/components/helpdesk/RuleEditor";
import SlaEditor from "@/components/helpdesk/SlaEditor";
import PortalPageDesigner from "@/components/helpdesk/PortalPageDesigner";

const TABS = [
  { key: "groups",     label: "Groups",        icon: Users },
  { key: "categories", label: "Categories",    icon: Tag },
  { key: "fields",     label: "Custom Fields", icon: ListChecks },
  { key: "forms",      label: "Forms",         icon: FileText },
  { key: "rules",      label: "Rules",         icon: Zap },
  { key: "sla",        label: "SLA",           icon: Clock },
  { key: "portal",     label: "Portal Pages",  icon: Layout },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const FIELD_TYPES: HdFieldType[] = ["text", "number", "date", "boolean", "select", "multiselect", "textarea", "url", "email"];

export default function HelpdeskAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("groups");
  const [config, setConfig] = useState<HelpdeskConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/helpdesk/admin");
      if (res.ok) setConfig(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const post = async (body: Record<string, unknown>) => {
    await fetch("/api/helpdesk/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await fetchConfig();
  };

  return (
    <div className="jp-root">
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/helpdesk")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Headset className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Helpdesk Admin</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="hd-admin-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={`hd-admin-tab${tab === t.key ? " hd-admin-tab--active" : ""}`} onClick={() => setTab(t.key)}>
              <Icon className="w-3.5 h-3.5 inline mr-1" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="hd-admin-content">
        {loading || !config ? (
          <div className="jp-empty">Loading…</div>
        ) : (
          <>
            {tab === "groups" && <GroupEditor groups={config.groups} post={post} />}
            {tab === "categories" && <CategoryEditor categories={config.categories} post={post} />}
            {tab === "fields" && <FieldDefEditor fieldDefs={config.fieldDefs} post={post} />}
            {tab === "forms" && <FormDesigner forms={config.forms} fieldDefs={config.fieldDefs} post={post} />}
            {tab === "rules" && <RuleEditor rules={config.rules} groups={config.groups} categories={config.categories} post={post} />}
            {tab === "sla" && <SlaEditor policies={config.slaPolicies} post={post} />}
            {tab === "portal" && <PortalPageDesigner pages={config.portalPages} post={post} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Group Editor
   ═══════════════════════════════════════════════════════════ */

function GroupEditor({ groups, post }: { groups: HdGroup[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<HdGroup | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [members, setMembers] = useState("");
  const [email, setEmail] = useState("");

  const startEdit = (g: HdGroup | null) => {
    setEditing(g);
    setName(g?.name || "");
    setDesc(g?.description || "");
    setMembers(g?.members.join(", ") || "");
    setEmail(g?.email || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    const memArr = members.split(",").map((s) => s.trim()).filter(Boolean);
    if (editing?.id) {
      await post({ action: "updateGroup", id: editing.id, name, description: desc, members: memArr, email: email || undefined });
    } else {
      await post({ action: "createGroup", name, description: desc, members: memArr, email: email || undefined });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Support Groups ({groups.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as HdGroup)}><Plus className="w-3 h-3" /> New Group</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <h2 className="cl-modal-title">{editing.id ? "Edit Group" : "New Group"}</h2>
            </div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Description</label><input className="cl-input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Members (comma separated usernames)</label><input className="cl-input" value={members} onChange={(e) => setMembers(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Email (optional)</label><input className="cl-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {groups.length === 0 && <p className="text-sm text-text-muted">No groups defined yet</p>}
      {groups.map((g) => (
        <div key={g.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{g.name}</div>
            <div className="hd-editor-desc">{g.description || "—"}</div>
            <div className="hd-editor-meta">{g.members.length} member{g.members.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(g)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete group "${g.name}"?`)) post({ action: "deleteGroup", id: g.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Category Editor
   ═══════════════════════════════════════════════════════════ */

function CategoryEditor({ categories, post }: { categories: HdCategory[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<HdCategory | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const startEdit = (c: HdCategory | null) => {
    setEditing(c);
    setName(c?.name || "");
    setDesc(c?.description || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    if (editing?.id) {
      await post({ action: "updateCategory", id: editing.id, name, description: desc });
    } else {
      await post({ action: "createCategory", name, description: desc });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Categories ({categories.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as HdCategory)}><Plus className="w-3 h-3" /> New Category</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Category" : "New Category"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Description</label><input className="cl-input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {categories.length === 0 && <p className="text-sm text-text-muted">No categories defined yet</p>}
      {categories.map((c) => (
        <div key={c.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{c.name}</div>
            <div className="hd-editor-desc">{c.description || "—"}</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(c)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete category "${c.name}"?`)) post({ action: "deleteCategory", id: c.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Field Definition Editor
   ═══════════════════════════════════════════════════════════ */

function FieldDefEditor({ fieldDefs, post }: { fieldDefs: HdFieldDef[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<HdFieldDef | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<HdFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [placeholder, setPlaceholder] = useState("");

  const startEdit = (d: HdFieldDef | null) => {
    setEditing(d);
    setName(d?.name || "");
    setType(d?.type || "text");
    setRequired(d?.required || false);
    setOptions(d?.options?.join(", ") || "");
    setPlaceholder(d?.placeholder || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    const opts = (type === "select" || type === "multiselect") ? options.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    if (editing?.id) {
      await post({ action: "updateFieldDef", id: editing.id, name, type, required, options: opts, placeholder: placeholder || undefined, order: editing.order });
    } else {
      await post({ action: "createFieldDef", name, type, required, options: opts, placeholder: placeholder || undefined, order: fieldDefs.length });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Custom Fields ({fieldDefs.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as HdFieldDef)}><Plus className="w-3 h-3" /> New Field</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Field" : "New Field"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="cl-field mt-2">
                <label className="cl-label">Type</label>
                <select className="cl-input" value={type} onChange={(e) => setType(e.target.value as HdFieldType)}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {(type === "select" || type === "multiselect") && (
                <div className="cl-field mt-2"><label className="cl-label">Options (comma separated)</label><input className="cl-input" value={options} onChange={(e) => setOptions(e.target.value)} /></div>
              )}
              <div className="cl-field mt-2"><label className="cl-label">Placeholder</label><input className="cl-input" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} /></div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} id="fd-req" />
                <label htmlFor="fd-req" className="text-sm text-text-secondary">Required</label>
              </div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {fieldDefs.length === 0 && <p className="text-sm text-text-muted">No custom fields defined yet</p>}
      {fieldDefs.map((d) => (
        <div key={d.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{d.name} {d.required && <span className="text-xs text-red-500">*</span>}</div>
            <div className="hd-editor-desc">{d.type}{d.options ? ` (${d.options.length} options)` : ""}</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(d)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete field "${d.name}"?`)) post({ action: "deleteFieldDef", id: d.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

