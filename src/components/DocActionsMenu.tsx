"use client";

import { useState, useRef, useEffect } from "react";
import {
  Pencil, Check, PenLine, MoreHorizontal, Copy, Printer, History,
  FolderInput, Archive, Trash2, X, Star,
} from "lucide-react";

interface DocActionsMenuProps {
  canWrite: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onDiscard: () => void;
  onDistractionFree?: () => void;
  onCopyMarkdown: () => void;
  onPrint: () => void;
  onHistory: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function DocActionsMenu({
  canWrite,
  isEditing,
  onToggleEdit,
  onDiscard,
  onDistractionFree,
  onCopyMarkdown,
  onPrint,
  onHistory,
  onMove,
  onArchive,
  onDelete,
  isFavorite,
  onToggleFavorite,
}: DocActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="flex items-center gap-1">
      {/* Edit / Done / Discard buttons */}
      {canWrite && (
        <>
          {isEditing ? (
            <>
              <button
                onClick={onDiscard}
                className="doc-action-icon-btn discard"
                title="Discard changes"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={onToggleEdit}
                className="doc-action-icon-btn active"
                title="Done editing"
              >
                <Check className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onToggleEdit}
                className="doc-action-icon-btn"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              {onDistractionFree && (
                <button
                  onClick={onDistractionFree}
                  className="doc-action-icon-btn"
                  title="Distraction-free edit"
                >
                  <PenLine className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* More actions */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="doc-action-icon-btn"
          title="More actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {open && (
          <div className="doc-actions-dropdown">
            {onToggleFavorite && (
              <>
                <button
                  onClick={() => { onToggleFavorite(); setOpen(false); }}
                  className="doc-actions-item"
                >
                  <Star className={`w-4 h-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
                  {isFavorite ? "Remove from favorites" : "Add to favorites"}
                </button>
                <hr className="doc-actions-separator" />
              </>
            )}
            <button
              onClick={() => { onCopyMarkdown(); setOpen(false); }}
              className="doc-actions-item"
            >
              <Copy className="w-4 h-4" />
              Copy markdown
            </button>
            <button
              onClick={() => { onPrint(); setOpen(false); }}
              className="doc-actions-item"
            >
              <Printer className="w-4 h-4" />
              Print / Save as PDF
            </button>
            <button
              onClick={() => { onHistory(); setOpen(false); }}
              className="doc-actions-item"
            >
              <History className="w-4 h-4" />
              History
            </button>

            {canWrite && (
              <>
                <hr className="doc-actions-separator" />
                <button
                  onClick={() => { onMove(); setOpen(false); }}
                  className="doc-actions-item"
                >
                  <FolderInput className="w-4 h-4" />
                  Move
                </button>
                <button
                  onClick={() => { onArchive(); setOpen(false); }}
                  className="doc-actions-item"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
                <hr className="doc-actions-separator" />
                <button
                  onClick={() => { onDelete(); setOpen(false); }}
                  className="doc-actions-item danger"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
