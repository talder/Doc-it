"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import SidebarNavigation, { type SidebarMode } from "./SidebarNavigation";
import CategoryRenderer from "./CategoryRenderer";
import TagsList from "./TagsList";
import SidebarActions from "./SidebarActions";
import type { Category, DocFile, TagsIndex } from "@/lib/types";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;
const STORAGE_KEY = "docit-sidebar-width";

interface SidebarProps {
  categories: Category[];
  docs: DocFile[];
  tagsIndex: TagsIndex;
  activeDoc: { name: string; category: string } | null;
  onSelectDoc: (doc: DocFile) => void;
  onNewDoc: (category?: string) => void;
  onNewCategory: (parent?: string) => void;
  onRenameCategory: (path: string) => void;
  onDeleteCategory: (path: string) => void;
  onEditDoc: (doc: DocFile) => void;
  onDeleteDoc: (doc: DocFile) => void;
  onMoveDoc: (doc: DocFile) => void;
  onTagSelect: (tagName: string) => void;
  selectedTag: string | null;
  canWrite: boolean;
  onReindexTags?: () => void;
  isReindexing?: boolean;
}

export default function Sidebar({
  categories,
  docs,
  tagsIndex,
  activeDoc,
  onSelectDoc,
  onNewDoc,
  onNewCategory,
  onRenameCategory,
  onDeleteCategory,
  onEditDoc,
  onDeleteDoc,
  onMoveDoc,
  onTagSelect,
  selectedTag,
  canWrite,
  onReindexTags,
  isReindexing,
}: SidebarProps) {
  const [mode, setMode] = useState<SidebarMode>("documents");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);

  // Resizable sidebar
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + (e.clientX - startX.current)));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      setDragging(false);
      localStorage.setItem(STORAGE_KEY, String(width));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, width]);

  const tagCount = Object.keys(tagsIndex).length;

  const toggleCategory = (path: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const rootCategories = categories.filter((c) => !c.parent);

  // Uncategorized docs (in space root, not in any category)
  const uncategorizedDocs = docs.filter((d) => !d.category || d.category === "");

  const allCollapsed = rootCategories.every((c) => collapsedCategories.has(c.path));
  const handleToggleAll = () => {
    if (allCollapsed) {
      setCollapsedCategories(new Set());
    } else {
      setCollapsedCategories(new Set(categories.map((c) => c.path)));
    }
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <SidebarNavigation mode={mode} onModeChange={setMode} tagCount={tagCount} />

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {mode === "tags" ? (
          <TagsList
            tagsIndex={tagsIndex}
            docs={docs}
            activeDoc={activeDoc}
            onTagSelect={onTagSelect}
            onSelectDoc={onSelectDoc}
            selectedTag={selectedTag}
            onReindex={onReindexTags}
            isReindexing={isReindexing}
          />
        ) : (
          <>
            {/* Tags section (always visible in documents mode if tags exist) */}
            {tagCount > 0 && (
              <TagsList
                tagsIndex={tagsIndex}
                docs={docs}
                activeDoc={activeDoc}
                onTagSelect={onTagSelect}
                onSelectDoc={onSelectDoc}
                selectedTag={selectedTag}
                onReindex={onReindexTags}
                isReindexing={isReindexing}
              />
            )}

            {/* Categories section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 py-1">
                <button
                  onClick={() => setCategoriesCollapsed(!categoriesCollapsed)}
                  className="flex items-center gap-1 text-xs font-bold uppercase text-text-muted tracking-wider hover:text-text-secondary"
                >
                  {categoriesCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  Categories
                </button>
                <button
                  onClick={handleToggleAll}
                  className="text-xs text-accent hover:underline"
                >
                  {allCollapsed ? "Expand all" : "Collapse all"}
                </button>
              </div>

              {!categoriesCollapsed && (
                <div className="px-1">
                  {rootCategories.map((cat) => (
                    <CategoryRenderer
                      key={cat.path}
                      category={cat}
                      allCategories={categories}
                      docs={docs}
                      collapsedCategories={collapsedCategories}
                      onToggleCategory={toggleCategory}
                      activeDoc={activeDoc}
                      onSelectDoc={onSelectDoc}
                      onNewDoc={onNewDoc}
                      onNewSubcategory={onNewCategory}
                      onRenameCategory={onRenameCategory}
                      onDeleteCategory={onDeleteCategory}
                      onEditDoc={onEditDoc}
                      onDeleteDoc={onDeleteDoc}
                      onMoveDoc={onMoveDoc}
                      canWrite={canWrite}
                    />
                  ))}

                  {/* Uncategorized docs */}
                  {uncategorizedDocs.length > 0 && (
                    <div className="mt-1">
                      <div className="px-2 py-1 text-xs text-text-muted">Uncategorized</div>
                      {uncategorizedDocs.map((doc) => (
                        <button
                          key={doc.name}
                          onClick={() => onSelectDoc(doc)}
                          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            activeDoc?.name === doc.name
                              ? "bg-accent-light text-accent-text"
                              : "text-text-secondary hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">{doc.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <SidebarActions
        onNewDoc={() => onNewDoc()}
        onNewCategory={() => onNewCategory()}
        canWrite={canWrite}
      />

      {/* Resize handle */}
      <div
        className={`sidebar-resize-handle${dragging ? " active" : ""}`}
        onMouseDown={onMouseDown}
      />
    </aside>
  );
}
