"use client";

import { useEffect, useState } from "react";
import { Headset, Layout, Globe, ArrowRight } from "lucide-react";
import type { HdPortalPage } from "@/lib/helpdesk";

export default function PortalsListPage() {
  const [pages, setPages] = useState<HdPortalPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal?action=publishedPages")
      .then((r) => r.ok ? r.json() : { pages: [] })
      .then((d) => { setPages(d.pages || []); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Headset className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Support Portals</h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-sm text-text-muted text-center py-12">Loading…</p>
        ) : pages.length === 0 ? (
          <div className="text-center py-16">
            <Globe className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">No published portals yet.</p>
          </div>
        ) : (
          <div className="hd-portals-grid">
            {pages.map((p) => (
              <a key={p.id} href={`/portals/${p.slug}`} className="hd-portals-card">
                <div className="hd-portals-card-icon">
                  <Layout className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="hd-portals-card-name">
                    {p.name}
                    {p.isHomePage && <span className="cl-badge hd-status--open ml-2">Home</span>}
                  </div>
                  <div className="hd-portals-card-meta">
                    /{p.slug} · {p.widgets.length} widget{p.widgets.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted flex-shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
