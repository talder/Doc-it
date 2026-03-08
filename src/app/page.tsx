"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronsLeftRight, List, BookOpen, X, Minimize2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import TableOfContents from "@/components/TableOfContents";
import { useTheme } from "@/components/ThemeProvider";
import Sidebar from "@/components/sidebar/Sidebar";
import DocActionsMenu from "@/components/DocActionsMenu";
import CreateCategoryModal from "@/components/modals/CreateCategoryModal";
import CreateDocModal from "@/components/modals/CreateDocModal";
import RenameCategoryModal from "@/components/modals/RenameCategoryModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ArchiveModal from "@/components/modals/ArchiveModal";
import HistoryModal from "@/components/modals/HistoryModal";
import MoveDocModal from "@/components/modals/MoveDocModal";
import TemplateFormModal from "@/components/modals/TemplateFormModal";
import RenameDocModal from "@/components/modals/RenameDocModal";
import NewTemplateModal from "@/components/modals/NewTemplateModal";
import DatabaseCreateModal from "@/components/modals/DatabaseCreateModal";
import DatabaseView from "@/components/database/DatabaseView";
import type { Space, SanitizedUser, Category, DocFile, TagsIndex, TemplateInfo, DocStatusEntry, DocStatusMap, ReviewItem, SpaceCustomization, DocMetadata, FavoriteItem } from "@/lib/types";
import DocStatsFooter from "@/components/DocStatsFooter";
import DocStatusPopover from "@/components/DocStatusPopover";
import DocInfoPanel from "@/components/DocInfoPanel";
import { usePresence } from "@/hooks/usePresence";
import { useDocWatcher } from "@/hooks/useDocWatcher";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

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
  const [showDeleteDocModal, setShowDeleteDocModal] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<DocFile | null>(null);
  const [showMoveDocModal, setShowMoveDocModal] = useState(false);
  const [moveDocTarget, setMoveDocTarget] = useState<DocFile | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState<string | null>(null);

  // Doc status state
  const [docStatus, setDocStatus] = useState<DocStatusEntry>({ status: "draft" });
  const [docStatusMap, setDocStatusMap] = useState<DocStatusMap>({});
  const [spaceMembers, setSpaceMembers] = useState<{ username: string; fullName?: string }[]>([]);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
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
  const [customization, setCustomization] = useState<SpaceCustomization>({ docIcons: {}, docColors: {}, categoryIcons: {}, categoryColors: {} });

  // Reading view state
  const [readingView, setReadingView] = useState(false);

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

  // Persistent notifications
  const [notifications, setNotifications] = useState<{ id: string; message: string; docName: string; category: string; time: string }[]>([]);
  const addNotification = useCallback((message: string, docName: string, category: string) => {
    setNotifications((prev) => [{
      id: `${Date.now()}-${Math.random()}`,
      message,
      docName,
      category,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
        if (data.length > 0 && !currentSpace) setCurrentSpace(data[0]);
        setLoading(false);
      });
  }, [user, currentSpace]);

  // Fetch categories, docs, tags, templates, members when space changes
  const fetchSpaceData = useCallback(async () => {
    if (!currentSpace) return;
    const slug = currentSpace.slug;
    const [catsRes, docsRes, tagsRes, tplRes, membersRes, custRes, dbsRes, statusesRes] = await Promise.all([
      fetch(`/api/spaces/${slug}/categories`),
      fetch(`/api/spaces/${slug}/docs`),
      fetch(`/api/spaces/${slug}/tags`),
      fetch(`/api/spaces/${slug}/templates`),
      fetch(`/api/spaces/${slug}/members`),
      fetch(`/api/spaces/${slug}/customization`),
      fetch(`/api/spaces/${slug}/databases`),
      fetch(`/api/spaces/${slug}/statuses`),
    ]);
    const [cats, allDocs, tags, tpls, members, cust, dbs, statuses] = await Promise.all([
      catsRes.json(), docsRes.json(), tagsRes.json(), tplRes.json(), membersRes.json(), custRes.json(), dbsRes.json(), statusesRes.json(),
    ]);
    setCategories(cats);
    setDocs(allDocs);
    setTagsIndex(tags);
    setTemplates(Array.isArray(tpls) ? tpls : []);
    setSpaceMembers(Array.isArray(members) ? members : []);
    setCustomization(cust && cust.docIcons ? cust : { docIcons: {}, docColors: {}, categoryIcons: {}, categoryColors: {} });
    setDatabasesList(Array.isArray(dbs) ? dbs : []);
    setDocStatusMap(statuses && typeof statuses === "object" ? statuses : {});
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
    setActiveDoc({ name: doc.name, category: doc.category, isTemplate: !!doc.isTemplate });
      setMarkdown(data.content);
      setLastSavedMarkdown(data.content);
      setDocMetadata(data.metadata || {});
      setDocFileSize(data.fileSize || 0);
      setSaveStatus("saved");
      setIsEditing(false);
      setShowStatusPopover(false);
      // Fetch latest revision number
      const histRes = await fetch(
        `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}/history?category=${encodeURIComponent(doc.category)}`
      );
      if (histRes.ok) {
        const revs = await histRes.json();
        setCurrentRevision(revs.length > 0 ? revs[revs.length - 1].rev : null);
      }
      // Fetch doc status (skip for templates)
      if (!doc.isTemplate) {
        const statusRes = await fetch(
          `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}/status?category=${encodeURIComponent(doc.category)}`
        );
        if (statusRes.ok) setDocStatus(await statusRes.json());
        else setDocStatus({ status: "draft" });
      }
    }
  }, [currentSpace]);

  // Auto-select first doc
  useEffect(() => {
    if (docs.length > 0 && !activeDoc) loadDoc(docs[0]);
  }, [docs, activeDoc, loadDoc]);

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
      const { docName, docCategory } = (e as CustomEvent).detail;
      const target = docs.find(
        (d) => d.name === docName && d.category === docCategory
      );
      if (target) loadDoc(target);
    };
    document.addEventListener("navigate:doc", handler);
    return () => document.removeEventListener("navigate:doc", handler);
  }, [docs, loadDoc]);

  // Save (auto-save while editing) — stores latest content for revision on Done
  const handleSave = useCallback(async (content: string) => {
    if (!activeDoc || !currentSpace) return;
    // Key from the closure's activeDoc — NOT docKeyRef which may already point to a new doc
    const saveKey = `${currentSpace.slug}/${activeDoc.category}/${activeDoc.name}`;
    setSaveStatus("saving");
    setLastSavedMarkdown(content);
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
    const res = await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: lastSavedMarkdown ?? markdown,
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
      loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug, isTemplate: true });
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
      loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug });
      setIsEditing(true);
    }
  };

  const handleExportTemplate = async (doc: DocFile) => {
    if (!currentSpace) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/templates/${encodeURIComponent(doc.name)}/export`
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
      loadDoc({ name: newDoc.name, filename: newDoc.filename, category, space: currentSpace.slug });
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
    setDeleteCategoryPath(path);
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

  const handleEnterDistractionFree = () => {
    if (hasOtherEditors) { setShowPresenceWarning(true); return; }
    editStartMarkdownRef.current = lastSavedMarkdown ?? markdown;
    setIsEditing(true);
    setDistractionFree(true);
  };

  const handleCopyMarkdown = () => {
    if (lastSavedMarkdown) {
      navigator.clipboard.writeText(lastSavedMarkdown);
    }
  };

  const handlePrint = () => {
    window.print();
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
    if (item.spaceSlug !== currentSpace?.slug) {
      handleSwitchSpace(item.spaceSlug);
      setPendingDocLoad({ name: item.docName, category: item.category });
    } else {
      const target = docs.find(
        (d) => d.name === item.docName && d.category === item.category
      );
      if (target) loadDoc(target);
    }
  };

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

  const saveFavorites = useCallback(async (next: FavoriteItem[]) => {
    setFavorites(next);
    await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { favorites: next } }),
    });
  }, []);

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
        setPendingDocLoad({ name: item.name, category: item.category! });
      } else {
        const target = docs.find((d) => d.name === item.name && d.category === item.category);
        if (target) loadDoc(target);
      }
    } else if (item.type === "database") {
      if (item.spaceSlug !== currentSpace?.slug) {
        handleSwitchSpace(item.spaceSlug);
        setPendingDatabaseLoad(item.id!);
      } else {
        setActiveDatabase(item.id!);
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
    await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/databases/${editDbTarget.id}`, {
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

  const handleConfirmDeleteDatabase = async () => {
    if (!currentSpace || !deleteDbTarget) return;
    await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/databases/${deleteDbTarget.id}`, {
      method: "DELETE",
    });
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
      loadDoc(matchingDocs[0]);
    } else if (matchingDocs.length > 1) {
      // Select the tag to show docs in sidebar
      setSelectedTag(tagName);
    }
  };

  const [adminContacts, setAdminContacts] = useState<{ username: string; email: string }[]>([]);
  const [isReindexing, setIsReindexing] = useState(false);
  const handleReindexTags = async () => {
    if (!currentSpace || isReindexing) return;
    setIsReindexing(true);
    try {
      const res = await fetch(`/api/spaces/${currentSpace.slug}/tags`, { method: "POST" });
      if (res.ok) {
        const tags = await res.json();
        setTagsIndex(tags);
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
        onSwitchSpace={handleSwitchSpace}
        onLogout={handleLogout}
        onOpenArchive={() => setShowArchiveModal(true)}
        reviewItems={reviewItems}
        onNavigateToReview={handleNavigateToReview}
        notifications={notifications}
        onDismissNotification={dismissNotification}
        onClearNotifications={clearNotifications}
        onNotificationAction={(n) => {
          dismissNotification(n.id);
          const target = docs.find((d) => d.name === n.docName && d.category === n.category);
          if (target) { loadDoc(target); setIsEditing(true); }
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          categories={categories}
          docs={docs}
          tagsIndex={tagsIndex}
          databases={databasesList}
          activeDoc={activeDoc}
          onSelectDoc={loadDoc}
          onNewDoc={handleNewDoc}
          onNewCategory={handleNewCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
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
          onSelectDatabase={(dbId) => {
            setActiveDatabase(dbId);
            setActiveDatabaseSearch("");
          }}
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
          onSelectFavorite={handleSelectFavorite}
        />
        <div className={`flex-1 flex flex-col overflow-hidden${distractionFree ? " df-mode" : ""}`}>
          {activeDatabase && currentSpace ? (
            <DatabaseView
              key={activeDatabase}
              dbId={activeDatabase}
              spaceSlug={currentSpace.slug}
              canWrite={canWrite}
              initialSearch={activeDatabaseSearch}
              onOpenDatabase={(dbId, search) => {
                setActiveDatabase(dbId);
                setActiveDatabaseSearch(search || "");
              }}
              onClose={() => { setActiveDatabase(null); setActiveDatabaseSearch(""); }}
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
              {/* Tag chips */}
              {activeDoc && !activeDoc.isTemplate && docMetadata?.tags && docMetadata.tags.length > 0 && (
                <div className="doc-tag-chips">
                  {docMetadata.tags.map((tag) => (
                    <span key={tag} className="doc-tag-chip">
                      {tag}
                      {canWrite && (
                        <button
                          className="doc-tag-chip-remove"
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
                  ))}
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
                  spaceSlug={currentSpace?.slug || ""}
                  category={activeDoc.category}
                  onTagClick={handleEditorTagClick}
                  editable={isEditing}
                  lineSpacing={user?.preferences?.editorLineSpacing ?? "compact"}
                  pageWidth={pageWidth}
                  onPageWidthChange={handlePageWidthChange}
                  isTemplate={!!activeDoc.isTemplate}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-muted h-full">
                  <p>Create or select a document to start editing</p>
                </div>
              )}
            </div>

            {/* TOC panel */}
            {tocOpen && activeDoc && (
              <TableOfContents
                markdown={lastSavedMarkdown || markdown}
                onClose={closeToc}
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
                <List className="w-3 h-3 shrink-0" />
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
      />
      <TemplateFormModal
        isOpen={showTplFormModal}
        template={activeTpl}
        categories={categories}
        onClose={() => { setShowTplFormModal(false); setActiveTpl(null); }}
        onCreate={handleCreateFromTemplate}
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
      />
      <ConfirmModal
        isOpen={showDeleteCategoryModal}
        title="Delete category"
        message={`Are you sure you want to delete "${deleteCategoryPath}" and all its contents? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setShowDeleteCategoryModal(false)}
        onConfirm={handleConfirmDeleteCategory}
      />
      <ConfirmModal
        isOpen={showDeleteDocModal}
        title="Delete document"
        message={`Are you sure you want to delete "${deleteDocTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setShowDeleteDocModal(false)}
        onConfirm={handleConfirmDeleteDoc}
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
        onCreate={async (title, templateId) => {
          if (!currentSpace) return;
          try {
            await fetch(`/api/spaces/${encodeURIComponent(currentSpace.slug)}/databases`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, templateId: templateId || undefined }),
            });
            fetchSpaceData();
          } catch {}
          setShowSidebarDbCreateModal(false);
        }}
      />
      <DatabaseCreateModal
        isOpen={showEditDbModal}
        mode="edit"
        initialTitle={editDbTarget?.title ?? ""}
        onClose={() => { setShowEditDbModal(false); setEditDbTarget(null); }}
        onCreate={async (title) => {
          await handleConfirmEditDatabase(title);
          setShowEditDbModal(false);
          setEditDbTarget(null);
        }}
      />
      <ConfirmModal
        isOpen={showDeleteDbModal}
        title="Delete database"
        message={`Are you sure you want to delete "${deleteDbTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => { setShowDeleteDbModal(false); setDeleteDbTarget(null); }}
        onConfirm={async () => {
          await handleConfirmDeleteDatabase();
          setShowDeleteDbModal(false);
          setDeleteDbTarget(null);
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
