"use client";

import { useState } from "react";
import {
  Plus, Trash2, Pencil, Eye, ChevronUp, ChevronDown, GripVertical, Settings,
  LayoutDashboard, TicketPlus, List, Megaphone, HelpCircle, Tag, Search, Code, Link as LinkIcon, X, Globe, GlobeLock,
} from "lucide-react";
import type { HdPortalPage, PageWidget, WidgetType } from "@/lib/helpdesk";

/* ── Widget catalogue ── */

const WIDGET_CATALOGUE: { type: WidgetType; label: string; icon: React.ElementType; desc: string }[] = [
  { type: "hero",         label: "Hero Banner",    icon: LayoutDashboard, desc: "Large heading with subtitle" },
  { type: "ticket_form",  label: "Submit Ticket",  icon: TicketPlus,      desc: "Embedded ticket form" },
  { type: "my_tickets",   label: "My Tickets",     icon: List,            desc: "User's recent tickets" },
  { type: "announcements",label: "Announcements",  icon: Megaphone,       desc: "News or announcements" },
  { type: "faq",          label: "FAQ",             icon: HelpCircle,      desc: "Questions & answers" },
  { type: "categories",   label: "Categories",     icon: Tag,             desc: "Browse by category" },
  { type: "search",       label: "Search",          icon: Search,          desc: "Ticket search bar" },
  { type: "custom_html",  label: "Custom HTML",    icon: Code,            desc: "Raw HTML content" },
  { type: "quick_links",  label: "Quick Links",    icon: LinkIcon,        desc: "Card grid of links" },
];

function defaultConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case "hero":          return { heading: "How can we help?", subtitle: "Browse resources or submit a ticket", bgColor: "" };
    case "ticket_form":   return { buttonText: "Submit a Ticket", formId: "" };
    case "my_tickets":    return { maxItems: 5 };
    case "announcements": return { items: [{ title: "Welcome", body: "Welcome to the support portal!" }] };
    case "faq":           return { items: [{ question: "How do I submit a ticket?", answer: "Click Submit Ticket above." }] };
    case "categories":    return { columns: 3 };
    case "search":        return { placeholder: "Search tickets…" };
    case "custom_html":   return { html: "<p>Custom content here</p>" };
    case "quick_links":   return { links: [{ title: "Knowledge Base", url: "#", icon: "book" }] };
    default:              return {};
  }
}

/* ── Props ── */

interface PortalPageDesignerProps {
  pages: HdPortalPage[];
  post: (b: Record<string, unknown>) => Promise<void>;
}

export default function PortalPageDesigner({ pages, post }: PortalPageDesignerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(pages[0]?.id || null);
  const [editMeta, setEditMeta] = useState(false);
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [preview, setPreview] = useState(false);
  const [configWidget, setConfigWidget] = useState<PageWidget | null>(null);

  const page = pages.find((p) => p.id === selectedId);

  /* ── Page CRUD ── */

  const createPage = async () => {
    await post({ action: "createPortalPage", name: "New Page", slug: `page-${pages.length + 1}`, isHomePage: pages.length === 0, widgets: [] });
  };

  const deletePage = async (id: string) => {
    if (!confirm("Delete this page?")) return;
    await post({ action: "deletePortalPage", id });
    if (selectedId === id) setSelectedId(pages.find((p) => p.id !== id)?.id || null);
  };

  const savePageMeta = async () => {
    if (!page || !pageName.trim()) return;
    await post({ action: "updatePortalPage", id: page.id, name: pageName, slug: pageSlug || pageName.toLowerCase().replace(/\s+/g, "-") });
    setEditMeta(false);
  };

  /* ── Widget ops ── */

  const addWidget = async (type: WidgetType) => {
    if (!page) return;
    const w: PageWidget = { id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2), type, config: defaultConfig(type), order: page.widgets.length, width: "full" };
    await post({ action: "updatePortalPage", id: page.id, widgets: [...page.widgets, w] });
  };

  const removeWidget = async (widgetId: string) => {
    if (!page) return;
    await post({ action: "updatePortalPage", id: page.id, widgets: page.widgets.filter((w) => w.id !== widgetId).map((w, i) => ({ ...w, order: i })) });
  };

  const moveWidget = async (widgetId: string, dir: -1 | 1) => {
    if (!page) return;
    const widgets = [...page.widgets].sort((a, b) => a.order - b.order);
    const idx = widgets.findIndex((w) => w.id === widgetId);
    if (idx + dir < 0 || idx + dir >= widgets.length) return;
    [widgets[idx], widgets[idx + dir]] = [widgets[idx + dir], widgets[idx]];
    await post({ action: "updatePortalPage", id: page.id, widgets: widgets.map((w, i) => ({ ...w, order: i })) });
  };

  const updateWidgetConfig = async (widgetId: string, config: Record<string, unknown>) => {
    if (!page) return;
    await post({ action: "updatePortalPage", id: page.id, widgets: page.widgets.map((w) => w.id === widgetId ? { ...w, config } : w) });
    setConfigWidget(null);
  };

  const updateWidgetWidth = async (widgetId: string, width: PageWidget["width"]) => {
    if (!page) return;
    await post({ action: "updatePortalPage", id: page.id, widgets: page.widgets.map((w) => w.id === widgetId ? { ...w, width } : w) });
  };

  return (
    <div>
      {/* Page list header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">Portal Pages ({pages.length})</h3>
        <button className="cl-btn cl-btn--primary text-xs" onClick={createPage}><Plus className="w-3 h-3" /> New Page</button>
      </div>

      {/* Page tabs */}
      {pages.length > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {pages.map((p) => (
            <button key={p.id} className={`hd-admin-tab${selectedId === p.id ? " hd-admin-tab--active" : ""}`} onClick={() => { setSelectedId(p.id); setPreview(false); }}>
              {p.published ? <Globe className="w-3 h-3 inline text-green-500" /> : <GlobeLock className="w-3 h-3 inline text-text-muted" />}
              {" "}{p.name} {p.isHomePage && "★"}
            </button>
          ))}
        </div>
      )}

      {page && (
        <>
          {/* Page header / meta */}
          <div className="flex items-center gap-2 mb-3">
            {editMeta ? (
              <div className="flex gap-2 items-center">
                <input className="cl-input" style={{ width: 180 }} value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="Page name" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted">/</span>
                  <input className="cl-input" style={{ width: 140 }} value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} placeholder="slug" />
                </div>
                <button className="cl-btn cl-btn--primary text-xs" onClick={savePageMeta}>Save</button>
                <button className="cl-btn cl-btn--secondary text-xs" onClick={() => setEditMeta(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <span className="text-sm font-bold text-text-primary">{page.name}</span>
                <span className="text-xs text-text-muted">/{page.slug}</span>
                <button className="hd-editor-btn" onClick={() => { setPageName(page.name); setPageSlug(page.slug); setEditMeta(true); }}><Pencil className="w-3 h-3" /></button>
                <button className="hd-editor-btn" onClick={() => setPreview(!preview)}><Eye className="w-3 h-3" /> {preview ? "Edit" : "Preview"}</button>
                <button
                  className={`hd-editor-btn${page.published ? " hd-pd-published" : ""}`}
                  onClick={() => post({ action: "updatePortalPage", id: page.id, published: !page.published })}
                >
                  {page.published ? <><Globe className="w-3 h-3" /> Published</> : <><GlobeLock className="w-3 h-3" /> Publish</>}
                </button>
                {!page.isHomePage && <button className="hd-editor-btn" onClick={() => post({ action: "updatePortalPage", id: page.id, isHomePage: true })}>Set Home</button>}
                <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => deletePage(page.id)}><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>

          {preview ? (
            /* Live preview */
            <div className="hd-pd-preview">
              <div className="hd-pd-preview-header">
                <LayoutDashboard className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold text-text-primary">Portal Preview</span>
              </div>
              <div className="hd-pd-preview-body">
                {page.widgets.length === 0 && <p className="text-sm text-text-muted text-center py-8">No widgets on this page</p>}
                <div className="hd-pd-preview-grid">
                  {page.widgets.sort((a, b) => a.order - b.order).map((w) => (
                    <div key={w.id} className={`hd-pd-preview-widget hd-pd-preview-widget--${w.width}`}>
                      <WidgetPreview widget={w} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Editor: palette + canvas */
            <div className="hd-pd-editor">
              {/* Widget palette */}
              <div className="hd-pd-palette">
                <p className="text-xs font-bold text-text-muted mb-2">ADD WIDGET</p>
                {WIDGET_CATALOGUE.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.type} className="hd-pd-palette-item" onClick={() => addWidget(cat.type)}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">{cat.label}</div>
                        <div className="text-[0.625rem] text-text-muted">{cat.desc}</div>
                      </div>
                      <Plus className="w-3 h-3 text-text-muted" />
                    </div>
                  );
                })}
              </div>

              {/* Canvas */}
              <div className="hd-pd-canvas">
                {page.widgets.length === 0 && <p className="text-sm text-text-muted text-center py-8">Click widgets from the palette to add them</p>}
                {page.widgets.sort((a, b) => a.order - b.order).map((w) => {
                  const cat = WIDGET_CATALOGUE.find((c) => c.type === w.type);
                  const Icon = cat?.icon || Code;
                  return (
                    <div key={w.id} className="hd-pd-widget-card">
                      <GripVertical className="w-3 h-3 text-text-muted flex-shrink-0" />
                      <Icon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <div className="hd-pd-widget-label">{cat?.label || w.type}</div>
                      <select className="hd-pd-widget-width" value={w.width} onChange={(e) => updateWidgetWidth(w.id, e.target.value as PageWidget["width"])}>
                        <option value="full">Full</option>
                        <option value="half">Half</option>
                        <option value="third">Third</option>
                      </select>
                      <div className="flex gap-1">
                        <button className="hd-editor-btn" onClick={() => moveWidget(w.id, -1)}><ChevronUp className="w-3 h-3" /></button>
                        <button className="hd-editor-btn" onClick={() => moveWidget(w.id, 1)}><ChevronDown className="w-3 h-3" /></button>
                        <button className="hd-editor-btn" onClick={() => setConfigWidget(w)}><Settings className="w-3 h-3" /></button>
                        <button className="hd-editor-btn hd-editor-btn--danger" onClick={() => removeWidget(w.id)}><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Widget config modal */}
          {configWidget && (
            <WidgetConfigModal
              widget={configWidget}
              onSave={(cfg) => updateWidgetConfig(configWidget.id, cfg)}
              onClose={() => setConfigWidget(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Widget Preview (inline preview cards)
   ═══════════════════════════════════════════════════════════ */

function WidgetPreview({ widget }: { widget: PageWidget }) {
  const { type, config } = widget;

  switch (type) {
    case "hero":
      return (
        <div className="hd-portal-widget hd-portal-widget--hero">
          <h2>{(config.heading as string) || "Hero"}</h2>
          <p>{(config.subtitle as string) || ""}</p>
        </div>
      );
    case "search":
      return (
        <div className="hd-portal-widget" style={{ textAlign: "center", padding: "20px" }}>
          <div style={{ maxWidth: 400, margin: "0 auto", position: "relative" }}>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input className="cl-input" style={{ paddingLeft: 32, width: "100%" }} placeholder={(config.placeholder as string) || "Search…"} disabled />
          </div>
        </div>
      );
    case "ticket_form":
      return (
        <div className="hd-portal-widget" style={{ textAlign: "center", padding: "20px" }}>
          <TicketPlus className="w-6 h-6 text-accent mx-auto mb-2" />
          <p className="text-sm font-bold text-text-primary">{(config.buttonText as string) || "Submit a Ticket"}</p>
          <p className="text-xs text-text-muted mt-1">Opens ticket submission form</p>
        </div>
      );
    case "my_tickets":
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <List className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">My Tickets</span>
          </div>
          <div className="text-xs text-text-muted">Shows up to {(config.maxItems as number) || 5} recent tickets</div>
        </div>
      );
    case "announcements": {
      const items = (config.items as { title: string; body: string }[]) || [];
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">Announcements</span>
          </div>
          {items.slice(0, 2).map((a, i) => (
            <div key={i} className="text-xs text-text-secondary mb-1"><strong>{a.title}:</strong> {a.body}</div>
          ))}
          {items.length > 2 && <div className="text-xs text-text-muted">+{items.length - 2} more</div>}
        </div>
      );
    }
    case "faq": {
      const items = (config.items as { question: string; answer: string }[]) || [];
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">FAQ ({items.length})</span>
          </div>
          {items.slice(0, 2).map((q, i) => (
            <div key={i} className="text-xs text-text-secondary mb-1">Q: {q.question}</div>
          ))}
        </div>
      );
    }
    case "categories":
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">Browse Categories</span>
          </div>
          <div className="text-xs text-text-muted">{(config.columns as number) || 3} column grid</div>
        </div>
      );
    case "custom_html":
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">Custom HTML</span>
          </div>
          <div className="text-xs text-text-muted font-mono" style={{ maxHeight: 60, overflow: "hidden" }}>{(config.html as string)?.substring(0, 120) || ""}</div>
        </div>
      );
    case "quick_links": {
      const links = (config.links as { title: string; url: string }[]) || [];
      return (
        <div className="hd-portal-widget">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">Quick Links ({links.length})</span>
          </div>
          {links.slice(0, 3).map((l, i) => (
            <div key={i} className="text-xs text-accent underline mb-1">{l.title}</div>
          ))}
        </div>
      );
    }
    default:
      return <div className="hd-portal-widget"><span className="text-xs text-text-muted">Unknown widget: {type}</span></div>;
  }
}

/* ═══════════════════════════════════════════════════════════
   Widget Config Modal
   ═══════════════════════════════════════════════════════════ */

function WidgetConfigModal({ widget, onSave, onClose }: { widget: PageWidget; onSave: (config: Record<string, unknown>) => void; onClose: () => void }) {
  const [config, setConfig] = useState<Record<string, unknown>>({ ...widget.config });

  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value });

  const cat = WIDGET_CATALOGUE.find((c) => c.type === widget.type);

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Configure {cat?.label || widget.type}</h2>
          <button className="cl-modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          <WidgetConfigFields type={widget.type} config={config} set={set} />
        </div>
        <div className="cl-modal-footer">
          <button className="cl-btn cl-btn--primary" onClick={() => onSave(config)}>Save</button>
          <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Per-widget config field sets
   ═══════════════════════════════════════════════════════════ */

function WidgetConfigFields({ type, config, set }: { type: WidgetType; config: Record<string, unknown>; set: (key: string, value: unknown) => void }) {
  switch (type) {
    case "hero":
      return (
        <>
          <div className="cl-field"><label className="cl-label">Heading</label><input className="cl-input" value={(config.heading as string) || ""} onChange={(e) => set("heading", e.target.value)} /></div>
          <div className="cl-field mt-2"><label className="cl-label">Subtitle</label><input className="cl-input" value={(config.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} /></div>
          <div className="cl-field mt-2"><label className="cl-label">Background Color</label><input className="cl-input" placeholder="#3b82f6" value={(config.bgColor as string) || ""} onChange={(e) => set("bgColor", e.target.value)} /></div>
        </>
      );
    case "ticket_form":
      return (
        <>
          <div className="cl-field"><label className="cl-label">Button Text</label><input className="cl-input" value={(config.buttonText as string) || ""} onChange={(e) => set("buttonText", e.target.value)} /></div>
          <div className="cl-field mt-2"><label className="cl-label">Form ID (leave empty for default)</label><input className="cl-input" value={(config.formId as string) || ""} onChange={(e) => set("formId", e.target.value)} /></div>
        </>
      );
    case "my_tickets":
      return (
        <div className="cl-field"><label className="cl-label">Max Items</label><input type="number" className="cl-input" value={(config.maxItems as number) || 5} onChange={(e) => set("maxItems", +e.target.value)} /></div>
      );
    case "announcements":
      return <ListEditor items={(config.items as { title: string; body: string }[]) || []} fields={["title", "body"]} onChange={(items) => set("items", items)} />;
    case "faq":
      return <ListEditor items={(config.items as { question: string; answer: string }[]) || []} fields={["question", "answer"]} onChange={(items) => set("items", items)} />;
    case "categories":
      return (
        <div className="cl-field"><label className="cl-label">Columns</label><input type="number" className="cl-input" min={1} max={6} value={(config.columns as number) || 3} onChange={(e) => set("columns", +e.target.value)} /></div>
      );
    case "search":
      return (
        <div className="cl-field"><label className="cl-label">Placeholder</label><input className="cl-input" value={(config.placeholder as string) || ""} onChange={(e) => set("placeholder", e.target.value)} /></div>
      );
    case "custom_html":
      return (
        <div className="cl-field"><label className="cl-label">HTML</label><textarea className="cl-textarea" rows={8} value={(config.html as string) || ""} onChange={(e) => set("html", e.target.value)} /></div>
      );
    case "quick_links":
      return <ListEditor items={(config.links as { title: string; url: string; icon?: string }[]) || []} fields={["title", "url"]} onChange={(items) => set("links", items)} />;
    default:
      return <p className="text-sm text-text-muted">No configuration available for this widget.</p>;
  }
}

/* ═══════════════════════════════════════════════════════════
   Reusable List Editor (for announcements, FAQ, quick links)
   ═══════════════════════════════════════════════════════════ */

function ListEditor({ items, fields, onChange }: { items: Record<string, string>[]; fields: string[]; onChange: (items: Record<string, string>[]) => void }) {
  const addItem = () => {
    const blank: Record<string, string> = {};
    fields.forEach((f) => (blank[f] = ""));
    onChange([...items, blank]);
  };

  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: string, val: string) => onChange(items.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="hd-pd-list-item">
          {fields.map((f) => (
            <div key={f} className="cl-field mb-1">
              <label className="cl-label">{f}</label>
              {f === "body" || f === "answer" ? (
                <textarea className="cl-textarea" rows={2} value={item[f] || ""} onChange={(e) => updateItem(i, f, e.target.value)} />
              ) : (
                <input className="cl-input" value={item[f] || ""} onChange={(e) => updateItem(i, f, e.target.value)} />
              )}
            </div>
          ))}
          <button className="hd-editor-btn hd-editor-btn--danger text-xs self-end" onClick={() => removeItem(i)}><Trash2 className="w-3 h-3" /> Remove</button>
        </div>
      ))}
      <button className="cl-btn cl-btn--secondary text-xs mt-2" onClick={addItem}><Plus className="w-3 h-3" /> Add Item</button>
    </div>
  );
}
