"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, TicketPlus, List, Megaphone, HelpCircle, Tag, Link as LinkIcon, ChevronDown, ChevronUp,
} from "lucide-react";
import type { PageWidget, WidgetType, HdCategory } from "@/lib/helpdesk";

/* ═══════════════════════════════════════════════════════════
   Main renderer — takes a list of widgets and lays them out
   ═══════════════════════════════════════════════════════════ */

interface WidgetRendererProps {
  widgets: PageWidget[];
  user: { displayName: string; email: string } | null;
  categories?: HdCategory[];
}

export default function WidgetRenderer({ widgets, user, categories }: WidgetRendererProps) {
  const sorted = [...widgets].sort((a, b) => a.order - b.order);

  return (
    <div className="hd-wr-grid">
      {sorted.map((w) => (
        <div key={w.id} className={`hd-wr-cell hd-wr-cell--${w.width}`}>
          <RenderWidget widget={w} user={user} categories={categories} />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Per-widget renderers
   ═══════════════════════════════════════════════════════════ */

function RenderWidget({ widget, user, categories }: { widget: PageWidget; user: WidgetRendererProps["user"]; categories?: HdCategory[] }) {
  switch (widget.type) {
    case "hero":          return <HeroWidget config={widget.config} />;
    case "search":        return <SearchWidget config={widget.config} />;
    case "ticket_form":   return <TicketFormWidget config={widget.config} user={user} />;
    case "my_tickets":    return <MyTicketsWidget config={widget.config} user={user} />;
    case "announcements": return <AnnouncementsWidget config={widget.config} />;
    case "faq":           return <FaqWidget config={widget.config} />;
    case "categories":    return <CategoriesWidget config={widget.config} categories={categories} />;
    case "custom_html":   return <CustomHtmlWidget config={widget.config} />;
    case "quick_links":   return <QuickLinksWidget config={widget.config} />;
    default:              return <div className="hd-portal-widget"><span className="text-xs text-text-muted">Unknown widget</span></div>;
  }
}

/* ── Hero ── */
function HeroWidget({ config }: { config: Record<string, unknown> }) {
  const bg = (config.bgColor as string) || undefined;
  return (
    <div className="hd-portal-widget hd-portal-widget--hero" style={bg ? { background: bg, color: "#fff" } : undefined}>
      <h2 style={bg ? { color: "#fff" } : undefined}>{(config.heading as string) || "Welcome"}</h2>
      <p style={bg ? { color: "rgba(255,255,255,0.8)" } : undefined}>{(config.subtitle as string) || ""}</p>
    </div>
  );
}

/* ── Search ── */
function SearchWidget({ config }: { config: Record<string, unknown> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const doSearch = () => { if (q.trim()) router.push(`/portal/tickets?q=${encodeURIComponent(q)}`); };

  return (
    <div className="hd-portal-widget" style={{ textAlign: "center", padding: "20px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="cl-input" style={{ paddingLeft: 32, width: "100%" }}
          placeholder={(config.placeholder as string) || "Search tickets…"}
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
      </div>
    </div>
  );
}

/* ── Ticket Form ── */
function TicketFormWidget({ config, user }: { config: Record<string, unknown>; user: WidgetRendererProps["user"] }) {
  const router = useRouter();
  return (
    <div className="hd-portal-widget hd-wr-action-card" onClick={() => router.push(user ? "/portal/tickets" : "/portal/login")} role="button" tabIndex={0}>
      <TicketPlus className="w-6 h-6 text-accent" />
      <div>
        <div className="text-sm font-bold text-text-primary">{(config.buttonText as string) || "Submit a Ticket"}</div>
        <div className="text-xs text-text-muted">{user ? "Report an issue or request help" : "Sign in to submit a ticket"}</div>
      </div>
    </div>
  );
}

/* ── My Tickets ── */
function MyTicketsWidget({ config, user }: { config: Record<string, unknown>; user: WidgetRendererProps["user"] }) {
  const [tickets, setTickets] = useState<{ id: string; subject: string; status: string; updatedAt: string }[]>([]);
  const maxItems = (config.maxItems as number) || 5;

  useEffect(() => {
    if (!user) return;
    fetch("/api/portal?action=tickets")
      .then((r) => r.ok ? r.json() : { tickets: [] })
      .then((d) => setTickets((d.tickets || []).slice(0, maxItems)));
  }, [user, maxItems]);

  if (!user) return (
    <div className="hd-portal-widget">
      <div className="flex items-center gap-2 mb-2"><List className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">My Tickets</span></div>
      <p className="text-xs text-text-muted">Sign in to view your tickets</p>
    </div>
  );

  return (
    <div className="hd-portal-widget">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><List className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">My Tickets</span></div>
        <a href="/portal/tickets" className="text-xs text-accent underline">View all</a>
      </div>
      {tickets.length === 0 ? (
        <p className="text-xs text-text-muted">No tickets yet.</p>
      ) : (
        <div className="hd-wr-ticket-list">
          {tickets.map((t) => (
            <a key={t.id} href={`/portal/tickets?view=${t.id}`} className="hd-wr-ticket-row">
              <span className="hd-ticket-id">{t.id}</span>
              <span className="text-xs text-text-primary flex-1 truncate">{t.subject}</span>
              <span className={`cl-badge hd-status--${t.status.toLowerCase().replace(/\s+/g, "-")}`}>{t.status}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Announcements ── */
function AnnouncementsWidget({ config }: { config: Record<string, unknown> }) {
  const items = (config.items as { title: string; body: string }[]) || [];
  return (
    <div className="hd-portal-widget">
      <div className="flex items-center gap-2 mb-3"><Megaphone className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Announcements</span></div>
      {items.length === 0 ? <p className="text-xs text-text-muted">No announcements.</p> : (
        <div className="hd-wr-announce-list">
          {items.map((a, i) => (
            <div key={i} className="hd-wr-announce-item">
              <div className="text-xs font-bold text-text-primary">{a.title}</div>
              <div className="text-xs text-text-secondary">{a.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── FAQ ── */
function FaqWidget({ config }: { config: Record<string, unknown> }) {
  const items = (config.items as { question: string; answer: string }[]) || [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="hd-portal-widget">
      <div className="flex items-center gap-2 mb-3"><HelpCircle className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Frequently Asked Questions</span></div>
      {items.length === 0 ? <p className="text-xs text-text-muted">No FAQ items.</p> : (
        <div className="hd-wr-faq-list">
          {items.map((q, i) => (
            <div key={i} className="hd-wr-faq-item">
              <button className="hd-wr-faq-q" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                <span>{q.question}</span>
                {openIdx === i ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
              {openIdx === i && <div className="hd-wr-faq-a">{q.answer}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Categories ── */
function CategoriesWidget({ config, categories }: { config: Record<string, unknown>; categories?: HdCategory[] }) {
  const cols = (config.columns as number) || 3;
  const cats = categories || [];

  return (
    <div className="hd-portal-widget">
      <div className="flex items-center gap-2 mb-3"><Tag className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Browse by Category</span></div>
      {cats.length === 0 ? <p className="text-xs text-text-muted">No categories configured.</p> : (
        <div className="hd-wr-cat-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {cats.map((c) => (
            <a key={c.id} href={`/portal/tickets?category=${c.id}`} className="hd-wr-cat-card">
              <div className="text-sm font-semibold text-text-primary">{c.name}</div>
              {c.description && <div className="text-xs text-text-muted">{c.description}</div>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Custom HTML ── */
function CustomHtmlWidget({ config }: { config: Record<string, unknown> }) {
  const html = (config.html as string) || "";
  return (
    <div className="hd-portal-widget">
      <div className="hd-wr-custom-html" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/* ── Quick Links ── */
function QuickLinksWidget({ config }: { config: Record<string, unknown> }) {
  const links = (config.links as { title: string; url: string; icon?: string }[]) || [];
  return (
    <div className="hd-portal-widget">
      <div className="flex items-center gap-2 mb-3"><LinkIcon className="w-4 h-4 text-accent" /><span className="text-sm font-bold text-text-primary">Quick Links</span></div>
      {links.length === 0 ? <p className="text-xs text-text-muted">No links configured.</p> : (
        <div className="hd-wr-links-grid">
          {links.map((l, i) => (
            <a key={i} href={l.url} className="hd-wr-link-card" target={l.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
              <LinkIcon className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm font-semibold text-text-primary">{l.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
