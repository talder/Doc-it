"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SlashCommandItem } from "./SlashCommands";

interface SlashCommandsListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandsList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  SlashCommandsListProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useEffect(() => setSelectedIndex(0), [items]);

  // Scroll selected item into view on keyboard navigation
  useEffect(() => {
    if (!gridRef.current) return;
    const btn = gridRef.current.children[selectedIndex] as HTMLElement | undefined;
    btn?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        const newIndex = selectedIndex - 2;
        if (newIndex < 0) {
          const bottomRowStart = Math.floor((items.length - 1) / 2) * 2;
          setSelectedIndex(Math.min(bottomRowStart + (selectedIndex % 2), items.length - 1));
        } else {
          setSelectedIndex(newIndex);
        }
        return true;
      }
      if (event.key === "ArrowDown") {
        const newIndex = selectedIndex + 2;
        if (newIndex >= items.length) {
          setSelectedIndex(selectedIndex % 2);
        } else {
          setSelectedIndex(newIndex);
        }
        return true;
      }
      if (event.key === "ArrowLeft") {
        if (selectedIndex % 2 === 1) setSelectedIndex(selectedIndex - 1);
        return true;
      }
      if (event.key === "ArrowRight") {
        if (selectedIndex % 2 === 0 && selectedIndex + 1 < items.length)
          setSelectedIndex(selectedIndex + 1);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-surface border border-border rounded-lg shadow-lg p-2 min-w-[340px] max-w-[420px]">
      {items.length ? (
        <div ref={gridRef} className="grid grid-cols-2 gap-1 max-h-[220px] overflow-y-auto overscroll-contain">
          {items.map((item, index) => (
            <button
              key={index}
              className={`flex items-center gap-2 px-3 py-2 text-left rounded-md text-sm transition-colors border ${
                index === selectedIndex
                  ? "bg-accent-light text-accent-text border-accent"
                  : "hover:bg-muted border-transparent text-text-primary"
              }`}
              onClick={() => selectItem(index)}
            >
              <div className="flex-shrink-0 text-text-muted">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs">{item.title}</div>
                <div className="text-[11px] text-text-muted truncate">
                  {item.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-text-muted">No results found</div>
      )}
    </div>
  );
});

SlashCommandsList.displayName = "SlashCommandsList";
