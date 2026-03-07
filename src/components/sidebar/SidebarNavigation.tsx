"use client";

import { FileText, Hash } from "lucide-react";

export type SidebarMode = "documents" | "tags";

interface SidebarNavigationProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  tagCount: number;
}

export default function SidebarNavigation({ mode, onModeChange, tagCount }: SidebarNavigationProps) {
  return (
    <div className="flex gap-1 p-2 border-b border-border">
      <button
        onClick={() => onModeChange("documents")}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          mode === "documents"
            ? "bg-accent text-white"
            : "text-text-muted hover:bg-muted hover:text-text-secondary"
        }`}
      >
        <FileText className="w-4 h-4" />
        Documents
      </button>
      {tagCount > 0 && (
        <button
          onClick={() => onModeChange("tags")}
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "tags"
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-muted hover:text-text-secondary"
          }`}
        >
          <Hash className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
