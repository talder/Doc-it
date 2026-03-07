"use client";

import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, FilePlus, FolderPlus, Pencil, Trash2, ArrowRight } from "lucide-react";
import ContextMenu from "@/components/ContextMenu";
import type { Category, DocFile } from "@/lib/types";

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
  onEditDoc: (doc: DocFile) => void;
  onDeleteDoc: (doc: DocFile) => void;
  onMoveDoc: (doc: DocFile) => void;
  canWrite: boolean;
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
  onEditDoc,
  onDeleteDoc,
  onMoveDoc,
  canWrite,
}: CategoryRendererProps) {
  const categoryDocs = docs.filter((d) => d.category === category.path);
  const subCategories = allCategories.filter((c) => c.parent === category.path);
  const isCollapsed = collapsedCategories.has(category.path);
  const hasContent = categoryDocs.length > 0 || subCategories.length > 0;

  const getTotalCount = (catPath: string): number => {
    const direct = docs.filter((d) => d.category === catPath).length;
    const subs = allCategories.filter((c) => c.parent === catPath);
    return direct + subs.reduce((sum, s) => sum + getTotalCount(s.path), 0);
  };

  const totalCount = getTotalCount(category.path);

  const categoryActions = canWrite
    ? [
        { label: "New Document", icon: <FilePlus className="w-4 h-4" />, onClick: () => onNewDoc(category.path) },
        { label: "New Subcategory", icon: <FolderPlus className="w-4 h-4" />, onClick: () => onNewSubcategory(category.path) },
        { label: "Rename", icon: <Pencil className="w-4 h-4" />, onClick: () => onRenameCategory(category.path), divider: true },
        { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteCategory(category.path), variant: "destructive" as const },
      ]
    : [];

  return (
    <div>
      {/* Category row */}
      <div className="group flex items-center" style={{ paddingLeft: `${category.level * 16}px` }}>
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
            {isCollapsed || !hasContent ? (
              <Folder className="w-4 h-4 text-text-muted flex-shrink-0" />
            ) : (
              <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
            )}
            <span className="truncate font-medium text-text-secondary">{category.name}</span>
            <span className="text-xs text-text-muted ml-auto flex-shrink-0">{totalCount}</span>
          </button>
        </div>
        {canWrite && categoryActions.length > 0 && (
          <ContextMenu actions={categoryActions} />
        )}
      </div>

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
              onEditDoc={onEditDoc}
              onDeleteDoc={onDeleteDoc}
              onMoveDoc={onMoveDoc}
              canWrite={canWrite}
            />
          ))}
          {categoryDocs.map((doc) => {
            const isActive =
              activeDoc?.name === doc.name && activeDoc?.category === doc.category;

            const docActions = canWrite
              ? [
                  { label: "Rename", icon: <Pencil className="w-4 h-4" />, onClick: () => onEditDoc(doc) },
                  { label: "Move to...", icon: <ArrowRight className="w-4 h-4" />, onClick: () => onMoveDoc(doc) },
                  { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteDoc(doc), variant: "destructive" as const, divider: true },
                ]
              : [];

            return (
              <div
                key={`${doc.category}/${doc.name}`}
                className="group flex items-center"
                style={{ paddingLeft: `${(category.level + 1) * 16}px` }}
              >
                <button
                  onClick={() => onSelectDoc(doc)}
                  className={`flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-accent-light text-accent-text"
                      : "text-text-secondary hover:bg-muted"
                  }`}
                >
                  <FileText className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-accent" : "text-text-muted"}`} />
                  <span className="truncate">{doc.name}</span>
                </button>
                {canWrite && docActions.length > 0 && (
                  <ContextMenu actions={docActions} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
