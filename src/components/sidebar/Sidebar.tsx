"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, LayoutTemplate, Database as DbIcon } from "lucide-react";
import SidebarNavigation, { type SidebarMode } from "./SidebarNavigation";
import CategoryRenderer from "./CategoryRenderer";
import TagsList from "./TagsList";
import DatabasesList from "./DatabasesList";
import FavoritesList from "./FavoritesList";
import SidebarActions from "./SidebarActions";
import type { Category, DocFile, TagsIndex, SpaceCustomization, DocStatusMap, FavoriteItem } from "@/lib/types";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;
const STORAGE_KEY = "docit-sidebar-width";

interface DbSummary {
  id: string;
  title: string;
  rowCount: number;
  createdAt: string;
}

interface SidebarProps {
  categories: Category[];
  docs: DocFile[];
  tagsIndex: TagsIndex;
  databases: DbSummary[];
  activeDoc: { name: string; category: string } | null;
  onSelectDoc: (doc: DocFile) => void;
  onNewDoc: (category?: string) => void;
  onNewCategory: (parent?: string) => void;
  onDeleteCategory: (path: string) => void;
  onArchiveCategory?: (path: string) => void;
  onRenameCategory: (path: string) => void;
  onEditDoc: (doc: DocFile) => void;
  onDeleteDoc: (doc: DocFile) => void;
  onMoveDoc: (doc: DocFile) => void;
  onTagSelect: (tagName: string) => void;
  selectedTag: string | null;
  canWrite: boolean;
  onReindexTags?: () => void;
  isReindexing?: boolean;
  onNewTemplate?: (category?: string) => void;
  onExportTemplate?: (doc: DocFile) => void;
  onImportTemplate?: (file: File) => void;
  onNewDatabase?: () => void;
  onSelectDatabase?: (dbId: string) => void;
  onEditDatabase?: (db: DbSummary) => void;
  onDeleteDatabase?: (db: DbSummary) => void;
  customization?: SpaceCustomization;
  onSetDocIcon?: (docKey: string, emoji: string) => void;
  onSetDocColor?: (docKey: string, color: string) => void;
  onSetCategoryIcon?: (catPath: string, emoji: string) => void;
  onSetCategoryColor?: (catPath: string, color: string) => void;
  docStatusMap?: DocStatusMap;
  onOpenTagManager?: () => void;
  // Favorites
  favorites?: FavoriteItem[];
  currentSpaceSlug?: string;
  currentSpaceName?: string;
  onToggleFavorite?: (item: FavoriteItem) => void;
  onSelectFavorite?: (item: FavoriteItem) => void;
}

export default function Sidebar({
  categories,
  docs,
  tagsIndex,
  databases,
  activeDoc,
  onSelectDoc,
  onNewDoc,
  onNewCategory,
  onRenameCategory,
  onDeleteCategory,
  onArchiveCategory,
  onEditDoc,
  onDeleteDoc,
  onMoveDoc,
  onTagSelect,
  selectedTag,
  canWrite,
  onReindexTags,
  isReindexing,
  onNewTemplate,
  onExportTemplate,
  onImportTemplate,
  onNewDatabase,
  onSelectDatabase,
  onEditDatabase,
  onDeleteDatabase,
  customization,
  docStatusMap,
  onSetDocIcon,
  onSetDocColor,
  onSetCategoryIcon,
  onSetCategoryColor,
  favorites = [],
  currentSpaceSlug,
  currentSpaceName,
  onToggleFavorite,
  onSelectFavorite,
  onOpenTagManager,
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<SidebarMode>("documents");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(true);
  const [tagsCollapsed, setTagsCollapsed] = useState(true);
  const [databasesCollapsed, setDatabasesCollapsed] = useState(true);
  const [templatesCollapsed, setTemplatesCollapsed] = useState(true);
  const initializedCategories = useRef(false);

  // Resizable sidebar
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  // Auto-collapse all categories on first load
  useEffect(() => {
    if (!initializedCategories.current && categories.length > 0) {
      initializedCategories.current = true;
      setCollapsedCategories(new Set(categories.map((c) => c.path)));
    }
  }, [categories]);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportTemplate) onImportTemplate(file);
    e.target.value = "";
  };

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
  const templateCount = docs.filter((d) => d.isTemplate).length;
  const databaseCount = databases.length;

  const toggleCategory = (path: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Split root categories: template vs regular
  const tplRootCategories = categories.filter(
    (c) => !c.parent && (c.path === "Templates" || c.path.startsWith("Templates/"))
  );
  const docRootCategories = categories.filter(
    (c) => !c.parent && c.path !== "Templates" && !c.path.startsWith("Templates/")
  );

  // Uncategorized docs (in space root, not in any category)
  const uncategorizedDocs = docs.filter((d) => !d.category || d.category === "");

  const allCollapsed = docRootCategories.every((c) => collapsedCategories.has(c.path));
  const handleToggleAll = () => {
    if (allCollapsed) {
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        docRootCategories.forEach((c) => next.delete(c.path));
        return next;
      });
    } else {
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        categories
          .filter((c) => c.path !== "Templates" && !c.path.startsWith("Templates/"))
          .forEach((c) => next.add(c.path));
        return next;
      });
    }
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <SidebarNavigation mode={mode} onModeChange={setMode} tagCount={tagCount} templateCount={templateCount} databaseCount={databaseCount} favoritesCount={favorites.length} />

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {mode === "favorites" ? (
          <FavoritesList
            favorites={favorites}
            onSelect={(item) => onSelectFavorite?.(item)}
            onRemove={(item) => onToggleFavorite?.(item)}
            currentSpaceSlug={currentSpaceSlug}
          />
        ) : mode === "databases" ? (
          <DatabasesList
            databases={databases}
            onSelectDatabase={(dbId) => onSelectDatabase?.(dbId)}
            canWrite={canWrite}
            onEditDatabase={onEditDatabase}
            onDeleteDatabase={onDeleteDatabase}
            favorites={favorites}
            spaceSlug={currentSpaceSlug}
            spaceName={currentSpaceName}
            onToggleFavorite={onToggleFavorite}
          />
        ) : mode === "tags" ? (
          <TagsList
            tagsIndex={tagsIndex}
            docs={docs}
            activeDoc={activeDoc}
            onTagSelect={onTagSelect}
            onSelectDoc={onSelectDoc}
            selectedTag={selectedTag}
            onReindex={onReindexTags}
            isReindexing={isReindexing}
            tagColors={customization?.tagColors}
            onOpenTagManager={onOpenTagManager}
          />
        ) : mode === "templates" ? (
          <div className="px-1">
            {tplRootCategories.length > 0 ? (
              tplRootCategories.map((cat) => (
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
                  onExportTemplate={onExportTemplate}
                  onImportTemplate={() => importInputRef.current?.click()}
                  onNewTemplate={(cat) => onNewTemplate?.(cat)}
                  canWrite={canWrite}
                  customization={customization}
                  onSetDocIcon={onSetDocIcon}
                  onSetDocColor={onSetDocColor}
                  onSetCategoryIcon={onSetCategoryIcon}
                  onSetCategoryColor={onSetCategoryColor}
                />
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-text-muted text-center">No templates yet</p>
            )}
          </div>
        ) : (
          <>
            {/* Tags section (collapsible — TagsList has its own header) */}
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
                tagColors={customization?.tagColors}
                onOpenTagManager={onOpenTagManager}
              />
            )}

            {/* Databases section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 py-1">
                <button
                  onClick={() => setDatabasesCollapsed(!databasesCollapsed)}
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider db-section-header"
                >
                  {databasesCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  <DbIcon className="w-3 h-3" />
                  Enhanced Tables
                </button>
                {canWrite && !databasesCollapsed && (
                  <button
                    onClick={() => onNewDatabase?.()}
                    className="text-xs text-accent hover:underline"
                    title="New enhanced table"
                  >
                    + New
                  </button>
                )}
              </div>
            {!databasesCollapsed && (
                <DatabasesList
                  databases={databases}
                  onSelectDatabase={(dbId) => onSelectDatabase?.(dbId)}
                  canWrite={canWrite}
                  onEditDatabase={onEditDatabase}
                  onDeleteDatabase={onDeleteDatabase}
                  favorites={favorites}
                  spaceSlug={currentSpaceSlug}
                  spaceName={currentSpaceName}
                  onToggleFavorite={onToggleFavorite}
                />
              )}
            </div>

            {/* Templates section */}
            {tplRootCategories.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <button
                    onClick={() => setTemplatesCollapsed(!templatesCollapsed)}
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider tpl-section-header"
                  >
                    {templatesCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    <LayoutTemplate className="w-3 h-3" />
                    Templates
                  </button>
                </div>
                {!templatesCollapsed && (
                  <div className="px-1">
                    {tplRootCategories.map((cat) => (
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
                        onExportTemplate={onExportTemplate}
                        onImportTemplate={() => importInputRef.current?.click()}
                        onNewTemplate={(cat) => onNewTemplate?.(cat)}
                        canWrite={canWrite}
                        customization={customization}
                        docStatusMap={docStatusMap}
                        onSetDocIcon={onSetDocIcon}
                        onSetDocColor={onSetDocColor}
                        onSetCategoryIcon={onSetCategoryIcon}
                        onSetCategoryColor={onSetCategoryColor}
                      />
                    ))}
                  </div>
                )}
              </div>
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
                  {docRootCategories.map((cat) => (
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
                  onArchiveCategory={onArchiveCategory}
                  onEditDoc={onEditDoc}
                  onDeleteDoc={onDeleteDoc}
                  onMoveDoc={onMoveDoc}
                  onExportTemplate={onExportTemplate}
                  onImportTemplate={() => importInputRef.current?.click()}
                  onNewTemplate={(cat) => onNewTemplate?.(cat)}
                  canWrite={canWrite}
                  customization={customization}
                  docStatusMap={docStatusMap}
                  onSetDocIcon={onSetDocIcon}
                  onSetDocColor={onSetDocColor}
                  onSetCategoryIcon={onSetCategoryIcon}
                  onSetCategoryColor={onSetCategoryColor}
                  favorites={favorites}
                  spaceSlug={currentSpaceSlug}
                  spaceName={currentSpaceName}
                  onToggleFavorite={onToggleFavorite}
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

      {/* Hidden file input for template import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".mdt"
        style={{ display: "none" }}
        onChange={handleImportFileChange}
      />

      <SidebarActions
        onNewDoc={() => onNewDoc()}
        onNewCategory={() => onNewCategory()}
        onNewTemplate={() => onNewTemplate?.()}
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
