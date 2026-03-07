"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/sidebar/Sidebar";
import DocActionsMenu from "@/components/DocActionsMenu";
import CreateCategoryModal from "@/components/modals/CreateCategoryModal";
import CreateDocModal from "@/components/modals/CreateDocModal";
import RenameCategoryModal from "@/components/modals/RenameCategoryModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ArchiveModal from "@/components/modals/ArchiveModal";
import HistoryModal from "@/components/modals/HistoryModal";
import type { Space, SanitizedUser, Category, DocFile, TagsIndex } from "@/lib/types";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [tagsIndex, setTagsIndex] = useState<TagsIndex>({});
  const [activeDoc, setActiveDoc] = useState<{ name: string; category: string } | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

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

  // Fetch categories, docs, tags when space changes
  const fetchSpaceData = useCallback(async () => {
    if (!currentSpace) return;
    const slug = currentSpace.slug;
    const [catsRes, docsRes, tagsRes] = await Promise.all([
      fetch(`/api/spaces/${slug}/categories`),
      fetch(`/api/spaces/${slug}/docs`),
      fetch(`/api/spaces/${slug}/tags`),
    ]);
    const [cats, allDocs, tags] = await Promise.all([catsRes.json(), docsRes.json(), tagsRes.json()]);
    setCategories(cats);
    setDocs(allDocs);
    setTagsIndex(tags);
  }, [currentSpace]);

  useEffect(() => { fetchSpaceData(); }, [fetchSpaceData]);

  // Load document
  const loadDoc = useCallback(async (doc: DocFile) => {
    if (!currentSpace) return;
    const res = await fetch(
      `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}?category=${encodeURIComponent(doc.category)}`
    );
    if (res.ok) {
      const data = await res.json();
      setActiveDoc({ name: doc.name, category: doc.category });
      setMarkdown(data.content);
      setLastSavedMarkdown(data.content);
      setSaveStatus("saved");
      setIsEditing(false);
      // Fetch latest revision number
      const histRes = await fetch(
        `/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(doc.name)}/history?category=${encodeURIComponent(doc.category)}`
      );
      if (histRes.ok) {
        const revs = await histRes.json();
        setCurrentRevision(revs.length > 0 ? revs[revs.length - 1].rev : null);
      }
    }
  }, [currentSpace]);

  // Auto-select first doc
  useEffect(() => {
    if (docs.length > 0 && !activeDoc) loadDoc(docs[0]);
  }, [docs, activeDoc, loadDoc]);

  // Save (auto-save while editing) — stores latest content for revision on Done
  const handleSave = useCallback(async (content: string) => {
    if (!activeDoc || !currentSpace) return;
    setSaveStatus("saving");
    setLastSavedMarkdown(content);
    await fetch(`/api/spaces/${currentSpace.slug}/docs/${encodeURIComponent(activeDoc.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, category: activeDoc.category }),
    });
    setSaveStatus("saved");
    fetch(`/api/spaces/${currentSpace.slug}/tags`).then((r) => r.json()).then(setTagsIndex);
  }, [activeDoc, currentSpace]);

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

  const handleEditDoc = () => {
    // placeholder — rename doc not yet implemented
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
    } else {
      setIsEditing(true);
    }
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
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          categories={categories}
          docs={docs}
          tagsIndex={tagsIndex}
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
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-10 border-b border-border bg-surface flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-muted">
                {activeDoc ? `${activeDoc.category} / ${activeDoc.name}.md` : "Select a document"}
              </span>
              {activeDoc && currentRevision !== null && (
                <button
                  className="doc-bar-revision"
                  onClick={() => setShowHistoryModal(true)}
                  title="View revision history"
                >
                  Rev {currentRevision}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveStatus !== "idle" && isEditing && (
                <span className="text-xs text-text-muted mr-1">{saveStatus === "saving" ? "Saving..." : "Saved"}</span>
              )}
              {activeDoc && (
                <DocActionsMenu
                  canWrite={canWrite}
                  isEditing={isEditing}
                  onToggleEdit={handleToggleEdit}
                  onCopyMarkdown={handleCopyMarkdown}
                  onPrint={handlePrint}
                  onHistory={() => setShowHistoryModal(true)}
                  onMove={() => {
                    if (activeDoc) {
                      setMoveDocTarget({ name: activeDoc.name, filename: `${activeDoc.name}.md`, category: activeDoc.category, space: currentSpace?.slug || "" });
                      setShowMoveDocModal(true);
                    }
                  }}
                  onArchive={handleArchiveDoc}
                  onDelete={() => {
                    if (activeDoc) {
                      setDeleteDocTarget({ name: activeDoc.name, filename: `${activeDoc.name}.md`, category: activeDoc.category, space: currentSpace?.slug || "" });
                      setShowDeleteDocModal(true);
                    }
                  }}
                />
              )}
            </div>
          </div>
          {activeDoc ? (
            <Editor
              key={`${currentSpace?.slug}/${activeDoc.category}/${activeDoc.name}`}
              filename={activeDoc.name}
              initialMarkdown={markdown}
              onSave={handleSave}
              spaceSlug={currentSpace?.slug || ""}
              category={activeDoc.category}
              onTagClick={handleEditorTagClick}
              editable={isEditing}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted">
              <p>Create or select a document to start editing</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateDocModal
        isOpen={showNewDocModal}
        categories={categories}
        defaultCategory={newDocDefaultCategory}
        onClose={() => setShowNewDocModal(false)}
        onCreate={handleCreateDoc}
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
      {showMoveDocModal && moveDocTarget && (
        <CreateDocModal
          isOpen={true}
          categories={categories}
          defaultCategory={moveDocTarget.category}
          onClose={() => setShowMoveDocModal(false)}
          onCreate={(_, toCategory) => {
            handleConfirmMoveDoc(moveDocTarget.name, toCategory);
            setShowMoveDocModal(false);
          }}
        />
      )}
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
    </div>
  );
}
