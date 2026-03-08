"use client";

import { FilePlus, FolderPlus, LayoutTemplate } from "lucide-react";

interface SidebarActionsProps {
  onNewDoc: () => void;
  onNewCategory: () => void;
  onNewTemplate: () => void;
  canWrite: boolean;
}

export default function SidebarActions({ onNewDoc, onNewCategory, onNewTemplate, canWrite }: SidebarActionsProps) {
  if (!canWrite) return null;

  return (
    <div className="p-2 border-t border-border">
      <div className="flex gap-2">
        <button
          onClick={onNewDoc}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
        >
          <FilePlus className="w-4 h-4" />
          New Document
        </button>
        <button
          onClick={onNewTemplate}
          className="flex items-center justify-center px-3 py-2.5 bg-tpl-action text-white text-sm rounded-lg hover:bg-tpl-action-hover transition-colors"
          title="New Template"
        >
          <LayoutTemplate className="w-4 h-4" />
        </button>
        <button
          onClick={onNewCategory}
          className="flex items-center justify-center px-3 py-2.5 border border-border text-text-muted text-sm rounded-lg hover:bg-muted transition-colors"
          title="New Category"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
