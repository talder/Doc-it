"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, LogOut, Settings, Sun, Moon, Archive, User, Bell, X, FileText, BookOpen, Check, HardDriveDownload } from "lucide-react";
import OfflineBundleModal from "@/components/OfflineBundleModal";
import { useTheme, isLightTheme, type Theme } from "@/components/ThemeProvider";
import type { Space, SanitizedUser, ReviewItem } from "@/lib/types";

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

interface ThemeOption { value: Theme; label: string; swatch: string; }

const LIGHT_THEMES_OPTIONS: ThemeOption[] = [
  { value: "light",            label: "Light",             swatch: "#ffffff" },
  { value: "solarized-light",  label: "Solarized Light",   swatch: "#fdf6e3" },
  { value: "dracula-light",    label: "Dracula Light",     swatch: "#f8f8f2" },
  { value: "catppuccin-latte", label: "Catppuccin Latte",  swatch: "#eff1f5" },
  { value: "blossom",          label: "Blossom",           swatch: "#ffcedd" },
  { value: "lavender",         label: "Lavender",          swatch: "#deccff" },
  { value: "paper",            label: "Paper",             swatch: "#f8f4ec" },
  { value: "high-contrast",    label: "High Contrast",     swatch: "#ffffff" },
];

const DARK_THEMES_OPTIONS: ThemeOption[] = [
  { value: "dark",            label: "Dark",             swatch: "#1a1a2e" },
  { value: "dracula",         label: "Dracula",           swatch: "#282a36" },
  { value: "nord",            label: "Nord",              swatch: "#2e3440" },
  { value: "solarized-dark",  label: "Solarized Dark",    swatch: "#002b36" },
  { value: "github-dark",     label: "GitHub Dark",       swatch: "#22272e" },
  { value: "catppuccin",      label: "Catppuccin",        swatch: "#1e1e2e" },
  { value: "twilight",        label: "Twilight",          swatch: "#1c0830" },
  { value: "midnight-rose",   label: "Midnight Rose",     swatch: "#1e0818" },
  { value: "high-contrast-dark", label: "High Contrast Dark", swatch: "#000000" },
];

const ALL_THEMES_OPTIONS = [...LIGHT_THEMES_OPTIONS, ...DARK_THEMES_OPTIONS];

export interface AppNotification {
  id: string;
  message: string;
  docName: string;
  category: string;
  time: string;
}

interface TopbarProps {
  currentSpace: Space | null;
  spaces: Space[];
  user: SanitizedUser | null;
  onSwitchSpace: (slug: string) => void;
  onLogout: () => void;
  onOpenArchive?: () => void;
  reviewItems?: ReviewItem[];
  onNavigateToReview?: (item: ReviewItem) => void;
  notifications?: AppNotification[];
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  onNotificationAction?: (n: AppNotification) => void;
}

export default function Topbar({ currentSpace, spaces, user, onSwitchSpace, onLogout, onOpenArchive, reviewItems = [], onNavigateToReview, notifications = [], onDismissNotification, onClearNotifications, onNotificationAction }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [offlineBundleOpen, setOfflineBundleOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const spaceRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const reviewsRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);

  const avatarUrl = user?.username ? `/api/auth/avatar/${encodeURIComponent(user.username)}` : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (spaceRef.current && !spaceRef.current.contains(e.target as Node)) setSpaceMenuOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
      if (reviewsRef.current && !reviewsRef.current.contains(e.target as Node)) setReviewsOpen(false);
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) setNotifsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentThemeLabel = ALL_THEMES_OPTIONS.find((t) => t.value === theme)?.label ?? "Theme";
  const themeIcon = isLightTheme(theme) ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;

  return (<>
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

        {/* API Docs */}
        <button
          onClick={() => router.push("/api-docs")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          title="API Documentation"
        >
          <BookOpen className="w-4 h-4" />
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

        {/* Offline Bundle */}
        <button
          onClick={() => setOfflineBundleOpen(true)}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          title="Download Offline Bundle"
        >
          <HardDriveDownload className="w-4 h-4" />
        </button>

        {/* Reviews waiting badge */}
        {reviewItems.length > 0 && (
          <div className="relative" ref={reviewsRef}>
            <button
              onClick={() => setReviewsOpen(!reviewsOpen)}
              className="reviews-badge"
              title="Documents awaiting your review"
            >
              Reviews waiting
              <span className="reviews-badge-count">{reviewItems.length}</span>
            </button>

            {reviewsOpen && (
              <div className="review-panel">
                <div className="review-panel-header">Awaiting your review</div>
                {reviewItems.map((item, i) => (
                  <button
                    key={i}
                    className="review-panel-item"
                    onClick={() => {
                      setReviewsOpen(false);
                      onNavigateToReview?.(item);
                    }}
                  >
                    <span className="review-panel-item-name">{item.docName}</span>
                    <span className="review-panel-item-meta">
                      {item.spaceName ? `${item.spaceName} · ` : ""}{item.category}
                      {item.assignedBy ? ` · by ${item.assignedBy}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notifications bell */}
        <div className="relative" ref={notifsRef}>
          <button
            onClick={() => setNotifsOpen(!notifsOpen)}
            className="notif-bell-btn"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="notif-dot" />
            )}
          </button>

          {notifsOpen && (
            <div className="notif-panel">
              <div className="notif-panel-header">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <button className="notif-clear-btn" onClick={() => { onClearNotifications?.(); }}>
                    Clear all
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="notif-empty">No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="notif-item">
                    <FileText className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                    <div className="notif-item-body">
                      <span className="notif-item-msg">{n.message}</span>
                      <div className="notif-item-meta">
                        <span>{n.time}</span>
                        <button className="notif-action-btn" onClick={() => { setNotifsOpen(false); onNotificationAction?.(n); }}>
                          Edit Now
                        </button>
                      </div>
                    </div>
                    <button className="notif-dismiss-btn" onClick={() => onDismissNotification?.(n.id)} title="Dismiss">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Theme switcher */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            title={`Theme: ${currentThemeLabel}`}
          >
            {themeIcon}
          </button>

          {themeMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1.5 min-w-[210px]">
              {/* Light themes */}
              <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Light</div>
              {LIGHT_THEMES_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); setThemeMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2.5 transition-colors ${
                    opt.value === theme ? "text-accent font-medium" : "text-text-secondary"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0"
                    style={{ background: opt.swatch }}
                  />
                  {opt.label}
                  {opt.value === theme && <Check className="w-3 h-3 ml-auto text-accent" />}
                </button>
              ))}
              <hr className="border-border-light my-1" />
              {/* Dark themes */}
              <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Dark</div>
              {DARK_THEMES_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); setThemeMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2.5 transition-colors ${
                    opt.value === theme ? "text-accent font-medium" : "text-text-secondary"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0"
                    style={{ background: opt.swatch }}
                  />
                  {opt.label}
                  {opt.value === theme && <Check className="w-3 h-3 ml-auto text-accent" />}
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

    {offlineBundleOpen && (
      <OfflineBundleModal onClose={() => setOfflineBundleOpen(false)} />
    )}
  </>);
}
