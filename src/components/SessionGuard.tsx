"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Periodically checks whether the user's session is still valid by
 * calling /api/auth/me.  If the session has expired (server returns
 * no user), the browser is redirected to /login.
 *
 * The check runs every 60 seconds.  It is skipped on pages that
 * don't require authentication (login, register, setup, share, portal).
 */

const CHECK_INTERVAL_MS = 60_000; // 1 minute

const PUBLIC_PREFIXES = ["/login", "/register", "/setup", "/share/", "/portal"];

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Don't run on public pages
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;

    const check = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) { router.replace("/login"); return; }
        const data = await res.json();
        if (!data.user) {
          router.replace("/login");
        }
      } catch {
        // Network error — don't redirect (offline tolerance)
      }
    };

    // Run the first check after a short delay (avoid immediate call on mount)
    const initial = setTimeout(check, 5_000);
    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, router]);

  return null;
}
