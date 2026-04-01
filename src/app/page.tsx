"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronsLeftRight, List, BookOpen, X, Minimize2, Loader2, ThumbsUp, Share2, Copy, Link, Archive, Trash2, Dices } from "lucide-react";
import Topbar from "@/components/Topbar";
import TableOfContents from "@/components/TableOfContents";
import { useTheme } from "@/components/ThemeProvider";
import Sidebar from "@/components/sidebar/Sidebar";
import DocActionsMenu from "@/components/DocActionsMenu";
import CreateCategoryModal from "@/components/modals/CreateCategoryModal";
import CreateDocModal from "@/components/modals/CreateDocModal";
import RenameCategoryModal from "@/components/modals/RenameCategoryModal";
import DeleteCategoryModal from "@/components/modals/DeleteCategoryModal";
import ArchiveModal from "@/components/modals/ArchiveModal";
import HistoryModal from "@/components/modals/HistoryModal";
import MoveDocModal from "@/components/modals/MoveDocModal";
import TemplateFormModal from "@/components/modals/TemplateFormModal";
import RenameDocModal from "@/components/modals/RenameDocModal";
import NewTemplateModal from "@/components/modals/NewTemplateModal";
import DatabaseCreateModal from "@/components/modals/EnhancedTableCreateModal";
import TrashBinModal from "@/components/modals/TrashBinModal";
import TagManagerModal from "@/components/modals/TagManagerModal";
import DatabaseView from "@/components/enhanced-table/EnhancedTableView";
import type { Space, SanitizedUser, Category, DocFile, TagsIndex, TemplateInfo, DocStatusEntry, DocStatusMap, ReviewItem, SpaceCustomization, DocMetadata, DocClassification, FavoriteItem, DashboardRole } from "@/lib/types";
import DocStatsFooter from "@/components/DocStatsFooter";
import DocStatusPopover from "@/components/DocStatusPopover";
import DocInfoPanel from "@/components/DocInfoPanel";
import SpaceHome from "@/components/SpaceHome";
import CategoryLanding from "@/components/CategoryLanding";
import SearchModal from "@/components/SearchModal";
import { usePresence } from "@/hooks/usePresence";
import { useDocWatcher } from "@/hooks/useDocWatcher";
import { copyToClipboard } from "@/lib/clipboard";
import { showCopyToast } from "@/components/CopyToast";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

/** Return black or white text depending on background luminance */
function tagContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

function TagAdder({ tagsIndex, existingTags, onAdd }: {
  tagsIndex: TagsIndex;
  existingTags: string[];
  onAdd: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setValue(""); }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allTags = Object.keys(tagsIndex).filter((t) => !existingTags.includes(t));
  const filtered = value
    ? allTags.filter((t) => t.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : allTags.slice(0, 8);

  const submit = (tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "");
    if (clean && !existingTags.includes(clean)) onAdd(clean);
    setValue("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button className="doc-tag-add" onClick={() => setOpen(true)} title="Add tag">+</button>
      {open && (
        <div className="doc-tag-dropdown">
          <input
            autoFocus
            className="doc-tag-input"
            placeholder="Add tag..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) submit(value); if (e.key === "Escape") { setOpen(false); setValue(""); } }}
          />
          {filtered.length > 0 && (
            <div className="doc-tag-suggestions">
              {filtered.map((t) => (
                <button key={t} className="doc-tag-suggestion" onClick={() => submit(t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { setAccentColor, setFontSize } = useTheme();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [dashboardRole, setDashboardRole] = useState<DashboardRole>("none");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [tagsIndex, setTagsIndex] = useState<TagsIndex>({});
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [activeDoc, setActiveDoc] = useState<{ name: string; category: string; isTemplate?: boolean } | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const editStartMarkdownRef = useRef<string | null>(null);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [docMetadata, setDocMetadata] = useState<DocMetadata | null>(null);
  const [docFileSize, setDocFileSize] = useState<number>(0);
  // Ref to track current doc identity — used to discard stale async responses
  const docKeyRef = useRef<string>("");

  // Modal state
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocDefaultCategory, setNewDocDefaultCategory] = useState<string | undefined>();
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryDefaultParent, setNewCategoryDefaultParent] = useState<string | undefined>();
  const [showRenameCategoryModal, setShowRenameCategoryModal] = useState(false);
  const [renameCategoryPath, setRenameCategoryPath] = useState("");
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [deleteCategoryPath, setDeleteCategoryPath] = useState("");
  const [deleteCategoryName, setDeleteCategoryName] = useState("");
  const [deleteCategoryDocCount, setDeleteCategoryDocCount] = useState(0);
  const [deleteCategorySubCount, setDeleteCategorySubCount] = useState(0);
  const [showDeleteDocModal, setShowDeleteDocModal] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<DocFile | null>(null);
  const [showMoveDocModal, setShowMoveDocModal] = useState(false);
  const [moveDocTarget, setMoveDocTarget] = useState<DocFile | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<"read" | "readwrite">("read");
  const [shareCopied, setShareCopied] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiry, setShareExpiry] = useState<string>("never");
  const [shareCustomExpiry, setShareCustomExpiry] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState<string | null>(null);

  // Doc status state
  const [docStatus, setDocStatus] = useState<DocStatusEntry>({ status: "draft" });
  const [docStatusMap, setDocStatusMap] = useState<DocStatusMap>({});
  const [spaceMembers, setSpaceMembers] = useState<{ username: string; fullName?: string }[]>([]);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [showClassPopover, setShowClassPopover] = useState(false);
  const classPopoverRef = useRef<HTMLDivElement>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [pendingDocLoad, setPendingDocLoad] = useState<{ name: string; category: string } | null>(null);
  const [pendingDatabaseLoad, setPendingDatabaseLoad] = useState<string | null>(null); // db ID

  // Template modal state
  const [showTplFormModal, setShowTplFormModal] = useState(false);
  const [activeTpl, setActiveTpl] = useState<TemplateInfo | null>(null);
  const [showRenameDocModal, setShowRenameDocModal] = useState(false);
  const [renameDocTarget, setRenameDocTarget] = useState<DocFile | null>(null);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateCategoryTarget, setNewTemplateCategoryTarget] = useState<string | undefined>();

  // Page width preference
  const [pageWidth, setPageWidth] = useState<"narrow" | "wide" | "max">("narrow");

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  // Customization (doc icons, category colors)
  const [customization, setCustomization] = useState<SpaceCustomization>({ docIcons: {}, docColors: {}, categoryIcons: {}, categoryColors: {}, tagColors: {} });

  // Tag manager modal
  const [showTagManager, setShowTagManager] = useState(false);

  // Likes / thumbs up
  const [docLikeCount, setDocLikeCount] = useState(0);
  const [docLiked, setDocLiked] = useState(false);

  // Reading view state
  const [readingView, setReadingView] = useState(false);

  // Server shutdown warning
  const [shutdownPending, setShutdownPending] = useState(false);
  const lastSavedMarkdownRef = useRef<string | null>(null);

  // Track whether user intentionally navigated to home (skip auto-select)
  const [showHome, setShowHome] = useState(true);

  // Category landing page
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Search modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>();

  // Unsaved changes guard
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  // Global Cmd+K / Ctrl+K shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Close classification popover on outside click
  useEffect(() => {
    if (!showClassPopover) return;
    const handle = (e: MouseEvent) => {
      if (classPopoverRef.current && !classPopoverRef.current.contains(e.target as Node)) setShowClassPopover(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showClassPopover]);

  // ESC to exit reading view
  useEffect(() => {
    if (!readingView) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setReadingView(false); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [readingView]);

  // Distraction-free edit mode
  const [distractionFree, setDistractionFree] = useState(false);

  // ESC to exit distraction-free mode (keeps editing active)
  useEffect(() => {
    if (!distractionFree) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setDistractionFree(false); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [distractionFree]);

  // TOC state
  const [tocOpen, setTocOpen] = useState(false);
  const [tocNumbering, setTocNumbering] = useState(false);

  // Listen for inline TOC numbering toggle
  useEffect(() => {
    const handler = (e: Event) => {
      const { enabled } = (e as CustomEvent<{ enabled: boolean }>).detail;
      setTocNumbering(enabled);
    };
    document.addEventListener("toc:numbering", handler);
    return () => document.removeEventListener("toc:numbering", handler);
  }, []);

  const openToc = () => {
    setTocOpen(true);
    if (typeof window !== "undefined") localStorage.setItem("doc-it-toc-open", "true");
  };
  const closeToc = () => {
    setTocOpen(false);
    if (typeof window !== "undefined") localStorage.setItem("doc-it-toc-open", "false");
  };

  // Databases sidebar list
  const [databasesList, setDatabasesList] = useState<{ id: string; title: string; rowCount: number; createdAt: string }[]>([]);
  const [showSidebarDbCreateModal, setShowSidebarDbCreateModal] = useState(false);
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null);
  const [activeDatabaseSearch, setActiveDatabaseSearch] = useState<string>("");

  // Listen for relation chip navigation from embedded database blocks
  useEffect(() => {
    const handler = (e: Event) => {
      const { dbId, search } = (e as CustomEvent<{ dbId: string; search: string }>).detail;
      setActiveDatabase(dbId);
      setActiveDatabaseSearch(search || "");
    };
    window.addEventListener("navigate-to-database", handler);
    return () => window.removeEventListener("navigate-to-database", handler);
  }, []);
  const [showEditDbModal, setShowEditDbModal] = useState(false);
  const [editDbTarget, setEditDbTarget] = useState<{ id: string; title: string } | null>(null);
  const [showDeleteDbModal, setShowDeleteDbModal] = useState(false);
  const [deleteDbTarget, setDeleteDbTarget] = useState<{ id: string; title: string } | null>(null);

  // Presence: real-time awareness of other editors
  const { otherEditors, hasOtherEditors } = usePresence({
    spaceSlug: currentSpace?.slug,
    docName: activeDoc?.name,
    category: activeDoc?.category,
    username: user?.username,
    isEditing,
  });
  const [showPresenceWarning, setShowPresenceWarning] = useState(false);

  // Anchor scroll state and backlinks
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<{ name: string; category: string }[]>([]);

  // Persistent notifications (Topbar bell)
  const [notifications, setNotifications] = useState<{ id: string; type?: string; message: string; docName: string; category: string; time: string; meta?: Record<string, string> }[]>([]);
  const addNotification = useCallback((message: string, docName: string, category: string, type?: string, meta?: Record<string, string>) => {
    setNotifications((prev) => [{
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      docName,
      category,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      meta,
    }, ...prev]);
  }, []);
  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);
  const clearNotifications = useCallback(() => setNotifications([]), []);

  // Doc availability watcher — independent SSE per watched doc
  const { watchList, watch: watchDoc, unwatch: unwatchDoc } = useDocWatcher({
    username: user?.username,
    onAvailable: (doc) => {
      addNotification(`"${doc.docName}" is now available for editing.`, doc.docName, doc.category);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Document available", {
          body: `"${doc.docName}" is now free to edit.`,
          icon: "/favicon.ico",
        });
      }
    },
  });

  // Init TOC + accent + favorites from user preferences
  useEffect(() => {
    if (!user) return;
    // TOC
    if (user.preferences?.alwaysShowToc) {
      setTocOpen(true);
    } else if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doc-it-toc-open");
      if (stored !== null) setTocOpen(stored === "true");
    }
    // Accent — sync server preference to localStorage (e.g. first login on new device)
    if (user.preferences?.accentColor) {
      setAccentColor(user.preferences.accentColor);
    }
    // Font size — sync server preference
    if (user.preferences?.fontSize) {
      setFontSize(user.preferences.fontSize);
    }
    // Page width
    if (user.preferences?.pageWidth) setPageWidth(user.preferences.pageWidth);
    // Favorites
    setFavorites(user.preferences?.favorites ?? []);
  }, [user, setAccentColor, setFontSize]);

  // Check auth
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup) { router.replace("/setup"); return; }
        if (!data.user) { router.replace("/login"); return; }
        setUser(data.user);
        setDashboardRole(data.dashboardRole ?? "none");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  // Fetch spaces
  useEffect(() => {
    if (!user) return;
    fetch("/api/spaces")
      .then((r) => r.json())
      .then((data) => {
        setSpaces(data);
        if (data.length > 0 && !currentSpace) {
          const defaultSlug = user.preferences?.defaultSpace;
          const defaultSpace = defaultSlug ? data.find((s: Space) => s.slug === defaultSlug) : null;
          setCurrentSpace(defaultSpace || data[0]);
        }
        setLoading(false);
      });
  }, [user, currentSpace]);

  // Fetch all space sidebar data via the combined init endpoint (1 request vs 8)
  const guardedNav = useCallback((action: () => void) => {
    if (!isEditing) { action(); return; }
    pendingNavRef.current = action;
    setShowUnsavedModal(true);
  }, [isEditing]);

  const fetchSpaceData = useCallback(async () => {
    if (!currentSpace) return;
    const slug = currentSpace.slug;
    const res = await fetch(`/api/spaces/${slug}/init`);
    if (!res.ok) return;
    const d = await res.json();
    setCategories(Array.isArray(d.categories) ? d.categories : []);
    setDocs(Array.isArray(d.docs) ? d.docs : []);
    setTagsIndex(d.tags && typeof d.tags === "object" && !Array.isArray(d.tags) ? d.tags : {});
    setTemplates(Array.isArray(d.templates) ? d.templates : []);
    setSpaceMembers(Array.isArray(d.members) ? d.members : []);
    setCustomization(d.customization?.docIcons ? d.customization : { docIcons: {}, docColors: {}, categoryIcons: {}, categoryColors: {}, tagColors: {} });
    setDatabasesList(Array.isArray(d.databases) ? d.databases : []);
    setDocStatusMap(d.statuses && typeof d.statuses === "object" ? d.statuses : {});
  }, [currentSpace]);

  useEffect(() => { fetchSpaceData(); }, [fetchSpaceData]);

  // Refresh databases list when a DB is created via slash command in Editor
  useEffect(() => {
    const handleDbCreated = () => { fetchSpaceData(); };
    document.addEventListener("database:created", handleDbCreated);
    return () => document.removeEventListener("database:created", handleDbCreated);
  }, [fetchSpaceData]);

  // Load document
  const loadDoc = useCallback(async (doc: DocFile) => {
    if (!currentSpace) return;
    // Immediately set the doc key so stale saves for old docs are discarded
    const key = `${currentSpace.slug}/${doc.category}/${doc.name}`;
    docKeyRef.current = key;
    // Clear old metadata instantly to prevent flash of stale data
    setDocMetadata(null);
    setDocFileSize(0);
    const qs = new URLSearchParams({ category: doc.category });
    if (doc.isTemplate) qs.set("isTemplate", "true");
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}?${qs}`
    );
    if (res.ok && docKeyRef.current === key) {
      const data = await res.json();
    setActiveDatabase(null);
    setActiveCategory(null);
    setShowHome(false);
    setActiveDoc({ name: doc.name, category: doc.category, isTemplate: !!doc.isTemplate });
      setMarkdown(data.content);
      setLastSavedMarkdown(data.content);
      setDocMetadata(data.metadata || {});
      setDocFileSize(data.fileSize || 0);
      setSaveStatus("saved");
      setIsEditing(false);
      setShowStatusPopover(false);
      setShowClassPopover(false);
      // Fetch revision history, status, and likes in parallel
      const histUrl = `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}/history?category=${encodeURIComponent(doc.category)}`;
      const statusUrl = `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}/status?category=${encodeURIComponent(doc.category)}`;
      const likesUrl = `/api/spaces/${currentSpace.slug}/likes?doc=${encodeURIComponent(`${doc.category}/${doc.name}`)}`;
      const [histRes, statusRes, likesRes] = await Promise.all([
        fetch(histUrl),
        doc.isTemplate ? Promise.resolve(null) : fetch(statusUrl),
        doc.isTemplate ? Promise.resolve(null) : fetch(likesUrl),
      ]);
      if (docKeyRef.current !== key) return;
      if (histRes.ok) {
        const revs = await histRes.json();
        setCurrentRevision(revs.length > 0 ? revs[revs.length - 1].rev : null);
      }
      if (statusRes && statusRes.ok) {
        setDocStatus(await statusRes.json());
      } else if (!doc.isTemplate) {
        setDocStatus({ status: "draft" });
      }
      if (likesRes && likesRes.ok) {
        const likesData = await likesRes.json();
        if (docKeyRef.current === key) {
          setDocLikeCount(likesData.count ?? 0);
          setDocLiked(!!likesData.likes?.[user?.username ?? ""]);
        }
      }
    }
  }, [currentSpace, user]);

  // Auto-select first doc (skip if user intentionally went home)
  useEffect(() => {
    if (docs.length > 0 && !activeDoc && !showHome && !activeCategory) loadDoc(docs[0]);
  }, [docs, activeDoc, loadDoc, showHome, activeCategory]);

  // Resolve pending doc load after space switch + data fetch
  useEffect(() => {
    if (pendingDocLoad && docs.length > 0) {
      const target = docs.find(
        (d) => d.name === pendingDocLoad.name && d.category === pendingDocLoad.category
      );
      if (target) {
        loadDoc(target);
        setPendingDocLoad(null);
      }
    }
  }, [docs, pendingDocLoad, loadDoc]);

  // Resolve pending database load after space switch
  useEffect(() => {
    if (pendingDatabaseLoad && databasesList.length > 0) {
      setActiveDatabase(pendingDatabaseLoad);
      setActiveDatabaseSearch("");
      setPendingDatabaseLoad(null);
    }
  }, [databasesList, pendingDatabaseLoad]);

  // Handle @mention events from the editor
  useEffect(() => {
    const handler = (e: Event) => {
      const { username } = (e as CustomEvent<{ username: string }>).detail;
      if (!currentSpace || !activeDoc) return;
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mention",
          targetUsername: username,
          spaceSlug: currentSpace.slug,
          docName: activeDoc.name,
          category: activeDoc.category,
        }),
      }).catch(() => {});
    };
    document.addEventListener("mention:user", handler);
    return () => document.removeEventListener("mention:user", handler);
  }, [currentSpace, activeDoc]);

  // Check for server-side notifications on login
  const [loginNotifs, setLoginNotifs] = useState<{ id: string; type?: string; message: string; docName: string; category: string; spaceSlug: string; createdAt: string }[]>([]);
  const [showLoginNotifsModal, setShowLoginNotifsModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/notifications")
      .then((r) => r.ok ? r.json() : { notifications: [] })
      .then((data) => {
        const unread = (data.notifications || []).filter((n: { read: boolean }) => !n.read);
        if (unread.length > 0) {
          setLoginNotifs(unread);
          setShowLoginNotifsModal(true);
          // Also add to the Topbar bell so they stay visible after dismissing the modal
          for (const n of unread) {
            addNotification(n.message, n.docName ?? "", n.category ?? "", n.type, n.meta);
          }
          // Mark all as read
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "mark-read" }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch review items across all accessible spaces
  const fetchAllReviews = useCallback(async () => {
    if (!user || spaces.length === 0) return;
    const results = await Promise.all(
      spaces.map((s) =>
        fetch(`/api/spaces/${s.slug}/reviews`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    setReviewItems(results.flat() as ReviewItem[]);
  }, [user, spaces]);

  useEffect(() => { fetchAllReviews(); }, [fetchAllReviews]);

  // Handle linked-doc navigation events fired by LinkedDocExtension
  useEffect(() => {
    const handler = (e: Event) => {
      const { docName, docCategory, anchor } = (e as CustomEvent).detail;
      const target = docs.find(
        (d) => d.name === docName && d.category === docCategory
      );
      if (target) {
        if (anchor) setPendingAnchor(anchor);
        guardedNav(() => loadDoc(target));
      }
    };
    document.addEventListener("navigate:doc", handler);
    return () => document.removeEventListener("navigate:doc", handler);
  }, [docs, loadDoc, guardedNav]);

  // Scroll to heading after anchor navigation (runs when activeDoc changes)
  useEffect(() => {
    if (!pendingAnchor || !activeDoc) return;
    const anchor = pendingAnchor;
    setPendingAnchor(null);
    setTimeout(() => {
      const proseMirror = document.querySelector(".ProseMirror");
      if (!proseMirror) return;
      const headings = proseMirror.querySelectorAll("h1,h2,h3,h4,h5,h6");
      for (const h of headings) {
        if (h.textContent?.trim().toLowerCase() === anchor.toLowerCase()) {
          h.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc]);

  // Keep a ref to the latest saved markdown for use in the shutdown handler
  // (state values are stale inside event listeners)
  useEffect(() => { lastSavedMarkdownRef.current = lastSavedMarkdown; }, [lastSavedMarkdown]);

  // Subscribe to server-sent events: shutdown warnings + real-time notifications
  useEffect(() => {
    const es = new EventSource("/api/system/events");

    es.addEventListener("shutdown", () => {
      setShutdownPending(true);
      const content = lastSavedMarkdownRef.current;
      if (content !== null) handleSave(content).catch(() => {});
    });

    es.addEventListener("notification", (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data);
        addNotification(n.message ?? "", n.docName ?? "", n.category ?? "", n.type, n.meta);
      } catch { /* malformed — ignore */ }
    });

    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch backlinks whenever the active document changes
  useEffect(() => {
    setBacklinks([]);
    if (!activeDoc || !currentSpace || activeDoc.isTemplate) return;
    fetch(
      `/api/spaces/${encodeURIComponent(currentSpace.slug)}/backlinks?doc=${encodeURIComponent(activeDoc.name)}&category=${encodeURIComponent(activeDoc.category)}`
    )
      .then((r) => (r.ok ? r.json() : { backlinks: [] }))
      .then((data) => setBacklinks(data.backlinks ?? []))
      .catch(() => {});
  }, [activeDoc, currentSpace]);

  // Save (auto-save while editing) — stores latest content for revision on Done
  const handleSave = useCallback(async (content: string) => {
    if (!activeDoc || !currentSpace) return;
    // Safety guard: never save empty content — prevents data loss from
    // race conditions during navigation, unmount flushes, or timing bugs.
    if (!content || !content.trim()) {
      console.warn("[doc-it] Blocked empty save for", activeDoc.name);
      return;
    }
    // Key from the closure's activeDoc — NOT docKeyRef which may already point to a new doc
    const saveKey = `${currentSpace.slug}/${activeDoc.category}/${activeDoc.name}`;
    setSaveStatus("saving");
    // Guard against overwriting a newly-loaded doc's content if the user
    // navigated away before this debounced save fired.
    if (docKeyRef.current === saveKey) setLastSavedMarkdown(content);
    const saveRes = await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        category: activeDoc.category,
        ...(activeDoc.isTemplate ? { isTemplate: true } : {}),
      }),
    });
    // Only update save status if we're still on the same doc.
    // Do NOT overwrite docMetadata here — metadata is managed exclusively
    // by loadDoc and handleUpdateMetadata to avoid race conditions.
    if (saveRes.ok) await saveRes.json();
    if (docKeyRef.current === saveKey) setSaveStatus("saved");
    fetch(`/api/spaces/${currentSpace.slug}/tags`).then((r) => r.json()).then(setTagsIndex);
    // Keep templates state fresh so TemplateFormModal always sees the latest field definitions
    if (activeDoc.isTemplate) {
      fetch(`/api/spaces/${currentSpace.slug}/templates`)
        .then((r) => r.json())
        .then((tpls) => setTemplates(Array.isArray(tpls) ? tpls : []));
    }
  }, [activeDoc, currentSpace]);

  // Customization handlers
  const handleSetDocIcon = useCallback(async (docKey: string, emoji: string) => {
    if (!currentSpace) return;
    setCustomization((prev) => {
      const next = { ...prev, docIcons: { ...prev.docIcons } };
      if (emoji) next.docIcons[docKey] = emoji;
      else delete next.docIcons[docKey];
      return next;
    });
    await fetch(`/api/spaces/${currentSpace.slug}/customization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docIcons: { [docKey]: emoji } }),
    });
  }, [currentSpace]);

  const handleSetDocColor = useCallback(async (docKey: string, color: string) => {
    if (!currentSpace) return;
    setCustomization((prev) => {
      const next = { ...prev, docColors: { ...prev.docColors } };
      if (color) next.docColors[docKey] = color;
      else delete next.docColors[docKey];
      return next;
    });
    await fetch(`/api/spaces/${currentSpace.slug}/customization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docColors: { [docKey]: color } }),
    });
  }, [currentSpace]);

  const handleSetCategoryIcon = useCallback(async (catPath: string, emoji: string) => {
    if (!currentSpace) return;
    setCustomization((prev) => {
      const next = { ...prev, categoryIcons: { ...prev.categoryIcons } };
      if (emoji) next.categoryIcons[catPath] = emoji;
      else delete next.categoryIcons[catPath];
      return next;
    });
    await fetch(`/api/spaces/${currentSpace.slug}/customization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryIcons: { [catPath]: emoji } }),
    });
  }, [currentSpace]);

  const handleSetCategoryColor = useCallback(async (catPath: string, color: string) => {
    if (!currentSpace) return;
    setCustomization((prev) => {
      const next = { ...prev, categoryColors: { ...prev.categoryColors } };
      if (color) next.categoryColors[catPath] = color;
      else delete next.categoryColors[catPath];
      return next;
    });
    await fetch(`/api/spaces/${currentSpace.slug}/customization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryColors: { [catPath]: color } }),
    });
  }, [currentSpace]);

  // Update doc metadata (tags, custom properties) — persists via PUT
  const handleUpdateMetadata = useCallback(async (newMeta: DocMetadata) => {
    if (!activeDoc || !currentSpace) return;
    const metaKey = `${currentSpace.slug}/${activeDoc.category}/${activeDoc.name}`;
    setDocMetadata(newMeta);
    const contentToSave = lastSavedMarkdown ?? markdown;
    // Safety guard: never save empty content during metadata update
    if (!contentToSave || !contentToSave.trim()) {
      console.warn("[doc-it] Blocked metadata save with empty content for", activeDoc.name);
      return;
    }
    const res = await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: contentToSave,
        category: activeDoc.category,
        metadata: newMeta,
        ...(activeDoc.isTemplate ? { isTemplate: true } : {}),
      }),
    });
    // Only update state if we're still on the same doc
    if (res.ok && docKeyRef.current === metaKey) {
      const data = await res.json();
      if (data.metadata) setDocMetadata(data.metadata);
    }
    // Refresh tags index when tags change
    fetch(`/api/spaces/${currentSpace.slug}/tags`).then((r) => r.json()).then(setTagsIndex);
  }, [activeDoc, currentSpace, lastSavedMarkdown, markdown]);

  const userRole = (() => {
    if (!user || !currentSpace) return null;
    if (user.isAdmin) return "admin";
    return currentSpace.permissions[user.username] || null;
  })();
  const canWrite = userRole === "admin" || userRole === "writer";

  const handleSwitchSpace = (slug: string) => {
    const space = spaces.find((s) => s.slug === slug);
    if (space) {
      setCurrentSpace(space);
      setActiveDoc(null);
      setMarkdown("");
      setCategories([]);
      setDocs([]);
      setTagsIndex({});
      setSelectedTag(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  // --- Modal openers (replace prompt/confirm) ---

  const handleNewDoc = (category?: string) => {
    if (!currentSpace || !canWrite) return;
    setNewDocDefaultCategory(category);
    setShowNewDocModal(true);
  };

  // Template handlers
  const handleNewTemplate = (targetCategory?: string) => {
    if (!currentSpace || !canWrite) return;
    setNewTemplateCategoryTarget(targetCategory);
    setShowNewTemplateModal(true);
  };

  const handleConfirmNewTemplate = async (name: string, category: string) => {
    if (!currentSpace) return;
    // Ensure the target category exists (create root Templates if needed)
    const catExists = categories.some((c) => c.path === category);
    if (!catExists) {
      await fetch(`/api/spaces/${currentSpace.slug}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Templates" }),
      });
    }
    const res = await fetch(`/api/spaces/${currentSpace.slug}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, isTemplate: true }),
    });
    if (res.ok) {
      await fetchSpaceData();
      const newDoc = await res.json();
      await loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug, isTemplate: true });
      setIsEditing(true);
    }
  };

  const handleSelectTemplate = (template: TemplateInfo) => {
    setActiveTpl(template);
    setShowTplFormModal(true);
  };

  const handleCreateFromTemplate = async (name: string, category: string, content: string) => {
    if (!currentSpace) return;
    const res = await fetch(`/api/spaces/${currentSpace.slug}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category }),
    });
    if (res.ok) {
      const newDoc = await res.json();
      // Save applied content immediately
      await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(newDoc.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, category }),
      });
      await fetchSpaceData();
      await loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug });
      setIsEditing(true);
    }
  };

  const handleExportTemplate = async (doc: DocFile) => {
    if (!currentSpace) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/templates/${encodeURIComponent(doc.name)}/export?category=${encodeURIComponent(doc.category)}`
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name}.mdt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = async (file: File) => {
    if (!currentSpace) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/spaces/${currentSpace.slug}/templates/import`, {
      method: "POST",
      body: formData,
    });
    await fetchSpaceData();
  };

  const handleCreateDoc = async (name: string, category: string) => {
    if (!currentSpace) return;
    const res = await fetch(`/api/spaces/${currentSpace.slug}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category }),
    });
    if (res.ok) {
      await fetchSpaceData();
      const newDoc = await res.json();
      await loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug });
      setIsEditing(true);
    }
  };

  const handleNewCategory = (parent?: string) => {
    if (!currentSpace || !canWrite) return;
    setNewCategoryDefaultParent(parent);
    setShowNewCategoryModal(true);
  };

  const handleCreateCategory = async (name: string, parent?: string) => {
    if (!currentSpace) return;
    await fetch(`/api/spaces/${currentSpace.slug}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent }),
    });
    await fetchSpaceData();
  };

  const handleRenameCategory = (path: string) => {
    if (!currentSpace || !canWrite) return;
    const cat = categories.find((c) => c.path === path);
    setRenameCategoryPath(path);
    setRenameCategoryName(cat?.name || "");
    setShowRenameCategoryModal(true);
  };

  const handleConfirmRenameCategory = async (newName: string) => {
    if (!currentSpace) return;
    await fetch(`/api/spaces/${currentSpace.slug}/categories/${renameCategoryPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName }),
    });
    await fetchSpaceData();
  };

  const handleDeleteCategory = (path: string) => {
    if (!currentSpace || !canWrite) return;
    const cat = categories.find((c) => c.path === path);
    // Count total docs recursively
    const countDocs = (p: string): number => {
      const direct = docs.filter((d) => d.category === p).length;
      const subs = categories.filter((c) => c.parent === p);
      return direct + subs.reduce((sum, s) => sum + countDocs(s.path), 0);
    };
    const directSubs = categories.filter((c) => c.parent === path).length;
    setDeleteCategoryPath(path);
    setDeleteCategoryName(cat?.name || path.split("/").pop() || path);
    setDeleteCategoryDocCount(countDocs(path));
    setDeleteCategorySubCount(directSubs);
    setShowDeleteCategoryModal(true);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!currentSpace) return;
    await fetch(`/api/spaces/${currentSpace.slug}/categories/${deleteCategoryPath}`, { method: "DELETE" });
    await fetchSpaceData();
    if (activeDoc && activeDoc.category.startsWith(deleteCategoryPath)) {
      setActiveDoc(null);
      setMarkdown("");
    }
  };

  const handleConfirmArchiveCategory = async (path?: string) => {
    if (!currentSpace) return;
    const target = path ?? deleteCategoryPath;
    await fetch(`/api/spaces/${currentSpace.slug}/categories/${target}`, { method: "POST" });
    await fetchSpaceData();
    if (activeDoc && activeDoc.category.startsWith(target)) {
      setActiveDoc(null);
      setMarkdown("");
    }
  };

  const handleEditDoc = (doc: DocFile) => {
    if (!currentSpace || !canWrite) return;
    setRenameDocTarget(doc);
    setShowRenameDocModal(true);
  };

  const handleConfirmRenameDoc = async (newName: string) => {
    if (!currentSpace || !renameDocTarget) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(renameDocTarget.name)}/rename`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName,
          category: renameDocTarget.category,
          isTemplate: !!renameDocTarget.isTemplate,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const safeName: string = data.name ?? newName;
      await fetchSpaceData();
      // Update activeDoc if we just renamed the currently open doc
      if (
        activeDoc?.name === renameDocTarget.name &&
        activeDoc?.category === renameDocTarget.category
      ) {
        setActiveDoc({ ...activeDoc, name: safeName });
      }
      // Sync client-side favorites (server already updated the JSON file)
      setFavorites((prev) =>
        prev.map((fav) =>
          fav.type === "doc" &&
          fav.name === renameDocTarget.name &&
          fav.category === renameDocTarget.category &&
          fav.spaceSlug === currentSpace.slug
            ? { ...fav, name: safeName }
            : fav
        )
      );
    }
  };

  // --- Doc title rename (from Editor title field) ---

  const handleTitleChange = useCallback(async (newName: string) => {
    if (!currentSpace || !activeDoc || !newName || newName === activeDoc.name) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}/rename`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName,
          category: activeDoc.category,
          isTemplate: !!activeDoc.isTemplate,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const safeName: string = data.name ?? newName;
      await fetchSpaceData();
      if (activeDoc) {
        setActiveDoc({ ...activeDoc, name: safeName });
      }
      // Sync favorites
      setFavorites((prev) =>
        prev.map((fav) =>
          fav.type === "doc" &&
          fav.name === activeDoc.name &&
          fav.category === activeDoc.category &&
          fav.spaceSlug === currentSpace.slug
            ? { ...fav, name: safeName }
            : fav
        )
      );
    }
  }, [activeDoc, currentSpace, fetchSpaceData]);

  // --- Doc status ---

  const handleSetStatus = async (status: import("@/lib/types").DocStatus, reviewer?: string) => {
    if (!activeDoc || !currentSpace) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}/status`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: activeDoc.category, status, reviewer }),
      }
    );
    if (res.ok) {
      const updated = await res.json();
      setDocStatus(updated);
      const key = `${activeDoc.category}/${activeDoc.name}`;
      setDocStatusMap((prev) => ({ ...prev, [key]: updated }));
      fetchAllReviews();
    }
  };

  // --- Doc bar actions ---

  const handleToggleEdit = async () => {
    if (isEditing) {
      // Done editing — create a revision if content changed
      if (activeDoc && currentSpace && lastSavedMarkdown !== null) {
        const res = await fetch(
          `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}/history`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: lastSavedMarkdown,
              category: activeDoc.category,
              username: user?.username || "unknown",
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.created) setCurrentRevision(data.rev);
        }
      }
      setIsEditing(false);
      setDistractionFree(false);
      // Auto-open status popover after finishing an edit (non-template docs)
      if (activeDoc && !activeDoc.isTemplate && canWrite) {
        setShowStatusPopover(true);
      }
    } else {
      // Soft-lock: warn if others are editing
      if (hasOtherEditors) {
        setShowPresenceWarning(true);
      } else {
      editStartMarkdownRef.current = lastSavedMarkdown ?? markdown;
        setIsEditing(true);
      }
    }
  };

  const handleDiscard = async () => {
    if (!activeDoc || !currentSpace) return;
    const original = editStartMarkdownRef.current;
    if (original === null) { setIsEditing(false); return; }
    // Save original content back to disk (overwrite autosaved changes)
    setSaveStatus("saving");
    await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: original,
        category: activeDoc.category,
        ...(activeDoc.isTemplate ? { isTemplate: true } : {}),
      }),
    });
    setLastSavedMarkdown(original);
    setMarkdown(original);
    setEditorResetKey((k) => k + 1);
    setSaveStatus("saved");
    setIsEditing(false);
    setDistractionFree(false);
    editStartMarkdownRef.current = null;
  };

  const handleUnsavedSave = async () => {
    const fn = pendingNavRef.current;
    pendingNavRef.current = null;
    setShowUnsavedModal(false);
    await handleToggleEdit();
    fn?.();
  };

  const handleUnsavedDiscard = async () => {
    const fn = pendingNavRef.current;
    pendingNavRef.current = null;
    setShowUnsavedModal(false);
    await handleDiscard();
    fn?.();
  };

  const handleUnsavedCancel = () => {
    setShowUnsavedModal(false);
    pendingNavRef.current = null;
  };

  const handleEnterDistractionFree = () => {
    if (hasOtherEditors) { setShowPresenceWarning(true); return; }
    editStartMarkdownRef.current = lastSavedMarkdown ?? markdown;
    setIsEditing(true);
    setDistractionFree(true);
  };

  const handleCopyMarkdown = async () => {
    if (lastSavedMarkdown) {
      const cls = docMetadata?.classification;
      if (cls === "confidential" || cls === "restricted") {
        if (!window.confirm(`This document is classified as "${cls}". Are you sure you want to copy its content to the clipboard?`)) return;
      }
      const ok = await copyToClipboard(lastSavedMarkdown);
      if (ok) showCopyToast("Markdown copied!");
    }
  };

  const [showPrintToast, setShowPrintToast] = useState(false);
  const handlePrint = () => {
    const cls = docMetadata?.classification;
    if (cls === "confidential" || cls === "restricted") {
      if (!window.confirm(`This document is classified as "${cls}". Are you sure you want to print it?`)) return;
    }
    setShowPrintToast(true);
    // Give the toast a moment to render, then trigger print
    setTimeout(() => {
      setShowPrintToast(false);
      // Small delay so the toast disappears before print dialog
      requestAnimationFrame(() => window.print());
    }, 800);
  };

  const handleArchiveDoc = async () => {
    if (!activeDoc || !currentSpace || !canWrite) return;
    await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}/archive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: activeDoc.category }),
      }
    );
    await fetchSpaceData();
    setActiveDoc(null);
    setMarkdown("");
  };

  const handleRestoreRevision = async (rev: number) => {
    if (!activeDoc || !currentSpace) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}/history/${rev}/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: activeDoc.category, username: user?.username }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      setCurrentRevision(data.rev);
      // Reload the document
      loadDoc({ name: activeDoc.name, filename: `${activeDoc.name}.md`, category: activeDoc.category, space: currentSpace.slug });
    }
  };

  const handleDeleteDoc = (doc: DocFile) => {
    if (!currentSpace || !canWrite) return;
    setDeleteDocTarget(doc);
    setShowDeleteDocModal(true);
  };

  const handleConfirmDeleteDoc = async () => {
    if (!currentSpace || !deleteDocTarget) return;
    await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(deleteDocTarget.name)}?category=${encodeURIComponent(deleteDocTarget.category)}`,
      { method: "DELETE" }
    );
    await fetchSpaceData();
    if (activeDoc?.name === deleteDocTarget.name && activeDoc?.category === deleteDocTarget.category) {
      setActiveDoc(null);
      setMarkdown("");
    }
  };

  const handleMoveDoc = (doc: DocFile) => {
    if (!currentSpace || !canWrite) return;
    setMoveDocTarget(doc);
    setShowMoveDocModal(true);
  };

  const handleConfirmMoveDoc = async (name: string, toCategory: string) => {
    if (!currentSpace || !moveDocTarget) return;
    await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(moveDocTarget.name)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCategory: moveDocTarget.category, toCategory }),
    });
    await fetchSpaceData();
    if (activeDoc?.name === moveDocTarget.name) setActiveDoc({ ...activeDoc, category: toCategory });
  };

  const handleNavigateToReview = (item: ReviewItem) => {
    guardedNav(() => {
      if (item.spaceSlug !== currentSpace?.slug) {
        handleSwitchSpace(item.spaceSlug);
        setPendingDocLoad({ name: item.docName, category: item.category });
      } else {
        const target = docs.find(
          (d) => d.name === item.docName && d.category === item.category
        );
        if (target) loadDoc(target);
      }
    });
  };

  // --- Default space ---

  const handleSetDefaultSpace = useCallback((slug: string | null) => {
    setUser((prev) => prev ? { ...prev, preferences: { ...prev.preferences, defaultSpace: slug ?? undefined } } : prev);
    fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { defaultSpace: slug } }),
    });
  }, []);

  // --- Page width ---

  const handlePageWidthChange = useCallback((w: "narrow" | "wide" | "max") => {
    setPageWidth(w);
    fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { pageWidth: w } }),
    });
  }, []);

  // --- Favorites ---

  const handleToggleFavorite = useCallback((item: FavoriteItem) => {
    setFavorites((prev) => {
      const key = item.type === "database"
        ? (f: FavoriteItem) => f.type === "database" && f.spaceSlug === item.spaceSlug && f.id === item.id
        : (f: FavoriteItem) => f.type === "doc" && f.spaceSlug === item.spaceSlug && f.name === item.name && f.category === item.category;
      const exists = prev.some(key);
      const next = exists ? prev.filter((f) => !key(f)) : [...prev, item];
      // Persist async (fire-and-forget)
      fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { favorites: next } }),
      });
      return next;
    });
  }, []);

  const handleSelectFavorite = useCallback((item: FavoriteItem) => {
    if (item.type === "doc") {
      if (item.spaceSlug !== currentSpace?.slug) {
        handleSwitchSpace(item.spaceSlug);
        setPendingDocLoad({ name: item.name, category: item.category ?? "" });
      } else {
        const target = docs.find((d) => d.name === item.name && d.category === item.category);
        if (target) loadDoc(target);
      }
    } else if (item.type === "database") {
      if (item.spaceSlug !== currentSpace?.slug) {
        handleSwitchSpace(item.spaceSlug);
        setPendingDatabaseLoad(item.id ?? "");
      } else {
        setActiveDatabase(item.id ?? "");
        setActiveDatabaseSearch("");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpace, docs, loadDoc]);

  // --- Database edit/delete ---

  const handleEditDatabase = (db: { id: string; title: string }) => {
    setEditDbTarget(db);
    setShowEditDbModal(true);
  };

  const handleConfirmEditDatabase = async (title: string) => {
    if (!currentSpace || !editDbTarget) return;
    await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/enhanced-tables/${editDbTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await fetchSpaceData();
  };

  const handleDeleteDatabase = (db: { id: string; title: string }) => {
    setDeleteDbTarget(db);
    setShowDeleteDbModal(true);
  };

  const handleArchiveDatabase = async () => {
    if (!currentSpace || !deleteDbTarget) return;
    await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/enhanced-tables/${deleteDbTarget.id}/archive`, {
      method: "POST",
    });
    if (activeDatabase === deleteDbTarget.id) {
      setActiveDatabase(null);
      setActiveDatabaseSearch("");
    }
    await fetchSpaceData();
  };

  const handleConfirmDeleteDatabase = async () => {
    if (!currentSpace || !deleteDbTarget) return;
    await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/enhanced-tables/${deleteDbTarget.id}`, {
      method: "DELETE",
    });
    if (activeDatabase === deleteDbTarget.id) {
      setActiveDatabase(null);
      setActiveDatabaseSearch("");
    }
    await fetchSpaceData();
  };

  const handleTagSelect = (tagName: string) => {
    setSelectedTag(selectedTag === tagName ? null : tagName);
  };

  // Called from editor tag click: navigate to doc if only 1, else select the tag
  const handleEditorTagClick = (tagName: string) => {
    const tagInfo = tagsIndex[tagName];
    if (!tagInfo) return;

    // Find matching docs
    const matchingDocs = docs.filter((d) =>
      tagInfo.docNames.some((tn) =>
        tn === d.name || tn === `${d.category}/${d.name}` || tn.endsWith(`/${d.name}`)
      )
    );

    if (matchingDocs.length === 1) {
      // Navigate directly to the single doc
      guardedNav(() => loadDoc(matchingDocs[0]));
    } else if (matchingDocs.length > 1) {
      // Select the tag to show docs in sidebar
      setSelectedTag(tagName);
    }
  };

  const [adminContacts, setAdminContacts] = useState<{ username: string; email: string }[]>([]);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexToastMsg, setReindexToastMsg] = useState<string | null>(null);
  const handleReindexTags = async () => {
    if (!currentSpace || isReindexing) return;
    setIsReindexing(true);
    try {
      const res = await fetch(`/api/spaces/${currentSpace.slug}/tags`, { method: "POST" });
      if (res.ok) {
        const tags = await res.json();
        setTagsIndex(tags);
        const count = Object.keys(tags).length;
        setReindexToastMsg(`Tags reindexed — ${count} tag${count !== 1 ? "s" : ""} found`);
        setTimeout(() => setReindexToastMsg(null), 3000);
      } else {
        setReindexToastMsg("Reindex failed");
        setTimeout(() => setReindexToastMsg(null), 3000);
      }
    } finally {
      setIsReindexing(false);
    }
  };

  // Fetch admin contacts when user has no spaces
  useEffect(() => {
    if (!loading && user && !user.isAdmin && spaces.length === 0) {
      fetch("/api/auth/admins")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAdminContacts(data); })
        .catch(() => {});
    }
  }, [loading, user, spaces]);

  // Warn on browser-level navigation (reload, tab close) while editing
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditing]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;
  }

  // Pending access screen — user has no spaces assigned
  if (user && !user.isAdmin && spaces.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-alt">
        <div className="w-full max-w-md">
          <div className="bg-surface rounded-xl shadow-lg p-8 border border-border text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--color-accent-light)] text-accent flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10a4 4 0 110 8 4 4 0 010-8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Access Pending</h1>
            <p className="text-sm text-text-muted mb-6">
              Your account has been created, but you have not been assigned to any space yet.
              Please contact an administrator to get access.
            </p>
            {adminContacts.length > 0 && (
              <div className="bg-[var(--color-muted)] rounded-lg p-4 text-left mb-6">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Administrators</p>
                <div className="space-y-2">
                  {adminContacts.map((admin) => (
                    <div key={admin.username} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary">{admin.username}</span>
                      {admin.email ? (
                        <a
                          href={`mailto:${admin.email}`}
                          className="text-sm text-accent hover:underline"
                        >
                          {admin.email}
                        </a>
                      ) : (
                        <span className="text-xs text-text-muted italic">No email</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium bg-[var(--color-muted)] text-text-secondary rounded-lg hover:bg-[var(--color-muted-hover)] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Topbar
        currentSpace={currentSpace}
        spaces={spaces}
        user={user}
        onSwitchSpace={(slug) => guardedNav(() => handleSwitchSpace(slug))}
        onLogout={handleLogout}
        onOpenArchive={() => setShowArchiveModal(true)}
        onOpenTrash={() => setShowTrashModal(true)}
        onHome={() => guardedNav(() => { setActiveDoc(null); setActiveDatabase(null); setActiveDatabaseSearch(""); setActiveCategory(null); setShowHome(true); })}
        onSearch={(q) => { setSearchInitialQuery(q); setShowSearchModal(true); }}
        reviewItems={reviewItems}
        onNavigateToReview={handleNavigateToReview}
        notifications={notifications}
        onDismissNotification={dismissNotification}
        onClearNotifications={clearNotifications}
        onNotificationAction={(n) => {
          dismissNotification(n.id);
          const target = docs.find((d) => d.name === n.docName && d.category === n.category);
          if (target) guardedNav(() => { loadDoc(target); setIsEditing(true); })
        }}
        onSetDefaultSpace={handleSetDefaultSpace}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          categories={categories}
          docs={docs}
          tagsIndex={tagsIndex}
          databases={databasesList}
          activeDoc={activeDoc}
          onSelectDoc={(doc) => guardedNav(() => loadDoc(doc))}
          onNewDoc={handleNewDoc}
          onNewCategory={handleNewCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onArchiveCategory={(path) => handleConfirmArchiveCategory(path)}
          onEditDoc={handleEditDoc}
          onDeleteDoc={handleDeleteDoc}
          onMoveDoc={handleMoveDoc}
          onTagSelect={handleTagSelect}
          selectedTag={selectedTag}
          canWrite={canWrite}
          onReindexTags={handleReindexTags}
          isReindexing={isReindexing}
          onNewTemplate={handleNewTemplate}
          onExportTemplate={handleExportTemplate}
          onImportTemplate={handleImportTemplate}
          onNewDatabase={() => setShowSidebarDbCreateModal(true)}
          onSelectDatabase={(dbId) => guardedNav(() => { setActiveDatabase(dbId); setActiveDatabaseSearch(""); setActiveCategory(null); })}
          onEditDatabase={handleEditDatabase}
          onDeleteDatabase={handleDeleteDatabase}
          customization={customization}
          docStatusMap={docStatusMap}
          onSetDocIcon={handleSetDocIcon}
          onSetDocColor={handleSetDocColor}
          onSetCategoryIcon={handleSetCategoryIcon}
          onSetCategoryColor={handleSetCategoryColor}
          favorites={favorites}
          currentSpaceSlug={currentSpace?.slug}
          currentSpaceName={currentSpace?.name}
          onToggleFavorite={handleToggleFavorite}
          onSelectFavorite={(item) => guardedNav(() => handleSelectFavorite(item))}
          onOpenTagManager={() => setShowTagManager(true)}
          onOpenCategory={(path) => guardedNav(() => {
            setActiveCategory(path);
            setActiveDoc(null);
            setActiveDatabase(null);
            setActiveDatabaseSearch("");
            setShowHome(false);
          })}
        />
        <div className={`flex-1 flex flex-col overflow-hidden${distractionFree ? " df-mode" : ""}`}>
          {activeCategory && currentSpace ? (
            <CategoryLanding
              spaceSlug={currentSpace.slug}
              categoryPath={activeCategory}
              onOpenDoc={(name, category) => {
                const target = docs.find((d) => d.name === name && d.category === category);
                if (target) { setActiveCategory(null); loadDoc(target); }
              }}
              onOpenDatabase={(dbId) => {
                setActiveCategory(null);
                setActiveDatabase(dbId);
                setActiveDatabaseSearch("");
              }}
              onOpenSubCategory={(path) => setActiveCategory(path)}
            />
          ) : activeDatabase && currentSpace ? (
            <DatabaseView
              key={activeDatabase}
              dbId={activeDatabase}
              spaceSlug={currentSpace.slug}
              canWrite={canWrite}
              initialSearch={activeDatabaseSearch}
              onOpenDatabase={(dbId: string, search?: string) => {
                setActiveDatabase(dbId);
                setActiveDatabaseSearch(search || "");
              }}
              onClose={() => { setActiveDatabase(null); setActiveDatabaseSearch(""); }}
              tagColors={customization.tagColors}
            />
          ) : (<>
          {!distractionFree && (
          <div className="h-10 border-b border-border bg-surface flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
              <span className="text-sm text-text-muted">
                {activeDoc ? `${activeDoc.category} / ${activeDoc.name}${activeDoc.isTemplate ? ".mdt" : ".md"}` : "Select a document"}
              </span>
              {/* Page width toggle — appears on hover near the document title */}
              {activeDoc && (
                <div className="flex items-center rounded-full border border-border bg-surface overflow-hidden text-xs shadow-sm flex-shrink-0">
                  <span className="px-2 py-1 text-text-muted border-r border-border flex items-center">
                    <ChevronsLeftRight className="w-3 h-3" />
                  </span>
                  {(["narrow", "wide", "max"] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => handlePageWidthChange(w)}
                      className={`px-2.5 py-1 font-medium border-r border-border last:border-r-0 transition-colors ${
                        pageWidth === w
                          ? "bg-accent text-accent-foreground"
                          : "text-text-secondary hover:bg-muted"
                      }`}
                    >
                      {w === "narrow" ? "Narrow" : w === "wide" ? "Wide" : "Max"}
                    </button>
                  ))}
                </div>
              )}
              {activeDoc && currentRevision !== null && (
                <button
                  className="doc-bar-revision"
                  onClick={() => setShowHistoryModal(true)}
                  title="View revision history"
                >
                  Rev {currentRevision}
                </button>
              )}
              {/* Tag chips */}
              {activeDoc && !activeDoc.isTemplate && docMetadata?.tags && docMetadata.tags.length > 0 && (
                <div className="doc-tag-chips">
                  {docMetadata.tags.map((tag) => {
                    const tagColor = customization.tagColors?.[tag];
                    return (
                      <span
                        key={tag}
                        className="doc-tag-chip"
                        style={tagColor ? { background: tagColor, color: tagContrastText(tagColor) } : undefined}
                      >
                        {tag}
                        {canWrite && (
                          <button
                            className="doc-tag-chip-remove"
                            style={tagColor ? { color: tagContrastText(tagColor) } : undefined}
                            onClick={() => {
                              const next = { ...docMetadata, tags: docMetadata.tags!.filter((t) => t !== tag) };
                              handleUpdateMetadata(next);
                            }}
                            title={`Remove tag "${tag}"`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              {activeDoc && !activeDoc.isTemplate && canWrite && (
                <TagAdder
                  tagsIndex={tagsIndex}
                  existingTags={docMetadata?.tags || []}
                  onAdd={(tag) => {
                    const tags = [...(docMetadata?.tags || []), tag];
                    handleUpdateMetadata({ ...(docMetadata || {}), tags });
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Presence avatars */}
              {otherEditors.length > 0 && (
                <div className="presence-avatars">
                  {otherEditors.slice(0, 4).map((name) => (
                    <span key={name} className="presence-avatar" title={`${name} is editing`}>
                      {name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {otherEditors.length > 4 && (
                    <span className="presence-avatar presence-avatar--more" title={otherEditors.slice(4).join(", ")}>
                      +{otherEditors.length - 4}
                    </span>
                  )}
                </div>
              )}
              {isEditing && (
                <span className="text-xs text-text-muted mr-1">
                  {saveStatus === "saving" ? "Saving..." : "Autosave on"}
                </span>
              )}
              {activeDoc && !isEditing && (
                <button
                  className={`doc-action-icon-btn${readingView ? " active" : ""}`}
                  onClick={() => setReadingView((v) => !v)}
                  title={readingView ? "Exit reading view" : "Reading view"}
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              )}
              {/* Thumbs up / like */}
              {activeDoc && !activeDoc.isTemplate && (
                <button
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                    docLiked
                      ? "bg-accent text-white border-accent"
                      : "bg-transparent text-text-muted border-border hover:bg-muted"
                  }`}
                  onClick={async () => {
                    if (!currentSpace || !activeDoc) return;
                    const docKey = `${activeDoc.category}/${activeDoc.name}`;
                    const res = await fetch(`/api/spaces/${currentSpace.slug}/likes`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ doc: docKey }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setDocLiked(data.liked);
                      setDocLikeCount(data.count);
                    }
                  }}
                  title={docLiked ? "Remove your like" : "Like this document"}
                >
                  <ThumbsUp className={`w-3 h-3 ${docLiked ? "fill-current" : ""}`} />
                  {docLikeCount > 0 && <span>{docLikeCount}</span>}
                </button>
              )}
              {/* Classification badge */}
              {activeDoc && !activeDoc.isTemplate && (() => {
                const cls = docMetadata?.classification || "internal";
                const classColors: Record<string, string> = {
                  public: "bg-green-100 text-green-800 border-green-300",
                  internal: "bg-blue-100 text-blue-800 border-blue-300",
                  confidential: "bg-amber-100 text-amber-800 border-amber-300",
                  restricted: "bg-red-100 text-red-800 border-red-300",
                };
                return canWrite ? (
                  <div className="relative" ref={classPopoverRef}>
                    <button
                      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${classColors[cls] || classColors.internal}`}
                      onClick={() => setShowClassPopover((v) => !v)}
                      title={`Classification: ${cls}`}
                    >
                      {cls}
                    </button>
                    {showClassPopover && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[140px]" style={{ right: 0, left: "auto" }}>
                        {(["public", "internal", "confidential", "restricted"] as DocClassification[]).map((opt) => (
                          <button
                            key={opt}
                            className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-muted capitalize ${cls === opt ? "font-bold" : ""}`}
                            onClick={() => {
                              const newMeta = { ...(docMetadata || {}), classification: opt };
                              handleUpdateMetadata(newMeta);
                              setShowClassPopover(false);
                            }}
                          >
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${opt === "public" ? "bg-green-500" : opt === "internal" ? "bg-blue-500" : opt === "confidential" ? "bg-amber-500" : "bg-red-500"}`} />
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${classColors[cls] || classColors.internal}`}
                    style={{ cursor: "default" }}
                    title={`Classification: ${cls}`}
                  >
                    {cls}
                  </span>
                );
              })()}
              {activeDoc && !activeDoc.isTemplate && (() => {
                const isAssignedReviewer = !canWrite && !!user && docStatus.reviewer === user.username;
                const canInteractWithStatus = canWrite || isAssignedReviewer;
                return canInteractWithStatus ? (
                  <div className="relative">
                    <button
                      className={`doc-status-badge doc-status-${docStatus.status}`}
                      onClick={() => setShowStatusPopover((v) => !v)}
                      title={`Status: ${docStatus.status}${docStatus.reviewer ? ` · reviewer: ${docStatus.reviewer}` : ""}`}
                    >
                      {docStatus.status}
                    </button>
                    <DocStatusPopover
                      isOpen={showStatusPopover}
                      onClose={() => setShowStatusPopover(false)}
                      currentStatus={docStatus.status}
                      currentReviewer={docStatus.reviewer}
                      members={spaceMembers}
                      onSave={handleSetStatus}
                      canAssignReview={canWrite}
                    />
                  </div>
                ) : (
                  <span
                    className={`doc-status-badge doc-status-${docStatus.status}`}
                    style={{ cursor: "default" }}
                    title={`Status: ${docStatus.status}`}
                  >
                    {docStatus.status}
                  </span>
                );
              })()}
              {activeDoc && (
                <DocActionsMenu
                  canWrite={canWrite}
                  isEditing={isEditing}
                  onToggleEdit={handleToggleEdit}
                  onDiscard={handleDiscard}
                  onDistractionFree={canWrite ? handleEnterDistractionFree : undefined}
                  onCopyMarkdown={handleCopyMarkdown}
                  onPrint={handlePrint}
                  onHistory={() => setShowHistoryModal(true)}
                  onMove={() => {
                    if (activeDoc) {
                      setMoveDocTarget({ name: activeDoc.name, filename: `${activeDoc.name}${activeDoc.isTemplate ? ".mdt" : ".md"}`, category: activeDoc.category, space: currentSpace?.slug || "" });
                      setShowMoveDocModal(true);
                    }
                  }}
                  onArchive={handleArchiveDoc}
                  onDelete={() => {
                    if (activeDoc) {
                      setDeleteDocTarget({ name: activeDoc.name, filename: `${activeDoc.name}${activeDoc.isTemplate ? ".mdt" : ".md"}`, category: activeDoc.category, space: currentSpace?.slug || "" });
                      setShowDeleteDocModal(true);
                    }
                  }}
                  isFavorite={!activeDoc.isTemplate && favorites.some(
                    (f) => f.type === "doc" && f.spaceSlug === currentSpace?.slug && f.name === activeDoc.name && f.category === activeDoc.category
                  )}
                  onToggleFavorite={!activeDoc.isTemplate && currentSpace ? () => handleToggleFavorite({
                    type: "doc",
                    name: activeDoc.name,
                    category: activeDoc.category,
                    spaceSlug: currentSpace.slug,
                    spaceName: currentSpace.name,
                  }) : undefined}
                  onShare={canWrite && !activeDoc.isTemplate ? () => {
                    setShareLink(null);
                    setShareCopied(false);
                    setShareMode("read");
                    setSharePassword("");
                    setShareExpiry("never");
                    setShareCustomExpiry("");
                    setShowShareModal(true);
                  } : undefined}
                />
              )}
            </div>
          </div>
          )}
          {distractionFree && activeDoc && (
            <div className="df-bar">
              <span className="df-bar-title">{activeDoc.name}</span>
              <span className="text-xs text-text-muted">
                {saveStatus === "saving" ? "Saving..." : "Autosave on"}
              </span>
              <div className="df-bar-actions">
                <button onClick={handleDiscard} className="df-bar-btn df-bar-btn--discard" title="Discard changes">Discard</button>
                <button onClick={handleToggleEdit} className="df-bar-btn df-bar-btn--done" title="Save and exit editing">Done</button>
                <button onClick={() => setDistractionFree(false)} className="doc-action-icon-btn" title="Exit distraction-free mode (ESC)">
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {/* Server shutdown warning banner */}
          {shutdownPending && (
            <div className="presence-warning" style={{ background: "var(--color-destructive, #dc2626)", borderColor: "transparent" }}>
              <span style={{ color: "#fff" }}>
                <strong>⚠ The server is shutting down.</strong> Your work has been saved. Please close this tab — the application will be unavailable shortly.
              </span>
            </div>
          )}
          {/* Presence warning banner */}
          {showPresenceWarning && (
            <div className="presence-warning">
              <span>
                <strong>{otherEditors.join(", ")}</strong> {otherEditors.length === 1 ? "is" : "are"} currently editing this document. Editing simultaneously may cause conflicts.
              </span>
              <div className="presence-warning-actions">
                <button
                  className="presence-warning-btn presence-warning-btn--notify"
                  onClick={() => {
                    if (typeof Notification !== "undefined" && Notification.permission === "default") {
                      Notification.requestPermission();
                    }
                    setShowPresenceWarning(false);
                    if (activeDoc && currentSpace) {
                      watchDoc({ spaceSlug: currentSpace.slug, docName: activeDoc.name, category: activeDoc.category });
                    }
                  }}
                >
                  Notify Me
                </button>
                <button
                  className="presence-warning-btn presence-warning-btn--cancel"
                  onClick={() => setShowPresenceWarning(false)}
                >
                  Cancel
                </button>
                <button
                  className="presence-warning-btn presence-warning-btn--proceed"
                  onClick={() => { setShowPresenceWarning(false); editStartMarkdownRef.current = lastSavedMarkdown ?? markdown; setIsEditing(true); }}
                >
                  Edit Anyway
                </button>
              </div>
            </div>
          )}
          {!distractionFree && activeDoc && docMetadata && (
            <DocInfoPanel
              metadata={docMetadata}
              fileSize={docFileSize}
              category={activeDoc.category}
              canWrite={canWrite}
              onUpdateMetadata={handleUpdateMetadata}
            />
          )}
          {/* Editor + TOC row */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeDoc ? (
                <Editor
                  key={`${currentSpace?.slug}/${activeDoc.category}/${activeDoc.name}-${editorResetKey}`}
                  filename={activeDoc.name}
                  initialMarkdown={markdown}
                  onSave={handleSave}
                  onTitleChange={handleTitleChange}
                  spaceSlug={currentSpace?.slug || ""}
                  category={activeDoc.category}
                  onTagClick={handleEditorTagClick}
                  editable={isEditing}
                  lineSpacing={user?.preferences?.editorLineSpacing ?? "compact"}
                  pageWidth={pageWidth}
                  onPageWidthChange={handlePageWidthChange}
                  isTemplate={!!activeDoc.isTemplate}
                  spellcheckEnabled={user?.preferences?.spellcheckEnabled ?? false}
                  spellcheckLanguage={user?.preferences?.spellcheckLanguage ?? "en"}
                  spaceMembers={spaceMembers}
                  tagColors={customization.tagColors}
                />
              ) : null}
              {!activeDoc && (
                currentSpace ? (
                  <SpaceHome
                    spaceSlug={currentSpace.slug}
                    spaceName={currentSpace.name}
                    dashboardRole={dashboardRole}
                    onOpenDoc={(name, category) => {
                      const target = docs.find((d) => d.name === name && d.category === category);
                      if (target) loadDoc(target);
                    }}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-text-muted h-full">
                    <p>Create or select a document to start editing</p>
                  </div>
                )
              )}
            </div>

            {/* TOC panel */}
            {tocOpen && activeDoc && docMetadata && (
              <TableOfContents
                markdown={lastSavedMarkdown || markdown}
                onClose={closeToc}
                backlinks={activeDoc.isTemplate ? [] : backlinks}
                onBacklinkClick={(bl) => {
                  const target = docs.find((d) => d.name === bl.name && d.category === bl.category);
                  if (target) guardedNav(() => loadDoc(target));
                }}
                showNumbering={tocNumbering}
              />
            )}

            {/* TOC tab — always visible when closed and a doc is open */}
            {!tocOpen && activeDoc && (
              <button
                onClick={openToc}
                title="Show table of contents"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center gap-1.5 py-3 bg-surface border border-r-0 border-border rounded-l-md hover:bg-accent/10 text-text-muted hover:text-accent transition-all shadow-sm"
                style={{ width: 24, borderLeftWidth: 2, borderLeftColor: "var(--color-accent)", borderLeftStyle: "solid" }}
              >
                <div className="relative">
                  <List className="w-3 h-3 shrink-0" />
                  {!activeDoc.isTemplate && backlinks.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                </div>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest leading-none"
                  style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                >
                  TOC
                </span>
              </button>
            )}
          </div>
          </>)}
        </div>
      </div>
      <DocStatsFooter markdown={lastSavedMarkdown} />

      {/* "Waiting for docs" indicator */}
      {watchList.length > 0 && (
        <div className="presence-waiting-badge">
          <span className="presence-waiting-dot" />
          Watching {watchList.length === 1
            ? `"${watchList[0].docName}"`
            : `${watchList.length} documents`
          } for availability…
          <button onClick={() => watchList.forEach((d) => unwatchDoc(d))} className="presence-waiting-dismiss">✕</button>
        </div>
      )}

      {/* Modals */}
      <CreateDocModal
        isOpen={showNewDocModal}
        categories={categories}
        defaultCategory={newDocDefaultCategory}
        onClose={() => setShowNewDocModal(false)}
        onCreate={handleCreateDoc}
        templates={templates}
        onSelectTemplate={handleSelectTemplate}
        docs={docs}
      />
      <TemplateFormModal
        isOpen={showTplFormModal}
        template={activeTpl}
        categories={categories}
        defaultCategory={newDocDefaultCategory}
        onClose={() => { setShowTplFormModal(false); setActiveTpl(null); }}
        onCreate={handleCreateFromTemplate}
        spaceMembers={spaceMembers}
      />
      <CreateCategoryModal
        isOpen={showNewCategoryModal}
        categories={categories}
        defaultParent={newCategoryDefaultParent}
        onClose={() => setShowNewCategoryModal(false)}
        onCreate={handleCreateCategory}
      />
      <RenameCategoryModal
        isOpen={showRenameCategoryModal}
        currentName={renameCategoryName}
        onClose={() => setShowRenameCategoryModal(false)}
        onRename={handleConfirmRenameCategory}
      />
      <RenameDocModal
        isOpen={showRenameDocModal}
        currentName={renameDocTarget?.name || ""}
        onClose={() => { setShowRenameDocModal(false); setRenameDocTarget(null); }}
        onRename={handleConfirmRenameDoc}
      />
      <NewTemplateModal
        isOpen={showNewTemplateModal}
        defaultCategory={newTemplateCategoryTarget}
        templateCategories={categories.filter((c) => c.path === "Templates" || c.path.startsWith("Templates/"))}
        onClose={() => setShowNewTemplateModal(false)}
        onCreate={handleConfirmNewTemplate}
        docs={docs}
      />
      <DeleteCategoryModal
        isOpen={showDeleteCategoryModal}
        categoryPath={deleteCategoryPath}
        categoryName={deleteCategoryName}
        docCount={deleteCategoryDocCount}
        subCount={deleteCategorySubCount}
        onClose={() => setShowDeleteCategoryModal(false)}
        onArchive={handleConfirmArchiveCategory}
        onDelete={handleConfirmDeleteCategory}
      />
      {/* Delete doc modal with archive option */}
      {showDeleteDocModal && deleteDocTarget && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDeleteDocModal(false); }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete document</h2>
              <button onClick={() => setShowDeleteDocModal(false)} className="modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">
                What would you like to do with &quot;{deleteDocTarget.name}&quot;?
              </p>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                  onClick={async () => {
                    setShowDeleteDocModal(false);
                    if (!currentSpace || !deleteDocTarget) return;
                    await fetch(
                      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(deleteDocTarget.name)}/archive`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ category: deleteDocTarget.category }),
                      }
                    );
                    await fetchSpaceData();
                    if (activeDoc?.name === deleteDocTarget.name && activeDoc?.category === deleteDocTarget.category) {
                      setActiveDoc(null);
                      setMarkdown("");
                    }
                  }}
                >
                  <Archive className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Archive</p>
                    <p className="text-xs text-text-muted">Move to archive — can be restored anytime</p>
                  </div>
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-left"
                  onClick={() => {
                    handleConfirmDeleteDoc();
                    setShowDeleteDocModal(false);
                  }}
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-600">Delete to Recycle Bin</p>
                    <p className="text-xs text-text-muted">Auto-deleted after retention period</p>
                  </div>
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => setShowDeleteDocModal(false)} className="modal-btn-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <TagManagerModal
        isOpen={showTagManager}
        tagsIndex={tagsIndex}
        tagColors={customization.tagColors}
        spaceSlug={currentSpace?.slug || ""}
        onClose={() => setShowTagManager(false)}
        onRefresh={fetchSpaceData}
      />
      <TrashBinModal
        isOpen={showTrashModal}
        spaceSlug={currentSpace?.slug || null}
        onClose={() => setShowTrashModal(false)}
        onRestored={fetchSpaceData}
      />
      <MoveDocModal
        isOpen={showMoveDocModal && !!moveDocTarget}
        docName={moveDocTarget?.name || ""}
        currentCategory={moveDocTarget?.category || ""}
        categories={categories}
        onClose={() => setShowMoveDocModal(false)}
        onMove={(toCategory) => {
          if (moveDocTarget) handleConfirmMoveDoc(moveDocTarget.name, toCategory);
        }}
      />
      <ArchiveModal
        isOpen={showArchiveModal}
        spaceSlug={currentSpace?.slug || null}
        onClose={() => setShowArchiveModal(false)}
        onUnarchived={fetchSpaceData}
      />
      <HistoryModal
        isOpen={showHistoryModal}
        spaceSlug={currentSpace?.slug || null}
        docName={activeDoc?.name || null}
        category={activeDoc?.category || null}
        currentContent={lastSavedMarkdown || markdown}
        onClose={() => setShowHistoryModal(false)}
        onRestore={handleRestoreRevision}
      />
      <DatabaseCreateModal
        isOpen={showSidebarDbCreateModal}
        onClose={() => setShowSidebarDbCreateModal(false)}
        existingNames={databasesList.map((db) => db.title)}
        onCreate={async (title, templateId) => {
          if (!currentSpace) return;
          try {
            await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/enhanced-tables`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, templateId: templateId || undefined }),
            });
            await fetchSpaceData();
          } catch {}
          setShowSidebarDbCreateModal(false);
        }}
      />
      <DatabaseCreateModal
        isOpen={showEditDbModal}
        mode="edit"
        initialTitle={editDbTarget?.title ?? ""}
        existingNames={databasesList.map((db) => db.title)}
        onClose={() => { setShowEditDbModal(false); setEditDbTarget(null); }}
        onCreate={async (title) => {
          await handleConfirmEditDatabase(title);
          setShowEditDbModal(false);
          setEditDbTarget(null);
        }}
      />
      {/* Delete database modal with archive option */}
      {showDeleteDbModal && deleteDbTarget && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowDeleteDbModal(false); setDeleteDbTarget(null); } }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete database</h2>
              <button onClick={() => { setShowDeleteDbModal(false); setDeleteDbTarget(null); }} className="modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">
                What would you like to do with &quot;{deleteDbTarget.title}&quot;?
              </p>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                  onClick={async () => {
                    setShowDeleteDbModal(false);
                    await handleArchiveDatabase();
                    setDeleteDbTarget(null);
                  }}
                >
                  <Archive className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Archive</p>
                    <p className="text-xs text-text-muted">Move to archive — can be restored anytime</p>
                  </div>
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-left"
                  onClick={async () => {
                    setShowDeleteDbModal(false);
                    await handleConfirmDeleteDatabase();
                    setDeleteDbTarget(null);
                  }}
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-600">Delete to Recycle Bin</p>
                    <p className="text-xs text-text-muted">Auto-deleted after retention period</p>
                  </div>
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => { setShowDeleteDbModal(false); setDeleteDbTarget(null); }} className="modal-btn-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShareModal && activeDoc && currentSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}>
          <div className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Share Document</h2>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Access mode */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Access mode</label>
                <select
                  className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-lg outline-none appearance-none"
                  value={shareMode}
                  onChange={(e) => setShareMode(e.target.value as "read" | "readwrite")}
                >
                  <option value="read">Read only</option>
                  <option value="readwrite">Read &amp; Write</option>
                </select>
              </div>
              {/* Password (optional) */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Password protection <span className="text-text-muted font-normal">(optional)</span></label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    className="flex-1 h-10 px-3 text-sm bg-surface border border-border rounded-lg outline-none font-mono"
                    placeholder="Leave empty for no password"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="h-10 px-2.5 rounded-lg border border-border bg-surface hover:bg-muted text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1.5"
                    title="Generate passphrase"
                    onClick={() => {
                      const words = ["apple","river","cloud","tiger","flame","stone","cedar","pearl","storm","eagle","frost","maple","coral","bloom","drift","grove","steel","ocean","spark","lunar","amber","delta","solar","pixel","crisp","flint","noble","vivid","swift","brave","quiet","plume","ridge","vault","terra","nexus"];
                      const pick = () => words[Math.floor(Math.random() * words.length)];
                      setSharePassword(`${pick()}-${pick()}-${pick()}-${Math.floor(Math.random() * 90 + 10)}`);
                    }}
                  >
                    <Dices className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Generate</span>
                  </button>
                </div>
              </div>
              {/* Expiration */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Link expiration</label>
                <select
                  className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-lg outline-none appearance-none"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                >
                  <option value="never">Never</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="custom">Custom date…</option>
                </select>
                {shareExpiry === "custom" && (
                  <input
                    type="datetime-local"
                    className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-lg outline-none mt-1.5"
                    value={shareCustomExpiry}
                    onChange={(e) => setShareCustomExpiry(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                )}
              </div>
              {!shareLink ? (
                <button
                  className="w-full px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:opacity-90"
                  onClick={async () => {
                    let expiresAt: string | undefined;
                    if (shareExpiry === "1h") expiresAt = new Date(Date.now() + 3600_000).toISOString();
                    else if (shareExpiry === "24h") expiresAt = new Date(Date.now() + 86400_000).toISOString();
                    else if (shareExpiry === "7d") expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
                    else if (shareExpiry === "30d") expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
                    else if (shareExpiry === "custom" && shareCustomExpiry) expiresAt = new Date(shareCustomExpiry).toISOString();
                    const res = await fetch(`/api/spaces/${currentSpace.slug}/shares`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        docName: activeDoc.name,
                        category: activeDoc.category,
                        mode: shareMode,
                        ...(sharePassword ? { password: sharePassword } : {}),
                        ...(expiresAt ? { expiresAt } : {}),
                      }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setShareLink(`${window.location.origin}${data.url}`);
                    }
                  }}
                >
                  Generate share link
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Link className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <input
                      readOnly
                      className="flex-1 bg-transparent text-sm text-text-primary outline-none truncate"
                      value={shareLink}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="p-1 rounded hover:bg-surface text-text-muted"
                      onClick={async () => {
                        await copyToClipboard(shareLink);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                      }}
                      title="Copy link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {shareCopied && <p className="text-xs text-green-600">Link copied!</p>}
                  {sharePassword && <p className="text-xs text-amber-600">🔒 Password-protected</p>}
                  {shareExpiry !== "never" && <p className="text-xs text-text-muted">⏰ Expires: {shareExpiry === "custom" ? new Date(shareCustomExpiry).toLocaleString() : shareExpiry}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login notifications modal */}
      {showLoginNotifsModal && loginNotifs.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowLoginNotifsModal(false); }}>
          <div className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">You have {loginNotifs.length} notification{loginNotifs.length > 1 ? "s" : ""}</h2>
              <button onClick={() => setShowLoginNotifsModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1">
              {loginNotifs.map((n) => (
                <button
                  key={n.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                  onClick={() => {
                    setShowLoginNotifsModal(false);
                    if (n.type === "new_user") {
                      router.push("/admin");
                    } else if (n.spaceSlug !== currentSpace?.slug) {
                      guardedNav(() => { handleSwitchSpace(n.spaceSlug); setPendingDocLoad({ name: n.docName, category: n.category }); });
                    } else {
                      const target = docs.find((d) => d.name === n.docName && d.category === n.category);
                      if (target) guardedNav(() => loadDoc(target));
                    }
                  }}
                >
                  {n.type === "new_user" ? (
                    <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 text-sm font-bold">@</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{n.message}</p>
                    <p className="text-xs text-text-muted">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end">
              <button onClick={() => setShowLoginNotifsModal(false)} className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:opacity-90">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Reindex toast */}
      {reindexToastMsg && (
        <div className="presence-toast">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {reindexToastMsg}
        </div>
      )}

      {/* Print toast */}
      {showPrintToast && (
        <>
          <div className="print-toast-overlay" />
          <div className="print-toast">
            <Loader2 className="w-5 h-5 animate-spin" />
            Preparing document for printing…
          </div>
        </>
      )}

      {/* Unsaved changes modal */}
      {showUnsavedModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleUnsavedCancel(); }}
        >
          <div
            className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-base font-semibold text-text-primary">Unsaved changes</h2>
              <p className="text-sm text-text-muted mt-1.5">
                You&apos;re still editing <strong className="text-text-primary font-medium">{activeDoc?.name}</strong>. What do you want to do with your changes?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border">
              <button
                className="px-3.5 py-1.5 text-sm text-text-muted hover:text-text-primary"
                onClick={handleUnsavedCancel}
              >
                Cancel
              </button>
              <button
                className="px-3.5 py-1.5 text-sm font-medium bg-muted text-text-secondary rounded-lg hover:bg-[var(--color-muted-hover)]"
                onClick={handleUnsavedDiscard}
              >
                Discard changes
              </button>
              <button
                className="px-3.5 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:opacity-90"
                onClick={handleUnsavedSave}
              >
                Save &amp; continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => { setShowSearchModal(false); setSearchInitialQuery(undefined); }}
        initialQuery={searchInitialQuery}
        docs={docs}
        tagsIndex={tagsIndex}
        categories={categories}
        spaceSlug={currentSpace?.slug || null}
        spaceMembers={spaceMembers}
        onOpenDoc={(name, category) => {
          const target = docs.find((d) => d.name === name && d.category === category);
          if (target) guardedNav(() => loadDoc(target));
        }}
      />

      {/* Reading view overlay */}
      {readingView && activeDoc && (
        <div className="reading-view-overlay">
          <div className="reading-view-bar">
            <span className="reading-view-breadcrumb">{activeDoc.category} / </span>
            <span className="reading-view-title">{activeDoc.name}</span>
            <button
              className="reading-view-exit"
              onClick={() => setReadingView(false)}
              title="Exit reading view (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
          <div className="reading-view-content">
            <Editor
              key={`reading-${currentSpace?.slug}/${activeDoc.category}/${activeDoc.name}`}
              filename={activeDoc.name}
              initialMarkdown={lastSavedMarkdown || markdown}
              onSave={() => {}}
              spaceSlug={currentSpace?.slug || ""}
              category={activeDoc.category}
              editable={false}
              lineSpacing={user?.preferences?.editorLineSpacing ?? "compact"}
              pageWidth="narrow"
              spellcheckEnabled={user?.preferences?.spellcheckEnabled ?? false}
              spellcheckLanguage={user?.preferences?.spellcheckLanguage ?? "en"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
