"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Headset, LogOut } from "lucide-react";
import type { HdPortalPage, HdCategory } from "@/lib/helpdesk";
import WidgetRenderer from "@/components/helpdesk/WidgetRenderer";

export default function PortalHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ displayName: string; email: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [homePage, setHomePage] = useState<HdPortalPage | null>(null);
  const [categories, setCategories] = useState<HdCategory[]>([]);

  useEffect(() => {
    fetch("/api/portal?action=me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setUser(d?.user || null); setChecking(false); });

    fetch("/api/portal?action=config")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setCategories(d.categories || []);
        const pages: HdPortalPage[] = d.portalPages || [];
        const home = pages.find((p) => p.isHomePage) || pages[0] || null;
        setHomePage(home);
      });
  }, []);

  const logout = async () => {
    await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.push("/portal/login");
  };

  if (checking) return null;

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Headset className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Support Portal</h1>
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
        {homePage && homePage.widgets.length > 0 ? (
          <WidgetRenderer widgets={homePage.widgets} user={user} categories={categories} />
        ) : (
          <FallbackPortal user={user} />
        )}
      </div>
    </div>
  );
}

/* Fallback UI when no portal pages are designed yet */
function FallbackPortal({ user }: { user: { displayName: string; email: string } | null }) {
  return (
    <>
      <div className="hd-portal-widget hd-portal-widget--hero mx-auto" style={{ maxWidth: 700 }}>
        <h2>How can we help you?</h2>
        <p>Browse our support resources or submit a ticket</p>
      </div>
      <div className="max-w-3xl mx-auto mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {user ? (
          <>
            <a href="/portal/tickets" className="hd-portal-widget flex items-center gap-3 hover:border-accent transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-bold text-text-primary">My Tickets</div>
                <div className="text-xs text-text-muted">View your submitted tickets</div>
              </div>
            </a>
            <a href="/portal/tickets" className="hd-portal-widget flex items-center gap-3 hover:border-accent transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-bold text-text-primary">Submit Ticket</div>
                <div className="text-xs text-text-muted">Report an issue or request help</div>
              </div>
            </a>
          </>
        ) : (
          <>
            <a href="/portal/login" className="hd-portal-widget flex items-center gap-3 hover:border-accent transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-bold text-text-primary">Sign In</div>
                <div className="text-xs text-text-muted">Access your tickets</div>
              </div>
            </a>
            <a href="/portal/register" className="hd-portal-widget flex items-center gap-3 hover:border-accent transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-bold text-text-primary">Register</div>
                <div className="text-xs text-text-muted">Create a support account</div>
              </div>
            </a>
          </>
        )}
      </div>
    </>
  );
}
