"use client";

import { Pencil, Trash2, GripVertical } from "lucide-react";
import DashboardIcon from "./DashboardIcon";
import type { DashboardLink } from "@/lib/types";

interface DashboardCardProps {
  link: DashboardLink;
  isAdmin: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export default function DashboardCard({
  link,
  isAdmin,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: DashboardCardProps) {
  const borderColor = link.color || "var(--color-border)";

  return (
    <div
      className="group relative flex items-center gap-3 rounded-lg border bg-surface hover:shadow-md transition-all cursor-pointer overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
      draggable={draggable}
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
      onDragOver={(e) => { e.stopPropagation(); onDragOver?.(e); }}
      onDrop={(e) => { e.stopPropagation(); onDrop?.(e); }}
    >
      {/* Drag handle (admin only) */}
      {isAdmin && draggable && (
        <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-60 cursor-grab text-text-muted">
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      <a
        href={link.url}
        target={link.openInNewTab ? "_blank" : "_self"}
        rel={link.openInNewTab ? "noopener noreferrer" : undefined}
        className="flex items-center gap-3 flex-1 min-w-0 px-3 py-3 no-underline"
        onClick={(e) => e.stopPropagation()}
      >
        <DashboardIcon icon={link.icon} url={link.url} size={24} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate leading-tight">
            {link.title}
          </p>
          {link.description && (
            <p className="text-xs text-text-muted truncate leading-tight mt-0.5">
              {link.description}
            </p>
          )}
        </div>
      </a>

      {/* Admin actions (hover) */}
      {isAdmin && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="p-1 rounded hover:bg-muted text-text-muted hover:text-text-secondary"
            title="Edit link"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="p-1 rounded hover:bg-red-100 text-text-muted hover:text-red-600"
            title="Delete link"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
