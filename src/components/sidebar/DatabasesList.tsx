"use client";

import { Database, ExternalLink, Pencil, Trash2, Star } from "lucide-react";
import ContextMenu from "@/components/ContextMenu";
import type { FavoriteItem } from "@/lib/types";

interface DbSummary {
  id: string;
  title: string;
  rowCount: number;
  createdAt: string;
}

interface DatabasesListProps {
  databases: DbSummary[];
  onSelectDatabase: (dbId: string) => void;
  canWrite: boolean;
  onEditDatabase?: (db: DbSummary) => void;
  onDeleteDatabase?: (db: DbSummary) => void;
  // Favorites
  favorites?: FavoriteItem[];
  spaceSlug?: string;
  spaceName?: string;
  onToggleFavorite?: (item: FavoriteItem) => void;
}

export default function DatabasesList({ databases, onSelectDatabase, canWrite, onEditDatabase, onDeleteDatabase, favorites, spaceSlug, spaceName, onToggleFavorite }: DatabasesListProps) {
  return (
    <div className="px-1">
      {databases.length === 0 ? (
        <p className="px-3 py-6 text-sm text-text-muted text-center">No databases yet</p>
      ) : (
        <div className="space-y-0.5">
          {databases.map((db) => {
            const isDbFavorited = !!favorites?.some(
              (f) => f.type === "database" && f.spaceSlug === spaceSlug && f.id === db.id
            );
            const favAction = onToggleFavorite && spaceSlug
              ? [{
                  label: isDbFavorited ? "Remove from favorites" : "Add to favorites",
                  icon: <Star className={`w-4 h-4 ${isDbFavorited ? "fill-amber-400 text-amber-400" : ""}`} />,
                  onClick: () => onToggleFavorite({ type: "database", name: db.title, id: db.id, spaceSlug, spaceName }),
                }]
              : [];
            return (
              <div key={db.id} className="group flex items-center">
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-muted transition-colors text-left flex-1 min-w-0"
                  onClick={() => onSelectDatabase(db.id)}
                >
                  <Database className="w-4 h-4 flex-shrink-0" style={{ color: "#14b8a6" }} />
                  <span className="truncate flex-1 font-medium">{db.title}</span>
                  <span className="text-xs text-text-muted flex-shrink-0">{db.rowCount} rows</span>
                </button>
                {/* Inline star */}
                {onToggleFavorite && spaceSlug && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite({ type: "database", name: db.title, id: db.id, spaceSlug, spaceName }); }}
                    className={`p-1 rounded transition-colors flex-shrink-0 ${
                      isDbFavorited
                        ? "text-amber-400 opacity-100"
                        : "text-text-muted opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-amber-400"
                    }`}
                    title={isDbFavorited ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`w-3.5 h-3.5 ${isDbFavorited ? "fill-amber-400" : ""}`} />
                  </button>
                )}
                <ContextMenu
                  actions={[
                    ...favAction,
                    { label: "Open", icon: <ExternalLink className="w-4 h-4" />, onClick: () => onSelectDatabase(db.id), divider: favAction.length > 0 },
                    ...(canWrite ? [
                      { label: "Rename", icon: <Pencil className="w-4 h-4" />, onClick: () => onEditDatabase?.(db) },
                      { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteDatabase?.(db), variant: "destructive" as const, divider: true },
                    ] : []),
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
