"use client";

import { useEffect, useRef, useState } from "react";
import type { DocStatus } from "@/lib/types";

interface Member {
  username: string;
  fullName?: string;
}

interface DocStatusPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: DocStatus;
  currentReviewer?: string;
  members: Member[];
  onSave: (status: DocStatus, reviewer?: string) => void;
  /** If false, REVIEW option is hidden and reviewer picker is disabled */
  canAssignReview?: boolean;
}

const STATUS_OPTIONS: { value: DocStatus; label: string; cls: string }[] = [
  { value: "draft",     label: "Draft",     cls: "doc-status-draft" },
  { value: "review",    label: "Review",    cls: "doc-status-review" },
  { value: "published", label: "Published", cls: "doc-status-published" },
];

export default function DocStatusPopover({
  isOpen,
  onClose,
  currentStatus,
  currentReviewer,
  members,
  onSave,
  canAssignReview = true,
}: DocStatusPopoverProps) {
  const [selectedStatus, setSelectedStatus] = useState<DocStatus>(currentStatus);
  const [selectedReviewer, setSelectedReviewer] = useState(currentReviewer || "");
  const ref = useRef<HTMLDivElement>(null);

  // Reset local state whenever popover opens
  useEffect(() => {
    if (isOpen) {
      setSelectedStatus(currentStatus);
      setSelectedReviewer(currentReviewer || "");
    }
  }, [isOpen, currentStatus, currentReviewer]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (selectedStatus === "review" && !selectedReviewer) return;
    onSave(selectedStatus, selectedStatus === "review" ? selectedReviewer : undefined);
    onClose();
  };

  return (
    <div ref={ref} className="doc-status-popover">
      <div className="doc-status-popover-title">Set document status</div>

      <div className="doc-status-options">
        {STATUS_OPTIONS.filter((opt) => canAssignReview || opt.value !== "review").map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelectedStatus(opt.value)}
            className={`doc-status-option ${opt.cls} ${selectedStatus === opt.value ? "selected" : ""}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {selectedStatus === "review" && (
        <div className="doc-status-reviewer">
          <label className="doc-status-reviewer-label">Assign reviewer</label>
          <select
            value={selectedReviewer}
            onChange={(e) => setSelectedReviewer(e.target.value)}
            className="doc-status-reviewer-select"
          >
            <option value="">— select a reviewer —</option>
            {members.map((m) => (
              <option key={m.username} value={m.username}>
                {m.fullName ? `${m.fullName} (${m.username})` : m.username}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="doc-status-popover-actions">
        <button onClick={onClose} className="doc-status-cancel-btn">Cancel</button>
        <button
          onClick={handleSave}
          disabled={selectedStatus === "review" && !selectedReviewer}
          className="doc-status-save-btn"
        >
          Save
        </button>
      </div>
    </div>
  );
}
