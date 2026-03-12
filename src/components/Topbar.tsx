"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, LogOut, Settings, Sun, Moon, Archive, User, Bell, X, FileText, BookOpen, Check, HardDriveDownload, Home, Trophy, Share2, Trash2, Lock, Clock, BookMarked, ClipboardList, Monitor, Headset, ShieldCheck, Star } from "lucide-react";
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
  type?: string;
  message: string;
  docName: string;
  category: string;
  time: string;
}

interface ShareOverviewItem {
  token: string;
  docName: string;
  category: string;
  mode: "read" | "readwrite";
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  hasPassword: boolean;
}

interface TopbarProps {
  currentSpace: Space | null;
  spaces: Space[];
  user: SanitizedUser | null;
  onSwitchSpace: (slug: string) => void;
  onLogout: () => void;
  onOpenArchive?: () => void;
  onOpenTrash?: () => void;
  onHome?: () => void;
  onSearch?: (initialQuery?: string) => void;
  reviewItems?: ReviewItem[];
  onNavigateToReview?: (item: ReviewItem) => void;
  notifications?: AppNotification[];
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  onNotificationAction?: (n: AppNotification) => void;
  onSetDefaultSpace?: (slug: string | null) => void;
}

export default function Topbar({ currentSpace, spaces, user, onSwitchSpace, onLogout, onOpenArchive, onOpenTrash, onHome, onSearch, reviewItems = [], onNavigateToReview, notifications = [], onDismissNotification, onClearNotifications, onNotificationAction, onSetDefaultSpace }: TopbarProps) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ actor: string; count: number }[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const [sharesOpen, setSharesOpen] = useState(false);
  const [sharesData, setSharesData] = useState<ShareOverviewItem[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const sharesRef = useRef<HTMLDivElement>(null);
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
      if (leaderboardRef.current && !leaderboardRef.current.contains(e.target as Node)) setLeaderboardOpen(false);
      if (sharesRef.current && !sharesRef.current.contains(e.target as Node)) setSharesOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentThemeLabel = ALL_THEMES_OPTIONS.find((t) => t.value === theme)?.label ?? "Theme";
  const themeIcon = isLightTheme(theme) ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;

  return (<>
    <header className="topbar">
      {/* Left: Home + Space name + switcher + Search */}
      <div className="flex items-center gap-2 flex-1 min-w-0" ref={spaceRef}>
        {onHome && (
          <button onClick={onHome} className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-muted text-text-muted transition-colors" data-tip="Home">
            <img src="/logo-icon.png" alt="Doc-it" className="w-9 h-9 rounded-lg" />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setSpaceMenuOpen(!spaceMenuOpen)}
            className="flex items-baseline gap-1 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Space:</span>
            <span className="text-lg font-bold text-text-primary truncate max-w-[300px]">
              {currentSpace?.name || "Select Space"}
            </span>
            <ChevronDown className="w-4 h-4 text-text-muted self-center" />
          </button>

          {spaceMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                Spaces
              </div>
              {spaces.map((space) => (
                <div
                  key={space.slug}
                  className={`flex items-center gap-1 px-3 py-2 hover:bg-muted transition-colors ${
                    space.slug === currentSpace?.slug
                      ? "bg-accent-light text-accent-text font-medium"
                      : "text-text-secondary"
                  }`}
                >
                  <button
                    className="flex-1 text-left text-sm truncate"
                    onClick={() => {
                      onSwitchSpace(space.slug);
                      setSpaceMenuOpen(false);
                    }}
                  >
                    {space.name}
                  </button>
                  <button
                    className="flex-shrink-0 p-0.5 rounded hover:bg-accent/10 transition-colors"
                    title={user?.preferences?.defaultSpace === space.slug ? "Remove as default space" : "Set as default space"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const newDefault = user?.preferences?.defaultSpace === space.slug ? null : space.slug;
                      onSetDefaultSpace?.(newDefault);
                    }}
                  >
                    <Star className={`w-3.5 h-3.5 ${
                      user?.preferences?.defaultSpace === space.slug
                        ? "fill-amber-400 text-amber-400"
                        : "text-text-muted hover:text-amber-400"
                    }`} />
                  </button>
                </div>
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

        <button
          onClick={() => onSearch?.()}
          className="topbar-search-btn topbar-search-btn--wide"
          title="Search (⌘K)"
        >
          <Search className="w-4 h-4" />
          <span className="topbar-search-label">Search docs…</span>
          <kbd className="topbar-search-kbd">⌘K</kbd>
        </button>
      </div>

      {/* Right: Theme + User */}
      <div className="flex items-center gap-2">
        {/* Journal */}
        <button
          onClick={() => router.push("/journal")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="Journal"
        >
          <BookMarked className="w-4 h-4" />
        </button>

        {/* Change Log */}
        <button
          onClick={() => router.push("/changelog")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="Change Log"
        >
          <ClipboardList className="w-4 h-4" />
        </button>

        {/* Assets */}
        <button
          onClick={() => router.push("/assets")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="Assets"
        >
          <Monitor className="w-4 h-4" />
        </button>

        {/* Helpdesk */}
        <button
          onClick={() => router.push("/helpdesk")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="Helpdesk"
        >
          <Headset className="w-4 h-4" />
        </button>

        {/* Certificate Manager */}
        {user?.isAdmin && (
          <button
            onClick={() => router.push("/certificates")}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            data-tip="Certificate Manager"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        )}

        {/* Shared pages overview */}
        <div className="relative" ref={sharesRef}>
          <button
            onClick={async () => {
              setSharesOpen((v) => !v);
              if (!sharesOpen && currentSpace) {
                setSharesLoading(true);
                try {
                  const res = await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/shares`);
                  if (res.ok) {
                    const data = await res.json();
                    setSharesData(data.shares ?? []);
                  }
                } catch {}
                setSharesLoading(false);
              }
            }}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            data-tip="Shared Pages"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {sharesOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-[340px] max-w-[420px]">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Shared Pages</span>
                <span className="text-xs text-text-muted">{sharesData.length} active</span>
              </div>
              {sharesLoading ? (
                <div className="px-4 py-6 text-sm text-text-muted text-center">Loading…</div>
              ) : sharesData.length === 0 ? (
                <div className="px-4 py-6 text-sm text-text-muted text-center">No shared pages</div>
              ) : (
                <div className="max-h-80 overflow-y-auto py-1">
                  {sharesData.map((s) => (
                    <div key={s.token} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted group">
                      <FileText className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{s.docName}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-text-muted">{s.category}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.mode === "read" ? "bg-blue-500/10 text-blue-600" : "bg-green-500/10 text-green-600"}`}>
                            {s.mode === "read" ? "Read" : "Read & Write"}
                          </span>
                          {s.hasPassword && <span title="Password-protected"><Lock className="w-3 h-3 text-amber-500" /></span>}
                          {s.expiresAt && (
                            <span className="text-[10px] text-text-muted flex items-center gap-0.5" title={`Expires: ${new Date(s.expiresAt).toLocaleString()}`}>
                              <Clock className="w-3 h-3" />
                              {new Date(s.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-text-muted mt-0.5">by {s.createdBy} · {new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                      <button
                        className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Revoke share"
                        onClick={async () => {
                          if (!currentSpace) return;
                          await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/shares`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "revoke", token: s.token }),
                          });
                          setSharesData((prev) => prev.filter((x) => x.token !== s.token));
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* API Docs */}
        <button
          onClick={() => router.push("/api-docs")}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="API Documentation"
        >
          <BookOpen className="w-4 h-4" />
        </button>

        {/* Archive */}
        {onOpenArchive && (
          <button
            onClick={onOpenArchive}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            data-tip="Archive"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}

        {/* Trash / Recycle bin */}
        {onOpenTrash && (
          <button
            onClick={onOpenTrash}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            data-tip="Recycle Bin"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        )}

        {/* Trophy / Leaderboard */}
        <div className="relative" ref={leaderboardRef}>
          <button
            onClick={async () => {
              setLeaderboardOpen((v) => !v);
              if (!leaderboardOpen && leaderboard.length === 0) {
                setLeaderboardLoading(true);
                try {
                  const res = await fetch("/api/audit/leaderboard");
                  if (res.ok) {
                    const data = await res.json();
                    setLeaderboard(data.leaders ?? []);
                  }
                } catch {}
                setLeaderboardLoading(false);
              }
            }}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            data-tip="Top Contributors"
          >
            <Trophy className="w-4 h-4" />
          </button>
          {leaderboardOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[240px]">
              <div className="px-3 py-2 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider">Top 10 Contributors</div>
              {leaderboardLoading ? (
                <div className="px-3 py-4 text-sm text-text-muted text-center">Loading…</div>
              ) : leaderboard.length === 0 ? (
                <div className="px-3 py-4 text-sm text-text-muted text-center">No activity yet</div>
              ) : (
                leaderboard.slice(0, 10).map((entry, i) => (
                  <div key={entry.actor} className="flex items-center gap-3 px-3 py-2 hover:bg-muted">
                    <span className={`w-5 text-center font-bold text-sm ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-text-muted"}`}>{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-text-primary truncate">{entry.actor}</span>
                    <span className="text-xs text-text-muted">{entry.count} edits</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Offline Bundle */}
        <button
          onClick={() => setOfflineBundleOpen(true)}
          className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
          data-tip="Offline Bundle"
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
            data-tip="Notifications"
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
                    {n.type === "new_user" ? (
                      <User className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                    )}
                    <div className="notif-item-body">
                      <span className="notif-item-msg">{n.message}</span>
                      <div className="notif-item-meta">
                        <span>{n.time}</span>
                        {n.type === "new_user" ? (
                          <button className="notif-action-btn" onClick={() => { setNotifsOpen(false); router.push("/admin"); }}>
                            Admin Panel
                          </button>
                        ) : (
                          <button className="notif-action-btn" onClick={() => { setNotifsOpen(false); onNotificationAction?.(n); }}>
                            Edit Now
                          </button>
                        )}
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
            data-tip={`Theme: ${currentThemeLabel}`}
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
