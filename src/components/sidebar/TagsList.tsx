"use client";

import { ChevronRight, ChevronDown, Hash, RefreshCw, FileText, Settings, Database as DbIcon } from "lucide-react";
import { buildTagTree, getChildTags } from "@/lib/tags";
import type { TagInfo, TagsIndex, DocFile } from "@/lib/types";
import { useState } from "react";

interface DbSummary {
  id: string;
  title: string;
  rowCount: number;
  createdAt: string;
  tags?: string[];
}

interface TagsListProps {
  tagsIndex: TagsIndex;
  docs: DocFile[];
  databases?: DbSummary[];
  activeDoc: { name: string; category: string } | null;
  onTagSelect: (tagName: string) => void;
  onSelectDoc: (doc: DocFile) => void;
  onSelectDatabase?: (dbId: string) => void;
  selectedTag: string | null;
  onReindex?: () => void;
  isReindexing?: boolean;
  tagColors?: Record<string, string>;
  onOpenTagManager?: () => void;
}

function TagRenderer({
  tag,
  tagsIndex,
  docs,
  databases,
  activeDoc,
  collapsedTags,
  toggleTag,
  onTagSelect,
  onSelectDoc,
  onSelectDatabase,
  selectedTag,
  tagColors,
}: {
  tag: TagInfo;
  tagsIndex: TagsIndex;
  docs: DocFile[];
  databases?: DbSummary[];
  activeDoc: { name: string; category: string } | null;
  collapsedTags: Set<string>;
  toggleTag: (name: string) => void;
  onTagSelect: (name: string) => void;
  onSelectDoc: (doc: DocFile) => void;
  onSelectDatabase?: (dbId: string) => void;
  selectedTag: string | null;
  tagColors?: Record<string, string>;
}) {
  const color = tagColors?.[tag.name];
  const children = getChildTags(tagsIndex, tag.name);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedTags.has(tag.name);
  const isSelected = selectedTag === tag.name;

  // Find docs that have this tag
  const docNames = tag.docNames || [];
  const tagDocs = docs.filter((d) =>
    docNames.some((tn) =>
      tn === d.name || tn === `${d.category}/${d.name}` || tn.endsWith(`/${d.name}`)
    )
  );
  // Find enhanced tables that have this tag
  const tagDbs = (databases || []).filter((db) =>
    db.tags?.some((t) => t.toLowerCase() === tag.name)
  );
  const hasContent = tagDocs.length > 0 || tagDbs.length > 0 || hasChildren;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm">
        <button
          onClick={() => hasContent && toggleTag(tag.name)}
          className="flex-shrink-0"
        >
          {hasContent ? (
            isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            )
          ) : (
            <ChevronRight className="w-4 h-4 text-border" />
          )}
        </button>
        <button
          onClick={() => onTagSelect(tag.name)}
          className={`flex items-center gap-1.5 flex-1 min-w-0 ${
            isSelected ? "text-accent-text font-medium" : "text-text-secondary"
          }`}
        >
          {color ? (
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
          ) : (
            <Hash className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span className="truncate">{tag.displayName}</span>
          <span className="text-xs text-text-muted ml-auto">{tag.totalCount}</span>
        </button>
      </div>

      {!isCollapsed && hasContent && (
        <div className="ml-3 border-l border-border-light pl-1">
          {/* Documents with this tag */}
          {tagDocs.map((doc, i) => {
            const isActive = activeDoc?.name === doc.name && activeDoc?.category === doc.category;
            return (
              <button
                key={`${doc.category}/${doc.name}-${i}`}
                onClick={() => onSelectDoc(doc)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent-light text-accent-text"
                    : "text-text-secondary hover:bg-muted"
                }`}
              >
                <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-accent" : "text-text-muted"}`} />
                <span className="truncate">{doc.name}</span>
              </button>
            );
          })}

          {/* Enhanced tables with this tag */}
          {tagDbs.map((db) => (
            <button
              key={db.id}
              onClick={() => onSelectDatabase?.(db.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-text-secondary hover:bg-muted"
            >
              <DbIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#14b8a6" }} />
              <span className="truncate">{db.title}</span>
            </button>
          ))}

          {/* Child tags */}
          {children.map((child, i) => (
            <TagRenderer
              key={`${child.name}-${i}`}
              tag={child}
              tagsIndex={tagsIndex}
              docs={docs}
              databases={databases}
              activeDoc={activeDoc}
              collapsedTags={collapsedTags}
              toggleTag={toggleTag}
              onTagSelect={onTagSelect}
              onSelectDoc={onSelectDoc}
              onSelectDatabase={onSelectDatabase}
              selectedTag={selectedTag}
              tagColors={tagColors}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TagsList({ tagsIndex, docs, databases, activeDoc, onTagSelect, onSelectDoc, onSelectDatabase, selectedTag, onReindex, isReindexing, tagColors, onOpenTagManager }: TagsListProps) {
  const rootTags = buildTagTree(tagsIndex);
  // Start with all tags collapsed
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(() => new Set(rootTags.map((t) => t.name)));
  const [sectionCollapsed, setSectionCollapsed] = useState(true);

  if (rootTags.length === 0) return null;

  const toggleTag = (name: string) => {
    setCollapsedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allCollapsed = rootTags.every((t) => collapsedTags.has(t.name));
  const handleToggleAll = () => {
    if (allCollapsed) {
      setCollapsedTags(new Set());
    } else {
      setCollapsedTags(new Set(rootTags.map((t) => t.name)));
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={() => setSectionCollapsed(!sectionCollapsed)}
          className="flex items-center gap-1 text-xs font-bold uppercase text-text-muted tracking-wider hover:text-text-secondary"
        >
          {sectionCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          Tags
        </button>
        <div className="flex items-center gap-2">
          {onOpenTagManager && (
            <button
              onClick={onOpenTagManager}
              className="text-xs text-text-muted hover:text-accent transition-colors"
              title="Manage tags"
            >
              <Settings className="w-3 h-3" />
            </button>
          )}
          {onReindex && (
            <button
              onClick={onReindex}
              disabled={isReindexing}
              className="text-xs text-text-muted hover:text-accent transition-colors"
              title="Reindex tags"
            >
              <RefreshCw className={`w-3 h-3${isReindexing ? " animate-spin" : ""}`} />
            </button>
          )}
          {!sectionCollapsed && (
            <button
              onClick={handleToggleAll}
              className="text-xs text-accent hover:underline"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>
      </div>

      {!sectionCollapsed && (
        <div className="px-1">
          {rootTags.map((tag, i) => (
            <TagRenderer
              key={`${tag.name}-${i}`}
              tag={tag}
              tagsIndex={tagsIndex}
              docs={docs}
              databases={databases}
              activeDoc={activeDoc}
              collapsedTags={collapsedTags}
              toggleTag={toggleTag}
              onTagSelect={onTagSelect}
              onSelectDoc={onSelectDoc}
              onSelectDatabase={onSelectDatabase}
              selectedTag={selectedTag}
              tagColors={tagColors}
            />
          ))}
        </div>
      )}
    </div>
  );
}
