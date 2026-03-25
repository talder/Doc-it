"use client";

import { Star, FileText, Database, Trash2 } from "lucide-react";
import ContextMenu from "@/components/ContextMenu";
import type { FavoriteItem } from "@/lib/types";

interface FavoritesListProps {
  favorites: FavoriteItem[];
  onSelect: (item: FavoriteItem) => void;
  onRemove: (item: FavoriteItem) => void;
  currentSpaceSlug?: string;
}

function favKey(f: FavoriteItem) {
  return f.type === "database"
    ? `db:${f.spaceSlug}:${f.id}`
    : `doc:${f.spaceSlug}:${f.category}:${f.name}`;
}

export default function FavoritesList({ favorites, onSelect, onRemove, currentSpaceSlug }: FavoritesListProps) {
  if (favorites.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Star className="w-8 h-8 mx-auto mb-3 text-text-muted opacity-40" />
        <p className="text-sm font-medium text-text-muted">No favorites yet</p>
        <p className="text-xs text-text-muted mt-1 opacity-70">
          Star docs or enhanced tables to access them quickly
        </p>
      </div>
    );
  }

  // Group by spaceSlug, preserving insertion order
  const grouped = favorites.reduce<Record<string, FavoriteItem[]>>((acc, f) => {
    if (!acc[f.spaceSlug]) acc[f.spaceSlug] = [];
    acc[f.spaceSlug].push(f);
    return acc;
  }, {});

  const spaceKeys = Object.keys(grouped);
  const multiSpace = spaceKeys.length > 1;

  return (
    <div className="px-1 py-1 space-y-1">
      {spaceKeys.map((slug) => (
        <div key={slug}>
          {multiSpace && (
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted truncate">
              {grouped[slug][0].spaceName || slug}
            </p>
          )}
          <div className="space-y-0.5">
            {grouped[slug].map((item) => {
              const isCurrent = slug === currentSpaceSlug;
              return (
                <div key={favKey(item)} className="group flex items-center">
                  <button
                    onClick={() => onSelect(item)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-muted transition-colors text-left flex-1 min-w-0"
                  >
                    {item.type === "database" ? (
                      <Database className="w-4 h-4 flex-shrink-0" style={{ color: "#14b8a6" }} />
                    ) : (
                      <FileText className="w-4 h-4 flex-shrink-0 text-accent" />
                    )}
                    <span className="truncate flex-1 font-medium">{item.name}</span>
                    {item.type === "doc" && item.category && (
                      <span className="text-xs text-text-muted flex-shrink-0 truncate max-w-[80px]">
                        {item.category}
                      </span>
                    )}
                    {!isCurrent && (
                      <span className="text-[10px] text-text-muted flex-shrink-0 border border-border rounded px-1 py-0.5 ml-1">
                        {item.spaceName || slug}
                      </span>
                    )}
                  </button>
                  <ContextMenu
                    actions={[
                      {
                        label: "Remove from favorites",
                        icon: <Trash2 className="w-4 h-4" />,
                        onClick: () => onRemove(item),
                        variant: "destructive",
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
