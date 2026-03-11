"use client";

import { useState, useEffect } from "react";
import { X, Archive, Trash2, AlertTriangle } from "lucide-react";

interface DeleteCategoryModalProps {
  isOpen: boolean;
  categoryPath: string;
  categoryName: string;
  docCount: number;
  subCount: number;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export default function DeleteCategoryModal({
  isOpen,
  categoryPath,
  categoryName,
  docCount,
  subCount,
  onClose,
  onArchive,
  onDelete,
}: DeleteCategoryModalProps) {
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!isOpen) setConfirmName("");
  }, [isOpen]);

  if (!isOpen) return null;

  const hasContent = docCount > 0 || subCount > 0;
  const leafName = categoryPath.split("/").pop() || categoryName;
  const deleteReady = !hasContent || confirmName === leafName;

  const contentParts = [
    docCount > 0 ? `${docCount} document${docCount !== 1 ? "s" : ""}` : "",
    subCount > 0 ? `${subCount} subcategor${subCount !== 1 ? "ies" : "y"}` : "",
  ].filter(Boolean);
  const contentSummary = contentParts.join(" and ");

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Delete category</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-message">
            What would you like to do with &quot;{categoryName}&quot;?
          </p>

          {hasContent && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                This category contains {contentSummary}. All content will be affected.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-4">
            {/* Archive */}
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
              onClick={() => { onArchive(); onClose(); }}
            >
              <Archive className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">Archive</p>
                <p className="text-xs text-text-muted">Move to archive — can be restored anytime</p>
              </div>
            </button>

            {/* Delete to Recycle Bin */}
            <div className="rounded-lg border border-red-200 dark:border-red-900 p-3">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-600">Delete to Recycle Bin</p>
                  <p className="text-xs text-text-muted">
                    {hasContent
                      ? "All documents will be moved to the recycle bin and auto-deleted after the retention period."
                      : "Auto-deleted after the retention period."}
                  </p>
                </div>
              </div>

              {hasContent && (
                <div className="mt-3">
                  <p className="text-xs text-text-muted mb-1.5">
                    Type{" "}
                    <span className="font-mono font-semibold text-text-primary">{leafName}</span>
                    {" "}to confirm:
                  </p>
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="modal-input text-sm"
                    placeholder={leafName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && deleteReady) { onDelete(); onClose(); }
                    }}
                  />
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  disabled={!deleteReady}
                  onClick={() => { if (deleteReady) { onDelete(); onClose(); } }}
                  className="modal-btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Delete to Recycle Bin
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="modal-btn-cancel">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
