"use client";

import { useMemo } from "react";
import * as LucideIcons from "lucide-react";

interface DashboardIconProps {
  icon: string;
  url?: string;        // link URL — used to derive favicon domain
  size?: number;       // px, default 20
  className?: string;
}

/** Detect if a string is (likely) an emoji. */
function isEmoji(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(str);
}

/** Extract domain from a URL for favicon lookup. */
function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Convert a kebab-case lucide name to PascalCase component name. */
function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export default function DashboardIcon({ icon, url, size = 20, className = "" }: DashboardIconProps) {
  const resolved = useMemo(() => {
    if (!icon) return { type: "none" as const };

    // Lucide icon: "lucide-server" → Server
    if (icon.startsWith("lucide-")) {
      const name = toPascalCase(icon.slice(7));
      const Icon = (LucideIcons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string; size?: number }> | undefined;
      if (Icon) return { type: "lucide" as const, Icon };
      return { type: "none" as const };
    }

    // Uploaded icon: "uploaded:my-icon-abc123.png"
    if (icon.startsWith("uploaded:")) {
      const filename = icon.slice(9);
      return { type: "url" as const, src: `/api/dashboard/icons/${encodeURIComponent(filename)}` };
    }

    // Simple Icons: "si-portainer"
    if (icon.startsWith("si-")) {
      const slug = icon.slice(3);
      return { type: "url" as const, src: `https://cdn.simpleicons.org/${slug}` };
    }

    // Homelab / Dashboard Icons: "hl-portainer"
    if (icon.startsWith("hl-")) {
      const slug = icon.slice(3);
      return { type: "url" as const, src: `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${slug}.png` };
    }

    // URL-based image
    if (icon.startsWith("http://") || icon.startsWith("https://")) {
      return { type: "url" as const, src: icon };
    }

    // Favicon auto-fetch
    if (icon === "favicon" && url) {
      const domain = getDomain(url);
      if (domain) {
        return { type: "url" as const, src: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` };
      }
      return { type: "none" as const };
    }

    // Emoji
    if (isEmoji(icon)) {
      return { type: "emoji" as const, char: icon };
    }

    // Fallback: treat as text/emoji
    if (icon.length <= 2) {
      return { type: "emoji" as const, char: icon };
    }

    return { type: "none" as const };
  }, [icon, url]);

  const baseClass = `inline-flex items-center justify-center flex-shrink-0 ${className}`;

  if (resolved.type === "lucide") {
    const { Icon } = resolved;
    return (
      <span className={baseClass} style={{ width: size, height: size }}>
        <Icon size={size} className="text-text-secondary" />
      </span>
    );
  }

  if (resolved.type === "url") {
    return (
      <span className={baseClass} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolved.src}
          alt=""
          width={size}
          height={size}
          className="object-contain rounded-sm"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </span>
    );
  }

  if (resolved.type === "emoji") {
    return (
      <span
        className={baseClass}
        style={{ width: size, height: size, fontSize: size * 0.85, lineHeight: 1 }}
        role="img"
      >
        {resolved.char}
      </span>
    );
  }

  // None — show a subtle placeholder
  return (
    <span
      className={`${baseClass} rounded bg-muted`}
      style={{ width: size, height: size }}
    />
  );
}
