"use client";

import { useState, useRef, useEffect } from "react";
import { Filter, ArrowUpDown, Plus, LayoutGrid, Columns3, Calendar, GalleryHorizontalEnd, Search, Eye, Pencil, X, Download, Upload, Palette, History, Zap } from "lucide-react";
import type { EnhancedTable, DbView, DbViewType } from "@/lib/types";

const VIEW_ICONS: Record<DbViewType, typeof LayoutGrid> = {
  table: LayoutGrid,
  kanban: Columns3,
  calendar: Calendar,
  gallery: GalleryHorizontalEnd,
};

interface Props {
  db: EnhancedTable;
  activeViewId: string;
  onSwitchView: (viewId: string) => void;
  onAddView: (type: DbViewType, name: string) => void;
  onRenameView: (viewId: string, name: string) => void;
  onDeleteView: (viewId: string) => void;
  showFilter: boolean;
  onToggleFilter: () => void;
  showSort: boolean;
  onToggleSort: () => void;
  filterCount: number;
  sortCount: number;
  search: string;
  onSearch: (q: string) => void;
  canWrite: boolean;
  onShowHidden: () => void;
  hiddenCount: number;
  onExportCSV?: () => void;
  onImportCSV?: () => void;
  showConditionalFormat?: boolean;
  onToggleConditionalFormat?: () => void;
  conditionalFormatCount?: number;
  onShowHistory?: () => void;
  onShowWebhooks?: () => void;
}

export default function DatabaseToolbar({
  db, activeViewId, onSwitchView, onAddView, onRenameView, onDeleteView,
  showFilter, onToggleFilter, showSort, onToggleSort,
  filterCount, sortCount, search, onSearch, canWrite, onShowHidden, hiddenCount,
  onExportCSV, onImportCSV, showConditionalFormat, onToggleConditionalFormat, conditionalFormatCount = 0,
  onShowHistory,
  onShowWebhooks,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeView = db.views.find((v) => v.id === activeViewId);

  return (
    <div className="et-toolbar">
      {/* View tabs */}
      <div className="et-toolbar-views">
        {db.views.map((v) => {
          const Icon = VIEW_ICONS[v.type] || LayoutGrid;
          const isActive = v.id === activeViewId;
          if (renameId === v.id) {
            return (
              <input
                key={v.id}
                autoFocus
                className="et-toolbar-view-rename"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onBlur={() => { if (renameName.trim()) onRenameView(v.id, renameName.trim()); setRenameId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameName.trim()) { onRenameView(v.id, renameName.trim()); setRenameId(null); }
                  if (e.key === "Escape") setRenameId(null);
                }}
              />
            );
          }
          return (
            <button
              key={v.id}
              className={`et-toolbar-view-tab${isActive ? " active" : ""}`}
              onClick={() => onSwitchView(v.id)}
              onDoubleClick={() => { setRenameId(v.id); setRenameName(v.name); }}
              title={`${v.name} (${v.type})`}
            >
              <Icon className="w-3 h-3" />
              <span>{v.name}</span>
              {isActive && db.views.length > 1 && canWrite && (
                <span role="button" tabIndex={0} className="et-toolbar-view-delete" onClick={(e) => { e.stopPropagation(); onDeleteView(v.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onDeleteView(v.id); } }} title="Delete view">
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
            </button>
          );
        })}
        {canWrite && (
          <div className="relative" ref={addRef}>
            <button className="et-toolbar-add-view" onClick={() => setAddOpen(!addOpen)} title="Add view">
              <Plus className="w-3 h-3" />
            </button>
            {addOpen && (
              <div className="et-toolbar-add-view-dropdown">
                {(["table", "kanban", "calendar", "gallery"] as DbViewType[]).map((type) => {
                  const Icon = VIEW_ICONS[type];
                  return (
                    <button key={type} className="et-toolbar-add-view-item" onClick={() => { onAddView(type, `${type.charAt(0).toUpperCase() + type.slice(1)} View`); setAddOpen(false); }}>
                      <Icon className="w-3.5 h-3.5" /> {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="et-toolbar-actions">
        {hiddenCount > 0 && (
          <button className="et-toolbar-btn" onClick={onShowHidden} title="Show hidden columns">
            <Eye className="w-3.5 h-3.5" /> {hiddenCount} hidden
          </button>
        )}
        <button className={`et-toolbar-btn${showFilter ? " active" : ""}`} onClick={onToggleFilter}>
          <Filter className="w-3.5 h-3.5" />
          Filter{filterCount > 0 && <span className="et-toolbar-badge">{filterCount}</span>}
        </button>
        <button className={`et-toolbar-btn${showSort ? " active" : ""}`} onClick={onToggleSort}>
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort{sortCount > 0 && <span className="et-toolbar-badge">{sortCount}</span>}
        </button>
        {onToggleConditionalFormat && (
          <button className={`et-toolbar-btn${showConditionalFormat ? " active" : ""}`} onClick={onToggleConditionalFormat}>
            <Palette className="w-3.5 h-3.5" />
            Format{conditionalFormatCount > 0 && <span className="et-toolbar-badge">{conditionalFormatCount}</span>}
          </button>
        )}
        {onExportCSV && (
          <button className="et-toolbar-btn" onClick={onExportCSV} title="Export CSV">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
        {onImportCSV && canWrite && (
          <button className="et-toolbar-btn" onClick={onImportCSV} title="Import CSV">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
        )}
        {onShowHistory && (
          <button className="et-toolbar-btn" onClick={onShowHistory} title="Revision history">
            <History className="w-3.5 h-3.5" /> History
          </button>
        )}
        {onShowWebhooks && (
          <button className="et-toolbar-btn" onClick={onShowWebhooks} title="Automations">
            <Zap className="w-3.5 h-3.5" /> Automations
          </button>
        )}
        <div className="et-toolbar-search">
          <Search className="w-3 h-3 text-text-muted" />
          <input
            className="et-toolbar-search-input"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
