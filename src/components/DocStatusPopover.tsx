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
  const [pendingReview, setPendingReview] = useState(false);
  const [selectedReviewer, setSelectedReviewer] = useState(currentReviewer || "");
  const ref = useRef<HTMLDivElement>(null);

  // Reset local state whenever popover opens
  useEffect(() => {
    if (isOpen) {
      setPendingReview(false);
      setSelectedReviewer(currentReviewer || "");
    }
  }, [isOpen, currentReviewer]);

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

  const handleSelect = (status: DocStatus) => {
    if (status === "review") {
      // Show reviewer picker instead of applying immediately
      setPendingReview(true);
      return;
    }
    onSave(status, undefined);
    onClose();
  };

  const handleConfirmReview = () => {
    if (!selectedReviewer) return;
    onSave("review", selectedReviewer);
    onClose();
  };

  return (
    <div ref={ref} className="doc-status-popover" style={{ right: 0, left: "auto" }}>
      {!pendingReview ? (
        <>
          <div className="doc-status-popover-title">Set status</div>
          <div className="doc-status-options">
            {STATUS_OPTIONS.filter((opt) => canAssignReview || opt.value !== "review").map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`doc-status-option ${opt.cls} ${currentStatus === opt.value ? "selected" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="doc-status-popover-title">Assign reviewer</div>
          <div className="doc-status-reviewer">
            <select
              autoFocus
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
          <div className="doc-status-popover-actions">
            <button onClick={() => setPendingReview(false)} className="doc-status-cancel-btn">Back</button>
            <button
              onClick={handleConfirmReview}
              disabled={!selectedReviewer}
              className="doc-status-save-btn"
            >
              Assign
            </button>
          </div>
        </>
      )}
    </div>
  );
}
