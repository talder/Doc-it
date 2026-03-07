"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, LogOut, Settings, Sun, Moon, Archive, User } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import type { Space, SanitizedUser } from "@/lib/types";

/** Small Dracula bat SVG icon */
function DraculaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3C7 3 3 7 3 12h3l2-3 2 3h4l2-3 2 3h3c0-5-4-9-9-9z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M10 15l2 2 2-2" />
    </svg>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
  { value: "dracula", label: "Dracula", icon: <DraculaIcon className="w-4 h-4" /> },
];

interface TopbarProps {
  currentSpace: Space | null;
  spaces: Space[];
  user: SanitizedUser | null;
  onSwitchSpace: (slug: string) => void;
  onLogout: () => void;
  onOpenArchive?: () => void;
}

export default function Topbar({ currentSpace, spaces, user, onSwitchSpace, onLogout, onOpenArchive }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const spaceRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  const avatarUrl = user?.username ? `/api/auth/avatar/${encodeURIComponent(user.username)}` : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (spaceRef.current && !spaceRef.current.contains(e.target as Node)) setSpaceMenuOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentThemeOption = THEME_OPTIONS.find((t) => t.value === theme) || THEME_OPTIONS[0];

  return (
    <header className="topbar">
      {/* Left: Space name + switcher */}
      <div className="flex items-center gap-3" ref={spaceRef}>
        <div className="relative">
          <button
            onClick={() => setSpaceMenuOpen(!spaceMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <span className="text-lg font-bold text-text-primary truncate max-w-[300px]">
              {currentSpace?.name || "Select Space"}
            </span>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </button>

          {spaceMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                Spaces
              </div>
              {spaces.map((space) => (
                <button
                  key={space.slug}
                  onClick={() => {
                    onSwitchSpace(space.slug);
                    setSpaceMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                    space.slug === currentSpace?.slug
                      ? "bg-accent-light text-accent-text font-medium"
                      : "text-text-secondary"
                  }`}
                >
                  {space.name}
                </button>
              ))}
              {user?.isAdmin && (
                <>
                  <hr className="border-border-light my-1" />
                  <button
                    onClick={() => { setSpaceMenuOpen(false); router.push("/admin?tab=spaces"); }}
                    className="w-full text-left px-3 py-2 text-sm text-text-muted hover:bg-muted flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Manage Spaces
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Search + Theme + User */}
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors">
          <Search className="w-4 h-4" />
        </button>

        {/* Archive */}
        {onOpenArchive && (
          <button
            onClick={onOpenArchive}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            title="Archive"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}

        {/* Theme switcher */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            title={`Theme: ${currentThemeOption.label}`}
          >
            {currentThemeOption.icon}
          </button>

          {themeMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[150px]">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); setThemeMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors ${
                    opt.value === theme ? "text-accent font-medium" : "text-text-secondary"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-medium overflow-hidden">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                user?.username?.[0]?.toUpperCase() || "?"
              )}
            </div>
            <span className="text-sm text-text-secondary hidden sm:inline">{user?.username}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
              <div className="px-3 py-2 border-b border-border-light">
                <p className="text-sm font-medium text-text-primary">{user?.username}</p>
                <p className="text-xs text-text-muted">{user?.isAdmin ? "Admin" : "User"}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); router.push("/profile"); }}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-muted flex items-center gap-2"
              >
                <User className="w-3.5 h-3.5" />
                Profile
              </button>
              {user?.isAdmin && (
                <button
                  onClick={() => { setUserMenuOpen(false); router.push("/admin"); }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-muted flex items-center gap-2"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Administration
                </button>
              )}
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-muted flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
