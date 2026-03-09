"use client";

import { X } from "lucide-react";
import type { ChangeLogEntry } from "@/lib/changelog";

const RISK_COLORS: Record<string, string> = {
  Low: "cl-risk--low",
  Medium: "cl-risk--medium",
  High: "cl-risk--high",
  Critical: "cl-risk--critical",
};

const STATUS_COLORS: Record<string, string> = {
  Completed: "cl-status--completed",
  Failed: "cl-status--failed",
  "Rolled Back": "cl-status--rolledback",
};

interface ChangeLogDetailModalProps {
  entry: ChangeLogEntry | null;
  onClose: () => void;
}

export default function ChangeLogDetailModal({ entry, onClose }: ChangeLogDetailModalProps) {
  if (!entry) return null;

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal cl-modal--detail" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            <span className="cl-detail-id">{entry.id}</span>
            {entry.category}
          </h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>

        <div className="cl-modal-body">
          <div className="cl-confirm-grid">
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Date</span>
              <span>{entry.date}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Author</span>
              <span>{entry.author}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">System</span>
              <a href="/assets" className="cl-link font-medium">{entry.system}</a>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Category</span>
              <span>{entry.category}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Status</span>
              <span className={`cl-badge ${STATUS_COLORS[entry.status] || ""}`}>{entry.status}</span>
            </div>
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Risk</span>
              <span className={`cl-badge ${RISK_COLORS[entry.risk] || ""}`}>{entry.risk}</span>
            </div>
            <div className="cl-confirm-row cl-confirm-row--block">
              <span className="cl-confirm-label">Description</span>
              <p>{entry.description}</p>
            </div>
            <div className="cl-confirm-row cl-confirm-row--block">
              <span className="cl-confirm-label">Impact</span>
              <p>{entry.impact}</p>
            </div>
            {entry.linkedDoc && (
              <div className="cl-confirm-row">
                <span className="cl-confirm-label">Linked Document</span>
                <a
                  href={`/?space=${encodeURIComponent(entry.linkedDoc.spaceSlug)}&doc=${encodeURIComponent(entry.linkedDoc.name)}&cat=${encodeURIComponent(entry.linkedDoc.category)}`}
                  className="cl-link"
                >
                  {entry.linkedDoc.name}
                </a>
              </div>
            )}
            <div className="cl-confirm-row">
              <span className="cl-confirm-label">Logged at</span>
              <span className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
