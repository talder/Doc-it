"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  divider?: boolean;
}

interface ContextMenuProps {
  actions: MenuAction[];
  className?: string;
}

export default function ContextMenu({ actions, className = "" }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1 rounded hover:bg-muted-hover text-text-muted hover:text-text-secondary transition-colors opacity-0 group-hover:opacity-100"
        title="More options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] whitespace-nowrap">
          {actions.map((action, i) => (
            <div key={i}>
              {action.divider && <hr className="border-border-light my-1" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  action.onClick();
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
                  action.variant === "destructive"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-text-secondary"
                }`}
              >
                {action.icon && <span className="w-4 h-4 flex-shrink-0">{action.icon}</span>}
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
