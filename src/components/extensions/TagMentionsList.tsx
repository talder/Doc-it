"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef,
} from "react";

interface TagMentionItem {
  tag: string;
  display: string;
}

interface TagMentionsListProps {
  items: TagMentionItem[];
  command: (item: TagMentionItem) => void;
}

export const TagMentionsList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  TagMentionsListProps
>(({ items, command }, ref) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredItems = items.filter((item) =>
    item.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectItem = (index: number) => {
    const item = filteredItems[index];
    if (item) command(item);
  };

  useEffect(() => setSelectedIndex(0), [searchQuery, items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) =>
          Math.min(filteredItems.length - 1, prev + 1)
        );
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      if (event.key === "Tab") {
        searchInputRef.current?.focus();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="tag-mentions-popup">
      <div className="tag-mentions-search">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="tag-mentions-search-icon"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="tag-mentions-input"
        />
      </div>

      <div className="tag-mentions-list">
        {filteredItems.length ? (
          filteredItems.map((item, index) => (
            <button
              key={item.tag}
              className={`tag-mentions-item${
                index === selectedIndex ? " selected" : ""
              }`}
              onClick={() => selectItem(index)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="tag-mentions-tag-icon"
              >
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <path d="M7 7h.01" />
              </svg>
              <span>#{item.display}</span>
            </button>
          ))
        ) : (
          <div className="tag-mentions-empty">No tags found</div>
        )}
      </div>
    </div>
  );
});

TagMentionsList.displayName = "TagMentionsList";
