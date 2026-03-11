"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, FilePlus, FolderPlus, Pencil, Trash2, Archive, ArrowRight, LayoutTemplate, Download, Upload, Smile, Palette, X, Star } from "lucide-react";
import ContextMenu from "@/components/ContextMenu";
import type { Category, DocFile, SpaceCustomization, FavoriteItem } from "@/lib/types";
import Picker from "@emoji-mart/react";
// @ts-ignore
import emojiPickerData from "@emoji-mart/data";

const CATEGORY_COLOR_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
];

interface CategoryRendererProps {
  category: Category;
  allCategories: Category[];
  docs: DocFile[];
  collapsedCategories: Set<string>;
  onToggleCategory: (path: string) => void;
  activeDoc: { name: string; category: string } | null;
  onSelectDoc: (doc: DocFile) => void;
  onNewDoc: (category: string) => void;
  onNewSubcategory: (parent: string) => void;
  onRenameCategory: (path: string) => void;
  onDeleteCategory: (path: string) => void;
  onArchiveCategory?: (path: string) => void;
  onEditDoc: (doc: DocFile) => void;
  onDeleteDoc: (doc: DocFile) => void;
  onMoveDoc: (doc: DocFile) => void;
  onExportTemplate?: (doc: DocFile) => void;
  onImportTemplate?: (categoryPath: string) => void;
  onNewTemplate?: (category: string) => void;
  canWrite: boolean;
  customization?: SpaceCustomization;
  onSetDocIcon?: (docKey: string, emoji: string) => void;
  onSetDocColor?: (docKey: string, color: string) => void;
  onSetCategoryIcon?: (catPath: string, emoji: string) => void;
  onSetCategoryColor?: (catPath: string, color: string) => void;
  docStatusMap?: Record<string, { status: string }>;
  // Favorites
  favorites?: FavoriteItem[];
  spaceSlug?: string;
  spaceName?: string;
  onToggleFavorite?: (item: FavoriteItem) => void;
}

export default function CategoryRenderer({
  category,
  allCategories,
  docs,
  collapsedCategories,
  onToggleCategory,
  activeDoc,
  onSelectDoc,
  onNewDoc,
  onNewSubcategory,
  onRenameCategory,
  onDeleteCategory,
  onArchiveCategory,
  onEditDoc,
  onDeleteDoc,
  onMoveDoc,
  onExportTemplate,
  onImportTemplate,
  onNewTemplate,
  canWrite,
  customization,
  onSetDocIcon,
  onSetDocColor,
  onSetCategoryIcon,
  onSetCategoryColor,
  docStatusMap,
  favorites,
  spaceSlug,
  spaceName,
  onToggleFavorite,
}: CategoryRendererProps) {
  const categoryDocs = docs.filter((d) => d.category === category.path);
  const subCategories = allCategories.filter((c) => c.parent === category.path);
  const isCollapsed = collapsedCategories.has(category.path);
  const hasContent = categoryDocs.length > 0 || subCategories.length > 0;

  const isTplCategory = category.path === "Templates" || category.path.startsWith("Templates/");

  // Emoji picker state (shared for doc icons and category icons)
  const [iconPickerTarget, setIconPickerTarget] = useState<{ key: string; type: "doc" | "category" } | null>(null);
  const [iconPickerPos, setIconPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Color picker state (shared for category and doc colors)
  const [colorPickerTarget, setColorPickerTarget] = useState<{ key: string; type: "category" | "doc" } | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const docRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const catColor = customization?.categoryColors?.[category.path];
  const catEmoji = customization?.categoryIcons?.[category.path];

  const openIconPicker = (key: string, type: "doc" | "category", anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const x = Math.min(rect.right + 4, window.innerWidth - 360);
    const y = Math.min(rect.top, window.innerHeight - 440);
    setIconPickerTarget({ key, type });
    setIconPickerPos({ x, y });
  };

  const openColorPicker = (key: string, type: "category" | "doc", anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const x = Math.min(rect.right + 4, window.innerWidth - 200);
    const y = Math.min(rect.top, window.innerHeight - 160);
    setColorPickerTarget({ key, type });
    setColorPickerPos({ x, y });
  };

  // Close popovers on outside click
  useEffect(() => {
    if (!iconPickerTarget && !colorPickerTarget) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".icon-picker-popover") || target.closest(".color-picker-popover")) return;
      setIconPickerTarget(null);
      setColorPickerTarget(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [iconPickerTarget, colorPickerTarget]);

  const getTotalCount = (catPath: string): number => {
    const direct = docs.filter((d) => d.category === catPath).length;
    const subs = allCategories.filter((c) => c.parent === catPath);
    return direct + subs.reduce((sum, s) => sum + getTotalCount(s.path), 0);
  };

  const totalCount = getTotalCount(category.path);

  const categoryActions = canWrite
    ? [
        isTplCategory
          ? { label: "New Template", icon: <LayoutTemplate className="w-4 h-4" />, onClick: () => onNewTemplate?.(category.path) }
          : { label: "New Document", icon: <FilePlus className="w-4 h-4" />, onClick: () => onNewDoc(category.path) },
        { label: "New Subcategory", icon: <FolderPlus className="w-4 h-4" />, onClick: () => onNewSubcategory(category.path) },
        ...(!isTplCategory && onSetCategoryIcon
          ? [{ label: catEmoji ? "Change Icon" : "Set Icon", icon: <Smile className="w-4 h-4" />, onClick: () => {
              const el = colorTriggerRef.current || document.activeElement as HTMLElement;
              openIconPicker(category.path, "category", el);
            }}]
          : []),
        ...(catEmoji && onSetCategoryIcon
          ? [{ label: "Remove Icon", icon: <X className="w-4 h-4" />, onClick: () => onSetCategoryIcon(category.path, "") }]
          : []),
        ...(!isTplCategory && onSetCategoryColor
          ? [{ label: "Change Color", icon: <Palette className="w-4 h-4" />, onClick: () => {
              const el = colorTriggerRef.current || document.activeElement as HTMLElement;
              openColorPicker(category.path, "category", el);
            }}]
          : []),
        ...(isTplCategory && onImportTemplate
          ? [{ label: "Import Template", icon: <Upload className="w-4 h-4" />, onClick: () => onImportTemplate(category.path), divider: true }]
          : []),
        { label: "Rename", icon: <Pencil className="w-4 h-4" />, onClick: () => onRenameCategory(category.path), divider: !isTplCategory && !onSetCategoryColor },
        ...(!isTplCategory && onArchiveCategory
          ? [{ label: "Archive", icon: <Archive className="w-4 h-4" />, onClick: () => onArchiveCategory(category.path) }]
          : []),
        { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteCategory(category.path), variant: "destructive" as const },
      ]
    : [];

  return (
    <div>
      {/* Category row */}
      <div className="group flex items-center" style={{ paddingLeft: `${category.level * 16}px` }} ref={colorTriggerRef as any}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer text-sm">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasContent) onToggleCategory(category.path);
            }}
            className="flex-shrink-0"
          >
            {hasContent ? (
              isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              )
            ) : (
              <ChevronRight className="w-4 h-4 text-border" />
            )}
          </button>
          <button
            onClick={() => onToggleCategory(category.path)}
            className="flex items-center gap-1.5 flex-1 min-w-0"
          >
            {isTplCategory ? (
              <LayoutTemplate className="w-4 h-4 tpl-folder-icon flex-shrink-0" />
            ) : catEmoji ? (
              <span className="doc-emoji-icon flex-shrink-0">{catEmoji}</span>
            ) : isCollapsed || !hasContent ? (
              <Folder className="w-4 h-4 flex-shrink-0" style={catColor ? { color: catColor } : undefined} />
            ) : (
              <FolderOpen className="w-4 h-4 flex-shrink-0" style={catColor ? { color: catColor } : undefined} />
            )}
            <span
              className={`truncate font-medium ${isTplCategory ? "tpl-category-label" : ""}`}
              style={!isTplCategory && catColor ? { color: catColor } : undefined}
            >
              {category.name}
            </span>
            <span className="text-xs text-text-muted ml-auto flex-shrink-0">{totalCount}</span>
          </button>
        </div>
        {canWrite && categoryActions.length > 0 && (
          <ContextMenu actions={categoryActions} />
        )}
      </div>

      {/* Color picker portal */}
      {colorPickerTarget && typeof document !== "undefined" && (() => {
        const activeColor = colorPickerTarget.type === "category"
          ? customization?.categoryColors?.[colorPickerTarget.key]
          : customization?.docColors?.[colorPickerTarget.key];
        const label = colorPickerTarget.type === "category" ? "Category Color" : "Document Color";
        return createPortal(
          <div className="color-picker-popover" style={{ left: colorPickerPos.x, top: colorPickerPos.y }}>
            <div className="color-picker-header">
              <span className="text-xs font-medium text-text-secondary">{label}</span>
              <button onClick={() => setColorPickerTarget(null)} className="text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="color-picker-grid">
              {CATEGORY_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch${activeColor === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    if (colorPickerTarget.type === "category") {
                      onSetCategoryColor?.(colorPickerTarget.key, c);
                    } else {
                      onSetDocColor?.(colorPickerTarget.key, c);
                    }
                    setColorPickerTarget(null);
                  }}
                />
              ))}
            </div>
            {activeColor && (
              <button
                className="color-picker-reset"
                onClick={() => {
                  if (colorPickerTarget.type === "category") {
                    onSetCategoryColor?.(colorPickerTarget.key, "");
                  } else {
                    onSetDocColor?.(colorPickerTarget.key, "");
                  }
                  setColorPickerTarget(null);
                }}
              >
                Reset to default
              </button>
            )}
          </div>,
          document.body
        );
      })()}

      {/* Children */}
      {!isCollapsed && (
        <div className="ml-2 border-l border-border-light pl-1">
          {subCategories.map((sub) => (
            <CategoryRenderer
              key={sub.path}
              category={sub}
              allCategories={allCategories}
              docs={docs}
              collapsedCategories={collapsedCategories}
              onToggleCategory={onToggleCategory}
              activeDoc={activeDoc}
              onSelectDoc={onSelectDoc}
              onNewDoc={onNewDoc}
              onNewSubcategory={onNewSubcategory}
              onRenameCategory={onRenameCategory}
              onDeleteCategory={onDeleteCategory}
              onArchiveCategory={onArchiveCategory}
              onEditDoc={onEditDoc}
              onDeleteDoc={onDeleteDoc}
              onMoveDoc={onMoveDoc}
              onExportTemplate={onExportTemplate}
              onImportTemplate={onImportTemplate}
              onNewTemplate={onNewTemplate}
              canWrite={canWrite}
              customization={customization}
              onSetDocIcon={onSetDocIcon}
              onSetDocColor={onSetDocColor}
              onSetCategoryIcon={onSetCategoryIcon}
              onSetCategoryColor={onSetCategoryColor}
              docStatusMap={docStatusMap}
              favorites={favorites}
              spaceSlug={spaceSlug}
              spaceName={spaceName}
              onToggleFavorite={onToggleFavorite}
          />
        ))}
          {categoryDocs.map((doc) => {
            const isActive =
              activeDoc?.name === doc.name && activeDoc?.category === doc.category;
            const docKey = `${doc.category}/${doc.name}`;
            const docEmoji = customization?.docIcons?.[docKey];
            const docColor = customization?.docColors?.[docKey];
            // If map is provided but doc has no entry, it defaults to "draft"
            const docStatusLabel = docStatusMap !== undefined
              ? (docStatusMap[docKey]?.status ?? "draft")
              : undefined;

            const isDocFavorited = !doc.isTemplate && !!favorites?.some(
              (f) => f.type === "doc" && f.spaceSlug === spaceSlug && f.name === doc.name && f.category === doc.category
            );
            const docFavAction = !doc.isTemplate && onToggleFavorite && spaceSlug
              ? [{
                  label: isDocFavorited ? "Remove from favorites" : "Add to favorites",
                  icon: <Star className={`w-4 h-4 ${isDocFavorited ? "fill-amber-400 text-amber-400" : ""}`} />,
                  onClick: () => onToggleFavorite({ type: "doc", name: doc.name, category: doc.category, spaceSlug, spaceName }),
                }]
              : [];

            const docActions = [
              ...docFavAction,
              ...(canWrite
              ? [
                  ...(!doc.isTemplate && onSetDocIcon
                    ? [{ label: docEmoji ? "Change Icon" : "Set Icon", icon: <Smile className="w-4 h-4" />, onClick: () => {
                        const el = docRowRefs.current.get(docKey);
                        if (el) openIconPicker(docKey, "doc", el);
                      }}]
                    : []),
                  ...(docEmoji && onSetDocIcon
                    ? [{ label: "Remove Icon", icon: <X className="w-4 h-4" />, onClick: () => onSetDocIcon(docKey, "") }]
                    : []),
                  ...(!doc.isTemplate && onSetDocColor
                    ? [{ label: "Change Color", icon: <Palette className="w-4 h-4" />, onClick: () => {
                        const el = docRowRefs.current.get(docKey);
                        if (el) openColorPicker(docKey, "doc", el);
                      }}]
                    : []),
                  { label: "Rename", icon: <Pencil className="w-4 h-4" />, onClick: () => onEditDoc(doc), divider: !!(docFavAction.length > 0 || (!doc.isTemplate && onSetDocIcon)) },
                  { label: "Move to...", icon: <ArrowRight className="w-4 h-4" />, onClick: () => onMoveDoc(doc) },
                  ...(doc.isTemplate && onExportTemplate
                    ? [{ label: "Export Template", icon: <Download className="w-4 h-4" />, onClick: () => onExportTemplate(doc), divider: true }]
                    : []),
                  { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteDoc(doc), variant: "destructive" as const, divider: !doc.isTemplate && !(onSetDocIcon) },
                ]
              : []),
            ];

            return (
              <div
                key={docKey}
                ref={(el) => { if (el) docRowRefs.current.set(docKey, el); else docRowRefs.current.delete(docKey); }}
                className="group flex items-center"
                style={{ paddingLeft: `${(category.level + 1) * 16}px` }}
                data-doc-key={docKey}
              >
                <button
                  onClick={() => onSelectDoc(doc)}
                  className={`flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-accent-light text-accent-text"
                      : doc.isTemplate
                        ? "text-tpl-doc hover:bg-tpl-doc-hover"
                        : "text-text-secondary hover:bg-muted"
                  }`}
                >
                  {doc.isTemplate ? (
                    <LayoutTemplate className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-accent" : "tpl-doc-icon"}`} />
                  ) : docEmoji ? (
                    <span className="doc-emoji-icon flex-shrink-0">{docEmoji}</span>
                  ) : (
                    <FileText className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-accent" : ""}`} style={!isActive && docColor ? { color: docColor } : undefined} />
                  )}
                  <span className="truncate" style={docColor && !isActive ? { color: docColor } : undefined}>{doc.name}</span>
                  {doc.isTemplate
                    ? <span className="tpl-doc-chip">TPL</span>
                    : docStatusLabel === "draft"
                      ? <span className="sidebar-status-chip sidebar-status-draft">DRAFT</span>
                      : docStatusLabel === "review"
                        ? <span className="sidebar-status-chip sidebar-status-review">IN REVIEW</span>
                        : null
                  }
                </button>
                {/* Inline star for non-template docs */}
                {!doc.isTemplate && onToggleFavorite && spaceSlug && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite({ type: "doc", name: doc.name, category: doc.category, spaceSlug, spaceName }); }}
                    className={`p-1 rounded transition-colors flex-shrink-0 ${
                      isDocFavorited
                        ? "text-amber-400 opacity-100"
                        : "text-text-muted opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-amber-400"
                    }`}
                    title={isDocFavorited ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`w-3.5 h-3.5 ${isDocFavorited ? "fill-amber-400" : ""}`} />
                  </button>
                )}
                {docActions.length > 0 && (
                  <ContextMenu actions={docActions} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Emoji picker portal */}
      {iconPickerTarget && typeof document !== "undefined" && createPortal(
        <div className="icon-picker-popover" style={{ left: iconPickerPos.x, top: iconPickerPos.y }}>
          <Picker
            data={emojiPickerData}
            onEmojiSelect={(emoji: any) => {
              if (iconPickerTarget.type === "doc") {
                onSetDocIcon?.(iconPickerTarget.key, emoji.native);
              } else {
                onSetCategoryIcon?.(iconPickerTarget.key, emoji.native);
              }
              setIconPickerTarget(null);
            }}
            theme="auto"
            previewPosition="none"
            skinTonePosition="search"
            maxFrequentRows={1}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
