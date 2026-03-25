"use client";

import { FileText, Hash, LayoutTemplate, Database, Star } from "lucide-react";

export type SidebarMode = "documents" | "tags" | "templates" | "databases" | "favorites";

interface SidebarNavigationProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  tagCount: number;
  templateCount: number;
  databaseCount: number;
  favoritesCount: number;
}

export default function SidebarNavigation({ mode, onModeChange, tagCount, templateCount, databaseCount, favoritesCount }: SidebarNavigationProps) {
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
      {templateCount > 0 && (
        <button
          onClick={() => onModeChange("templates")}
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "templates"
              ? "bg-tpl-action text-white"
              : "text-text-muted hover:bg-muted hover:text-text-secondary"
          }`}
          title="Templates"
        >
          <LayoutTemplate className="w-4 h-4" />
        </button>
      )}
      {databaseCount > 0 && (
        <button
          onClick={() => onModeChange("databases")}
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "databases"
              ? "bg-[#14b8a6] text-white"
              : "text-text-muted hover:bg-muted hover:text-text-secondary"
          }`}
          title="Enhanced Tables"
        >
          <Database className="w-4 h-4" />
        </button>
      )}
      {tagCount > 0 && (
        <button
          onClick={() => onModeChange("tags")}
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "tags"
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-muted hover:text-text-secondary"
          }`}
          title="Tags"
        >
          <Hash className="w-4 h-4" />
        </button>
      )}
      {/* Favorites — always visible */}
      <button
        onClick={() => onModeChange("favorites")}
        className={`relative flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          mode === "favorites"
            ? "bg-amber-400 text-white"
            : "text-text-muted hover:bg-muted hover:text-text-secondary"
        }`}
        title="Favorites"
      >
        <Star className={`w-4 h-4 ${mode === "favorites" ? "fill-white" : favoritesCount > 0 ? "fill-amber-400 text-amber-400" : ""}`} />
        {favoritesCount > 0 && mode !== "favorites" && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center">
            {favoritesCount}
          </span>
        )}
      </button>
    </div>
  );
}
