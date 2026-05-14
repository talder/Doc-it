"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headset, Plus, Pencil, Trash2, Users, Tag, ListChecks, FileText, Zap, Clock, Layout, Copy, Filter, Shield, BarChart3, Plug, AlertOctagon, MessageSquare, Building, ShoppingCart, RefreshCw, Bell } from "lucide-react";
import type { HdGroup, HdCategory, HdFieldDef, HdForm, HdRule, SlaPolicy, HdPortalPage, HdFieldType, HelpdeskConfig, SavedFilter, TicketTemplate, SupportContract, ScheduledReport, PriorityMatrixEntry, TicketPriority, ImpactLevel, HdNotificationEvent, EscalationRule, EscalationTrigger, ReplyTemplate, HelpdeskOrg, ServiceCatalogItem, RecurringTicketDef, HdNotificationTemplate } from "@/lib/helpdesk";
import FormDesigner from "@/components/helpdesk/FormDesigner";
import RuleEditor from "@/components/helpdesk/RuleEditor";
import SlaEditor from "@/components/helpdesk/SlaEditor";
import PortalPageDesigner from "@/components/helpdesk/PortalPageDesigner";

const TABS = [
  { key: "groups",       label: "Groups",         icon: Users },
  { key: "categories",   label: "Categories",     icon: Tag },
  { key: "fields",       label: "Custom Fields",  icon: ListChecks },
  { key: "forms",        label: "Forms",          icon: FileText },
  { key: "rules",        label: "Rules",          icon: Zap },
  { key: "sla",          label: "SLA",            icon: Clock },
  { key: "escalations",  label: "Escalations",    icon: AlertOctagon },
  { key: "portal",       label: "Portal Pages",   icon: Layout },
  { key: "templates",    label: "Templates",      icon: Copy },
  { key: "replies",      label: "Reply Templates", icon: MessageSquare },
  { key: "orgs",         label: "Organizations",  icon: Building },
  { key: "catalog",      label: "Service Catalog", icon: ShoppingCart },
  { key: "recurring",    label: "Recurring",      icon: RefreshCw },
  { key: "notifications",label: "Notifications",  icon: Bell },
  { key: "filters",      label: "Saved Filters",  icon: Filter },
  { key: "contracts",    label: "Contracts",      icon: Shield },
  { key: "reports",      label: "Reports",        icon: BarChart3 },
  { key: "integrations", label: "Integrations",   icon: Plug },
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
            {tab === "escalations" && <EscalationRuleEditor rules={config.escalationRules ?? []} post={post} />}
            {tab === "templates" && <TicketTemplateEditor templates={config.ticketTemplates ?? []} categories={config.categories} groups={config.groups} post={post} />}
            {tab === "replies" && <ReplyTemplateEditor templates={config.replyTemplates ?? []} post={post} />}
            {tab === "orgs" && <OrganizationEditor orgs={config.organizations ?? []} groups={config.groups} slaPolicies={config.slaPolicies} post={post} />}
            {tab === "catalog" && <CatalogItemEditor items={config.catalogItems ?? []} categories={config.categories} groups={config.groups} slaPolicies={config.slaPolicies} post={post} />}
            {tab === "recurring" && <RecurringTicketEditor defs={config.recurringTickets ?? []} post={post} />}
            {tab === "notifications" && <NotificationTemplateEditor templates={config.notificationTemplates ?? []} post={post} />}
            {tab === "filters" && <SavedFilterEditor filters={config.savedFilters ?? []} post={post} />}
            {tab === "contracts" && <ContractEditor contracts={config.contracts ?? []} post={post} />}
            {tab === "reports" && <ScheduledReportEditor reports={config.scheduledReports ?? []} post={post} />}
            {tab === "integrations" && <IntegrationsPanel config={config} post={post} />}
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

/* ═══════════════════════════════════════════════════════════
   Ticket Template Editor
   ═══════════════════════════════════════════════════════════ */

function TicketTemplateEditor({ templates, categories, groups, post }: { templates: TicketTemplate[]; categories: HdCategory[]; groups: HdGroup[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<TicketTemplate | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [subject, setSubject] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [category, setCategory] = useState("");
  const [assignedGroup, setAssignedGroup] = useState("");
  const [tplTags, setTplTags] = useState("");

  const startEdit = (t: TicketTemplate | null) => {
    setEditing(t);
    setName(t?.name || "");
    setDesc(t?.description || "");
    setSubject(t?.subject || "");
    setTplBody(t?.body || "");
    setPriority(t?.priority || "");
    setCategory(t?.category || "");
    setAssignedGroup(t?.assignedGroup || "");
    setTplTags(t?.tags?.join(", ") || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    const tags = tplTags.split(",").map((s) => s.trim()).filter(Boolean);
    if (editing?.id) {
      await post({ action: "updateTicketTemplate", id: editing.id, name, description: desc, subject, body: tplBody, priority: priority || undefined, category: category || undefined, assignedGroup: assignedGroup || undefined, tags });
    } else {
      await post({ action: "createTicketTemplate", name, description: desc, subject, templateBody: tplBody, priority: priority || undefined, category: category || undefined, assignedGroup: assignedGroup || undefined, tags, order: templates.length });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Ticket Templates ({templates.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as TicketTemplate)}><Plus className="w-3 h-3" /> New Template</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Template" : "New Template"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Description</label><input className="cl-input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Default Subject</label><input className="cl-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Default Body</label><textarea className="cl-textarea" rows={3} value={tplBody} onChange={(e) => setTplBody(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Priority</label>
                <select className="cl-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="">— Default —</option>
                  {(["Low", "Medium", "High", "Critical"] as TicketPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Category</label>
                <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Assigned Group</label>
                <select className="cl-input" value={assignedGroup} onChange={(e) => setAssignedGroup(e.target.value)}>
                  <option value="">— None —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Tags (comma separated)</label><input className="cl-input" value={tplTags} onChange={(e) => setTplTags(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {templates.length === 0 && <p className="text-sm text-text-muted">No ticket templates defined yet</p>}
      {templates.map((t) => (
        <div key={t.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{t.name}</div>
            <div className="hd-editor-desc">{t.description || "—"}</div>
            {t.subject && <div className="hd-editor-meta">Subject: {t.subject}</div>}
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(t)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) post({ action: "deleteTicketTemplate", id: t.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Saved Filter Editor
   ═══════════════════════════════════════════════════════════ */

function SavedFilterEditor({ filters, post }: { filters: SavedFilter[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<SavedFilter | null>(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fCategory, setFCategory] = useState("");

  const startEdit = (f: SavedFilter | null) => {
    setEditing(f);
    setName(f?.name || "");
    setShared(f?.shared || false);
    setFStatus(f?.filters?.status || "");
    setFPriority(f?.filters?.priority || "");
    setFAssignee(f?.filters?.assignedTo || "");
    setFCategory(f?.filters?.category || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    const filterObj: Record<string, string> = {};
    if (fStatus) filterObj.status = fStatus;
    if (fPriority) filterObj.priority = fPriority;
    if (fAssignee) filterObj.assignedTo = fAssignee;
    if (fCategory) filterObj.category = fCategory;
    if (editing?.id) {
      await post({ action: "updateSavedFilter", id: editing.id, name, shared, filters: filterObj });
    } else {
      await post({ action: "createSavedFilter", name, shared, filters: filterObj });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Saved Filters ({filters.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as SavedFilter)}><Plus className="w-3 h-3" /> New Filter</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Filter" : "New Filter"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} id="sf-shared" />
                <label htmlFor="sf-shared" className="text-sm text-text-secondary">Shared with all agents</label>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Status</label>
                <select className="cl-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">Any</option>
                  {(["Open", "In Progress", "Waiting", "Resolved", "Closed"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Priority</label>
                <select className="cl-input" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
                  <option value="">Any</option>
                  {(["Low", "Medium", "High", "Critical"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Assignee (username)</label><input className="cl-input" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Category ID</label><input className="cl-input" value={fCategory} onChange={(e) => setFCategory(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {filters.length === 0 && <p className="text-sm text-text-muted">No saved filters defined yet</p>}
      {filters.map((f) => (
        <div key={f.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{f.name} {f.shared && <span className="text-xs text-accent">(Shared)</span>}</div>
            <div className="hd-editor-desc">Owner: {f.owner} &bull; {Object.keys(f.filters || {}).length} filter(s)</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(f)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete filter "${f.name}"?`)) post({ action: "deleteSavedFilter", id: f.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Contract Editor
   ═══════════════════════════════════════════════════════════ */

function ContractEditor({ contracts, post }: { contracts: SupportContract[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<SupportContract | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxTickets, setMaxTickets] = useState(0);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  const startEdit = (c: SupportContract | null) => {
    setEditing(c);
    setName(c?.name || "");
    setStartDate(c?.startDate || new Date().toISOString().slice(0, 10));
    setEndDate(c?.endDate || "");
    setMaxTickets(c?.maxTickets || 0);
    setNotes(c?.notes || "");
    setActive(c?.active !== false);
  };

  const save = async () => {
    if (!name.trim()) return;
    if (editing?.id) {
      await post({ action: "updateContract", id: editing.id, name, startDate, endDate, maxTickets, notes, active });
    } else {
      await post({ action: "createContract", name, startDate, endDate, maxTickets, notes, active });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Support Contracts ({contracts.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as SupportContract)}><Plus className="w-3 h-3" /> New Contract</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Contract" : "New Contract"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Start Date</label><input className="cl-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">End Date</label><input className="cl-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Max Tickets (0 = unlimited)</label><input className="cl-input" type="number" value={maxTickets} onChange={(e) => setMaxTickets(Number(e.target.value))} /></div>
              <div className="cl-field mt-2"><label className="cl-label">Notes</label><textarea className="cl-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="ct-active" />
                <label htmlFor="ct-active" className="text-sm text-text-secondary">Active</label>
              </div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {contracts.length === 0 && <p className="text-sm text-text-muted">No contracts defined yet</p>}
      {contracts.map((c) => (
        <div key={c.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{c.name} {!c.active && <span className="text-xs text-text-muted">(Inactive)</span>}</div>
            <div className="hd-editor-desc">{c.startDate} — {c.endDate || "No end"} &bull; Max: {c.maxTickets || "∞"} tickets</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(c)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete contract "${c.name}"?`)) post({ action: "deleteContract", id: c.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Scheduled Report Editor
   ═══════════════════════════════════════════════════════════ */

function ScheduledReportEditor({ reports, post }: { reports: ScheduledReport[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "monthly">("daily");
  const [time, setTime] = useState("08:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipients, setRecipients] = useState("");

  const startEdit = (r: ScheduledReport | null) => {
    setEditing(r);
    setName(r?.name || "");
    setEnabled(r?.enabled !== false);
    setSchedule(r?.schedule || "daily");
    setTime(r?.time || "08:00");
    setDayOfWeek(r?.dayOfWeek ?? 1);
    setDayOfMonth(r?.dayOfMonth ?? 1);
    setRecipients(r?.recipients?.join(", ") || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    const rcpts = recipients.split(",").map((s) => s.trim()).filter(Boolean);
    const base: Record<string, unknown> = { name, enabled, schedule, time, recipients: rcpts };
    if (schedule === "weekly") base.dayOfWeek = dayOfWeek;
    if (schedule === "monthly") base.dayOfMonth = dayOfMonth;
    if (editing?.id) {
      await post({ action: "updateScheduledReport", id: editing.id, ...base });
    } else {
      await post({ action: "createScheduledReport", ...base });
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Scheduled Reports ({reports.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as ScheduledReport)}><Plus className="w-3 h-3" /> New Report</button>
      </div>

      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit Report" : "New Report"}</h2></div>
            <div className="cl-modal-body">
              <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} id="rp-enabled" />
                <label htmlFor="rp-enabled" className="text-sm text-text-secondary">Enabled</label>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Schedule</label>
                <select className="cl-input" value={schedule} onChange={(e) => setSchedule(e.target.value as "daily" | "weekly" | "monthly")}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="cl-field mt-2"><label className="cl-label">Time</label><input className="cl-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
              {schedule === "weekly" && (
                <div className="cl-field mt-2"><label className="cl-label">Day of Week</label>
                  <select className="cl-input" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {schedule === "monthly" && (
                <div className="cl-field mt-2"><label className="cl-label">Day of Month</label><input className="cl-input" type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} /></div>
              )}
              <div className="cl-field mt-2"><label className="cl-label">Recipients (comma separated emails)</label><input className="cl-input" value={recipients} onChange={(e) => setRecipients(e.target.value)} /></div>
            </div>
            <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {reports.length === 0 && <p className="text-sm text-text-muted">No scheduled reports defined yet</p>}
      {reports.map((r) => (
        <div key={r.id} className="hd-editor-row">
          <div className="flex-1">
            <div className="hd-editor-name">{r.name} {!r.enabled && <span className="text-xs text-text-muted">(Disabled)</span>}</div>
            <div className="hd-editor-desc">{r.schedule} at {r.time} &bull; {r.recipients.length} recipient(s){r.lastSentAt ? ` • Last: ${new Date(r.lastSentAt).toLocaleDateString()}` : ""}</div>
          </div>
          <div className="hd-editor-actions">
            <button className="hd-editor-btn" onClick={() => startEdit(r)}><Pencil className="w-3 h-3" /></button>
            <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete report "${r.name}"?`)) post({ action: "deleteScheduledReport", id: r.id }); }}><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Integrations Panel (Slack, LDAP, CSAT, Priority Matrix)
   ═══════════════════════════════════════════════════════════ */

function IntegrationsPanel({ config, post }: { config: HelpdeskConfig; post: (b: Record<string, unknown>) => Promise<void> }) {
  // IMAP (email-to-ticket)
  const [imapEnabled, setImapEnabled] = useState(config.imapConfig?.enabled || false);
  const [imapHost, setImapHost] = useState(config.imapConfig?.host || "");
  const [imapPort, setImapPort] = useState(config.imapConfig?.port || 993);
  const [imapTls, setImapTls] = useState(config.imapConfig?.tls ?? true);
  const [imapUser, setImapUser] = useState(config.imapConfig?.user || "");
  const [imapPass, setImapPass] = useState("");
  const [imapFolder, setImapFolder] = useState(config.imapConfig?.folder || "INBOX");
  const [imapPoll, setImapPoll] = useState(config.imapConfig?.pollIntervalSec || 60);
  // Slack
  const [slackEnabled, setSlackEnabled] = useState(config.slackConfig?.enabled || false);
  const [slackWebhook, setSlackWebhook] = useState(config.slackConfig?.webhookUrl || "");
  const [slackChannel, setSlackChannel] = useState(config.slackConfig?.channel || "");
  const [slackEvents, setSlackEvents] = useState<string[]>(config.slackConfig?.events || []);
  // LDAP
  const [ldapEnabled, setLdapEnabled] = useState(config.ldapConfig?.enabled || false);
  const [ldapUrl, setLdapUrl] = useState(config.ldapConfig?.url || "");
  const [ldapBindDn, setLdapBindDn] = useState(config.ldapConfig?.bindDn || "");
  const [ldapSearchBase, setLdapSearchBase] = useState(config.ldapConfig?.searchBase || "");
  const [ldapSearchFilter, setLdapSearchFilter] = useState(config.ldapConfig?.searchFilter || "(uid={{username}})");
  const [ldapUsernameAttr, setLdapUsernameAttr] = useState(config.ldapConfig?.usernameAttr || "uid");
  const [ldapEmailAttr, setLdapEmailAttr] = useState(config.ldapConfig?.emailAttr || "mail");
  const [ldapFullNameAttr, setLdapFullNameAttr] = useState(config.ldapConfig?.fullNameAttr || "cn");
  // CSAT
  const [csatEnabled, setCsatEnabled] = useState(config.csatEmailEnabled || false);
  // Priority Matrix
  const levels: ImpactLevel[] = ["critical", "high", "medium", "low"];
  const matrixPriorities: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
  const [matrix, setMatrix] = useState<Record<string, TicketPriority>>(() => {
    const m: Record<string, TicketPriority> = {};
    for (const entry of config.priorityMatrix || []) m[`${entry.impact}-${entry.urgency}`] = entry.priority;
    return m;
  });

  const allEvents: HdNotificationEvent[] = ["ticket_created", "ticket_assigned", "status_changed", "comment_added", "sla_warning", "sla_breached", "escalated", "approval_requested", "approval_decided"];

  const toggleSlackEvent = (ev: string) => setSlackEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  const saveImap = () => post({ action: "updateSettings", imapConfig: { enabled: imapEnabled, host: imapHost, port: imapPort, tls: imapTls, user: imapUser, passEncrypted: imapPass || config.imapConfig?.passEncrypted || "", folder: imapFolder, pollIntervalSec: imapPoll } });
  const saveSlack = () => post({ action: "updateSettings", slackConfig: { enabled: slackEnabled, webhookUrl: slackWebhook, channel: slackChannel || undefined, events: slackEvents } });
  const saveLdap = () => post({ action: "updateSettings", ldapConfig: { enabled: ldapEnabled, url: ldapUrl, bindDn: ldapBindDn, bindPasswordEncrypted: config.ldapConfig?.bindPasswordEncrypted || "", searchBase: ldapSearchBase, searchFilter: ldapSearchFilter, usernameAttr: ldapUsernameAttr, emailAttr: ldapEmailAttr, fullNameAttr: ldapFullNameAttr } });
  const saveCsat = () => post({ action: "updateSettings", csatEmailEnabled: csatEnabled });
  const saveMatrix = () => {
    const entries: PriorityMatrixEntry[] = [];
    for (const impact of levels) for (const urgency of levels) entries.push({ impact, urgency, priority: matrix[`${impact}-${urgency}`] || "Medium" });
    return post({ action: "updateSettings", priorityMatrix: entries });
  };

  return (
    <div className="space-y-6">
      {/* IMAP - Email-to-Ticket */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-2">Email-to-Ticket (IMAP)</h3>
        <p className="text-xs text-text-muted mb-2">Polls an IMAP mailbox for new emails and creates tickets automatically. Replies containing a ticket ID are added as comments.</p>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={imapEnabled} onChange={(e) => setImapEnabled(e.target.checked)} id="int-imap" />
          <label htmlFor="int-imap" className="text-sm text-text-secondary">Enable IMAP polling</label>
        </div>
        {imapEnabled && (
          <>
            <div className="cl-field"><label className="cl-label">IMAP Host</label><input className="cl-input" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" /></div>
            <div className="flex gap-4 mt-2">
              <div className="cl-field flex-1"><label className="cl-label">Port</label><input className="cl-input" type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} /></div>
              <div className="cl-field flex items-end gap-2 pb-1">
                <input type="checkbox" checked={imapTls} onChange={(e) => setImapTls(e.target.checked)} id="int-imap-tls" />
                <label htmlFor="int-imap-tls" className="text-sm text-text-secondary">TLS</label>
              </div>
            </div>
            <div className="cl-field mt-2"><label className="cl-label">Username</label><input className="cl-input" value={imapUser} onChange={(e) => setImapUser(e.target.value)} placeholder="helpdesk@example.com" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Password</label><input className="cl-input" type="password" value={imapPass} onChange={(e) => setImapPass(e.target.value)} placeholder={config.imapConfig?.passEncrypted ? "(encrypted — leave blank to keep)" : "Enter password"} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Folder</label><input className="cl-input" value={imapFolder} onChange={(e) => setImapFolder(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Poll Interval (seconds)</label><input className="cl-input" type="number" min={10} value={imapPoll} onChange={(e) => setImapPoll(Number(e.target.value))} /></div>
          </>
        )}
        <button className="cl-btn cl-btn--primary text-xs mt-2" onClick={saveImap}>Save IMAP</button>
      </div>

      <hr className="border-border" />

      {/* Slack */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-2">Slack Integration</h3>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={slackEnabled} onChange={(e) => setSlackEnabled(e.target.checked)} id="int-slack" />
          <label htmlFor="int-slack" className="text-sm text-text-secondary">Enable Slack notifications</label>
        </div>
        {slackEnabled && (
          <>
            <div className="cl-field"><label className="cl-label">Webhook URL</label><input className="cl-input" value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." /></div>
            <div className="cl-field mt-2"><label className="cl-label">Channel (optional)</label><input className="cl-input" value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} placeholder="#helpdesk" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Events</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {allEvents.map((ev) => (
                  <label key={ev} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={slackEvents.includes(ev)} onChange={() => toggleSlackEvent(ev)} />
                    {ev.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <button className="cl-btn cl-btn--primary text-xs mt-2" onClick={saveSlack}>Save Slack</button>
      </div>

      <hr className="border-border" />

      {/* LDAP */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-2">LDAP Portal Authentication</h3>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={ldapEnabled} onChange={(e) => setLdapEnabled(e.target.checked)} id="int-ldap" />
          <label htmlFor="int-ldap" className="text-sm text-text-secondary">Enable LDAP for portal login</label>
        </div>
        {ldapEnabled && (
          <>
            <div className="cl-field"><label className="cl-label">LDAP URL</label><input className="cl-input" value={ldapUrl} onChange={(e) => setLdapUrl(e.target.value)} placeholder="ldap://ldap.example.com:389" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Bind DN</label><input className="cl-input" value={ldapBindDn} onChange={(e) => setLdapBindDn(e.target.value)} placeholder="cn=admin,dc=example,dc=com" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Search Base</label><input className="cl-input" value={ldapSearchBase} onChange={(e) => setLdapSearchBase(e.target.value)} placeholder="ou=users,dc=example,dc=com" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Search Filter</label><input className="cl-input" value={ldapSearchFilter} onChange={(e) => setLdapSearchFilter(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Username Attribute</label><input className="cl-input" value={ldapUsernameAttr} onChange={(e) => setLdapUsernameAttr(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Email Attribute</label><input className="cl-input" value={ldapEmailAttr} onChange={(e) => setLdapEmailAttr(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Full Name Attribute</label><input className="cl-input" value={ldapFullNameAttr} onChange={(e) => setLdapFullNameAttr(e.target.value)} /></div>
          </>
        )}
        <button className="cl-btn cl-btn--primary text-xs mt-2" onClick={saveLdap}>Save LDAP</button>
      </div>

      <hr className="border-border" />

      {/* CSAT */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-2">Customer Satisfaction (CSAT)</h3>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={csatEnabled} onChange={(e) => setCsatEnabled(e.target.checked)} id="int-csat" />
          <label htmlFor="int-csat" className="text-sm text-text-secondary">Auto-send CSAT survey email when ticket is resolved</label>
        </div>
        <button className="cl-btn cl-btn--primary text-xs" onClick={saveCsat}>Save CSAT</button>
      </div>

      <hr className="border-border" />

      {/* Priority Matrix */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-2">Priority Matrix (Impact × Urgency)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4, 1fr)", gap: 4, fontSize: 12 }}>
          <div className="text-xs text-text-muted">Impact ↓ Urgency →</div>
          {levels.map((u) => <div key={u} className="text-center font-medium text-text-secondary capitalize">{u}</div>)}
          {levels.flatMap((impact) => [
            <div key={`lbl-${impact}`} className="font-medium text-text-secondary capitalize flex items-center">{impact}</div>,
            ...levels.map((urgency) => (
              <select
                key={`${impact}-${urgency}`}
                className="cl-input text-xs"
                value={matrix[`${impact}-${urgency}`] || "Medium"}
                onChange={(e) => setMatrix((prev) => ({ ...prev, [`${impact}-${urgency}`]: e.target.value as TicketPriority }))}
              >
                {matrixPriorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )),
          ])}
        </div>
        <button className="cl-btn cl-btn--primary text-xs mt-2" onClick={saveMatrix}>Save Matrix</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Escalation Rule Editor
   ═══════════════════════════════════════════════════════════ */

const ESC_TRIGGERS: { value: EscalationTrigger; label: string }[] = [
  { value: "sla_response_warning", label: "SLA Response Warning" },
  { value: "sla_response_breach", label: "SLA Response Breach" },
  { value: "sla_resolution_warning", label: "SLA Resolution Warning" },
  { value: "sla_resolution_breach", label: "SLA Resolution Breach" },
];

function EscalationRuleEditor({ rules, post }: { rules: EscalationRule[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<EscalationRule | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [trigger, setTrigger] = useState<EscalationTrigger>("sla_response_warning");
  const [warnMin, setWarnMin] = useState(15);

  const startEdit = (r: EscalationRule | null) => { setEditing(r); setName(r?.name || ""); setEnabled(r?.enabled !== false); setTrigger(r?.trigger || "sla_response_warning"); setWarnMin(r?.warningMinutesBefore ?? 15); };
  const save = async () => {
    if (!name.trim()) return;
    if (editing?.id) await post({ action: "updateEscalationRule", id: editing.id, name, enabled, trigger, warningMinutesBefore: warnMin });
    else await post({ action: "createEscalationRule", name, enabled, trigger, warningMinutesBefore: warnMin, actions: [], order: rules.length });
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Escalation Rules ({rules.length})</h3><button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as EscalationRule)}><Plus className="w-3 h-3" /> New Rule</button></div>
      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}><div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit" : "New"} Escalation Rule</h2></div>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="flex items-center gap-2 mt-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} id="esc-en" /><label htmlFor="esc-en" className="text-sm text-text-secondary">Enabled</label></div>
            <div className="cl-field mt-2"><label className="cl-label">Trigger</label><select className="cl-input" value={trigger} onChange={(e) => setTrigger(e.target.value as EscalationTrigger)}>{ESC_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">Warning Minutes Before</label><input className="cl-input" type="number" value={warnMin} onChange={(e) => setWarnMin(Number(e.target.value))} /></div>
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </div></div>
      )}
      {rules.length === 0 && <p className="text-sm text-text-muted">No escalation rules defined yet</p>}
      {rules.map((r) => (<div key={r.id} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{r.name} {!r.enabled && <span className="text-xs text-text-muted">(Disabled)</span>}</div><div className="hd-editor-desc">{ESC_TRIGGERS.find((t) => t.value === r.trigger)?.label} &bull; {r.warningMinutesBefore}min before</div></div><div className="hd-editor-actions"><button className="hd-editor-btn" onClick={() => startEdit(r)}><Pencil className="w-3 h-3" /></button><button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete "${r.name}"?`)) post({ action: "deleteEscalationRule", id: r.id }); }}><Trash2 className="w-3 h-3" /></button></div></div>))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Reply Template Editor
   ═══════════════════════════════════════════════════════════ */

function ReplyTemplateEditor({ templates, post }: { templates: ReplyTemplate[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<ReplyTemplate | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");

  const startEdit = (t: ReplyTemplate | null) => { setEditing(t); setName(t?.name || ""); setContent(t?.content || ""); setCategory(t?.category || ""); };
  const save = async () => {
    if (!name.trim()) return;
    if (editing?.id) await post({ action: "updateReplyTemplate", id: editing.id, name, content, category: category || undefined });
    else await post({ action: "createReplyTemplate", name, content, category: category || undefined });
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Reply Templates ({templates.length})</h3><button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as ReplyTemplate)}><Plus className="w-3 h-3" /> New Template</button></div>
      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}><div className="cl-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit" : "New"} Reply Template</h2></div>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Category (optional)</label><input className="cl-input" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Content *</label><textarea className="cl-textarea" rows={5} value={content} onChange={(e) => setContent(e.target.value)} /></div>
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </div></div>
      )}
      {templates.length === 0 && <p className="text-sm text-text-muted">No reply templates defined yet</p>}
      {templates.map((t) => (<div key={t.id} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{t.name}{t.category && <span className="text-xs text-text-muted ml-1">({t.category})</span>}</div><div className="hd-editor-desc">{t.content.slice(0, 80)}{t.content.length > 80 ? "…" : ""}</div></div><div className="hd-editor-actions"><button className="hd-editor-btn" onClick={() => startEdit(t)}><Pencil className="w-3 h-3" /></button><button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete "${t.name}"?`)) post({ action: "deleteReplyTemplate", id: t.id }); }}><Trash2 className="w-3 h-3" /></button></div></div>))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Organization Editor
   ═══════════════════════════════════════════════════════════ */

function OrganizationEditor({ orgs, groups, slaPolicies, post }: { orgs: HelpdeskOrg[]; groups: HdGroup[]; slaPolicies: SlaPolicy[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<HelpdeskOrg | null>(null);
  const [name, setName] = useState(""); const [domain, setDomain] = useState(""); const [defSla, setDefSla] = useState(""); const [defGroup, setDefGroup] = useState("");

  const startEdit = (o: HelpdeskOrg | null) => { setEditing(o); setName(o?.name || ""); setDomain(o?.domain || ""); setDefSla(o?.defaultSlaId || ""); setDefGroup(o?.defaultGroupId || ""); };
  const save = async () => {
    if (!name.trim() || !domain.trim()) return;
    if (editing?.id) await post({ action: "updateOrganization", id: editing.id, name, domain, defaultSlaId: defSla || undefined, defaultGroupId: defGroup || undefined });
    else await post({ action: "createOrganization", name, domain, defaultSlaId: defSla || undefined, defaultGroupId: defGroup || undefined });
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Organizations ({orgs.length})</h3><button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as HelpdeskOrg)}><Plus className="w-3 h-3" /> New Org</button></div>
      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}><div className="cl-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit" : "New"} Organization</h2></div>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Email Domain *</label><input className="cl-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></div>
            <div className="cl-field mt-2"><label className="cl-label">Default SLA</label><select className="cl-input" value={defSla} onChange={(e) => setDefSla(e.target.value)}><option value="">— None —</option>{slaPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">Default Group</label><select className="cl-input" value={defGroup} onChange={(e) => setDefGroup(e.target.value)}><option value="">— None —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </div></div>
      )}
      {orgs.length === 0 && <p className="text-sm text-text-muted">No organizations defined yet</p>}
      {orgs.map((o) => (<div key={o.id} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{o.name}</div><div className="hd-editor-desc">@{o.domain}</div></div><div className="hd-editor-actions"><button className="hd-editor-btn" onClick={() => startEdit(o)}><Pencil className="w-3 h-3" /></button><button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete "${o.name}"?`)) post({ action: "deleteOrganization", id: o.id }); }}><Trash2 className="w-3 h-3" /></button></div></div>))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Service Catalog Item Editor
   ═══════════════════════════════════════════════════════════ */

function CatalogItemEditor({ items, categories, groups, slaPolicies, post }: { items: ServiceCatalogItem[]; categories: HdCategory[]; groups: HdGroup[]; slaPolicies: SlaPolicy[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null);
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [published, setPublished] = useState(true);
  const [defGroup, setDefGroup] = useState(""); const [defPriority, setDefPriority] = useState(""); const [approvalReq, setApprovalReq] = useState(false); const [approvers, setApprovers] = useState("");
  const [cost, setCost] = useState(""); const [estDays, setEstDays] = useState(""); const [slaId, setSlaId] = useState(""); const [catId, setCatId] = useState("");

  const startEdit = (i: ServiceCatalogItem | null) => { setEditing(i); setName(i?.name || ""); setDesc(i?.description || ""); setPublished(i?.published !== false); setDefGroup(i?.defaultGroupId || ""); setDefPriority(i?.defaultPriority || ""); setApprovalReq(!!i?.approvalRequired); setApprovers(i?.approvers?.join(", ") || ""); setCost(i?.cost?.toString() || ""); setEstDays(i?.estimatedDays?.toString() || ""); setSlaId(i?.slaOverridePolicyId || ""); setCatId(i?.categoryId || ""); };
  const save = async () => {
    if (!name.trim()) return;
    const b: Record<string, unknown> = { name, description: desc, published, defaultGroupId: defGroup || undefined, defaultPriority: defPriority || undefined, approvalRequired: approvalReq, approvers: approvers.split(",").map((s) => s.trim()).filter(Boolean), cost: cost ? Number(cost) : undefined, estimatedDays: estDays ? Number(estDays) : undefined, slaOverridePolicyId: slaId || undefined, categoryId: catId || undefined, order: items.length };
    if (editing?.id) await post({ action: "updateCatalogItem", id: editing.id, ...b });
    else await post({ action: "createCatalogItem", ...b });
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Service Catalog ({items.length})</h3><button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit({} as ServiceCatalogItem)}><Plus className="w-3 h-3" /> New Item</button></div>
      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}><div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header"><h2 className="cl-modal-title">{editing.id ? "Edit" : "New"} Catalog Item</h2></div>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Name *</label><input className="cl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Description</label><textarea className="cl-textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="cl-field mt-2"><label className="cl-label">Category</label><select className="cl-input" value={catId} onChange={(e) => setCatId(e.target.value)}><option value="">— None —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">Default Group</label><select className="cl-input" value={defGroup} onChange={(e) => setDefGroup(e.target.value)}><option value="">— None —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">Default Priority</label><select className="cl-input" value={defPriority} onChange={(e) => setDefPriority(e.target.value)}><option value="">— Default —</option>{(["Low","Medium","High","Critical"] as const).map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">SLA Override</label><select className="cl-input" value={slaId} onChange={(e) => setSlaId(e.target.value)}><option value="">— Default —</option>{slaPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="flex gap-4 mt-2"><div className="cl-field flex-1"><label className="cl-label">Cost</label><input className="cl-input" type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></div><div className="cl-field flex-1"><label className="cl-label">Est. Days</label><input className="cl-input" type="number" value={estDays} onChange={(e) => setEstDays(e.target.value)} /></div></div>
            <div className="flex items-center gap-4 mt-2"><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />Published</label><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={approvalReq} onChange={(e) => setApprovalReq(e.target.checked)} />Approval required</label></div>
            {approvalReq && <div className="cl-field mt-2"><label className="cl-label">Approvers (comma separated usernames)</label><input className="cl-input" value={approvers} onChange={(e) => setApprovers(e.target.value)} /></div>}
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </div></div>
      )}
      {items.length === 0 && <p className="text-sm text-text-muted">No catalog items defined yet</p>}
      {items.map((i) => (<div key={i.id} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{i.name} {!i.published && <span className="text-xs text-text-muted">(Draft)</span>}</div><div className="hd-editor-desc">{i.description?.slice(0, 60) || "—"}{i.cost ? ` • $${i.cost}` : ""}{i.estimatedDays ? ` • ${i.estimatedDays}d` : ""}</div></div><div className="hd-editor-actions"><button className="hd-editor-btn" onClick={() => startEdit(i)}><Pencil className="w-3 h-3" /></button><button className="hd-editor-btn hd-editor-btn--danger" onClick={() => { if (confirm(`Delete "${i.name}"?`)) post({ action: "deleteCatalogItem", id: i.id }); }}><Trash2 className="w-3 h-3" /></button></div></div>))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Recurring Ticket Editor
   ═══════════════════════════════════════════════════════════ */

function RecurringTicketEditor({ defs, post }: { defs: RecurringTicketDef[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Recurring Tickets ({defs.length})</h3></div>
      <p className="text-xs text-text-muted">Recurring ticket definitions are stored in config. They run on the cron schedule defined during creation.</p>
      {defs.length === 0 && <p className="text-sm text-text-muted mt-2">No recurring tickets defined yet</p>}
      {defs.map((d) => (<div key={d.id} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{d.template?.subject || d.id} {!d.enabled && <span className="text-xs text-text-muted">(Disabled)</span>}</div><div className="hd-editor-desc">Cron: {d.cron}{d.lastRun ? ` • Last: ${new Date(d.lastRun).toLocaleString()}` : ""}</div></div></div>))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Notification Template Editor
   ═══════════════════════════════════════════════════════════ */

const ALL_NOTIF_EVENTS: HdNotificationEvent[] = ["ticket_created", "ticket_assigned", "status_changed", "comment_added", "sla_warning", "sla_breached", "escalated", "approval_requested", "approval_decided"];

function NotificationTemplateEditor({ templates, post }: { templates: HdNotificationTemplate[]; post: (b: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<HdNotificationTemplate | null>(null);
  const [event, setEvent] = useState<HdNotificationEvent>("ticket_created");
  const [subject, setSubject] = useState(""); const [htmlBody, setHtmlBody] = useState(""); const [enabled, setEnabled] = useState(true);

  const startEdit = (t: HdNotificationTemplate | null) => { setEditing(t); setEvent(t?.event || "ticket_created"); setSubject(t?.subject || ""); setHtmlBody(t?.htmlBody || ""); setEnabled(t?.enabled !== false); };
  const save = async () => {
    const updated = [...templates];
    const idx = updated.findIndex((t) => t.event === event);
    const entry = { event, subject, htmlBody, enabled };
    if (idx >= 0) updated[idx] = entry; else updated.push(entry);
    await post({ action: "updateSettings", notificationTemplates: updated });
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-text-primary">Notification Templates ({templates.length})</h3><button className="cl-btn cl-btn--primary text-xs" onClick={() => startEdit(null)}><Plus className="w-3 h-3" /> New Template</button></div>
      {editing !== null && (
        <div className="cl-modal-overlay" onClick={() => setEditing(null)}><div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="cl-modal-header"><h2 className="cl-modal-title">Notification Template</h2></div>
          <div className="cl-modal-body">
            <div className="cl-field"><label className="cl-label">Event</label><select className="cl-input" value={event} onChange={(e) => setEvent(e.target.value as HdNotificationEvent)}>{ALL_NOTIF_EVENTS.map((ev) => <option key={ev} value={ev}>{ev.replace(/_/g, " ")}</option>)}</select></div>
            <div className="cl-field mt-2"><label className="cl-label">Subject</label><input className="cl-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="[Helpdesk] {{event}}" /></div>
            <div className="cl-field mt-2"><label className="cl-label">HTML Body</label><textarea className="cl-textarea" rows={5} value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} /></div>
            <div className="flex items-center gap-2 mt-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><label className="text-sm text-text-secondary">Enabled</label></div>
          </div>
          <div className="cl-modal-footer"><button className="cl-btn cl-btn--primary" onClick={save}>Save</button><button className="cl-btn cl-btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </div></div>
      )}
      {templates.length === 0 && <p className="text-sm text-text-muted">No custom notification templates. Defaults will be used.</p>}
      {templates.map((t) => (<div key={t.event} className="hd-editor-row"><div className="flex-1"><div className="hd-editor-name">{t.event.replace(/_/g, " ")} {!t.enabled && <span className="text-xs text-text-muted">(Disabled)</span>}</div><div className="hd-editor-desc">{t.subject}</div></div><div className="hd-editor-actions"><button className="hd-editor-btn" onClick={() => startEdit(t)}><Pencil className="w-3 h-3" /></button></div></div>))}
    </div>
  );
}

