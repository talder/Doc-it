"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Headset, LogOut, ArrowLeft } from "lucide-react";
import type { HdPortalPage, HdCategory } from "@/lib/helpdesk";
import WidgetRenderer from "@/components/helpdesk/WidgetRenderer";

export default function PortalSlugPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [page, setPage] = useState<HdPortalPage | null>(null);
  const [categories, setCategories] = useState<HdCategory[]>([]);
  const [user, setUser] = useState<{ displayName: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Fetch portal user session
    fetch("/api/portal?action=me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUser(d?.user || null));

    // Fetch page by slug
    fetch(`/api/portal?action=page&slug=${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setPage(d.page);
        setCategories(d.categories || []);
        setLoading(false);
      });
  }, [slug]);

  const logout = async () => {
    await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.refresh();
  };

  if (loading) return null;

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">Portal Not Found</h2>
          <p className="text-sm text-text-muted mb-4">This portal doesn't exist or is not published.</p>
          <a href="/portals" className="cl-btn cl-btn--primary text-xs"><ArrowLeft className="w-3 h-3" /> Back to Portals</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/portals" className="p-1.5 hover:bg-muted rounded text-text-muted"><ArrowLeft className="w-4 h-4" /></a>
          <Headset className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">{page?.name || "Portal"}</h1>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-text-muted">Hi, {user.displayName}</span>
              <button className="p-2 hover:bg-muted rounded text-text-muted" onClick={logout}><LogOut className="w-4 h-4" /></button>
            </>
          ) : (
            <a href="/portal/login" className="cl-btn cl-btn--primary text-xs">Sign In</a>
          )}
        </div>
      </header>

      {/* Page content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {page && page.widgets.length > 0 ? (
          <WidgetRenderer widgets={page.widgets} user={user} categories={categories} />
        ) : (
          <p className="text-sm text-text-muted text-center py-12">This portal has no content yet.</p>
        )}
      </div>
    </div>
  );
}
