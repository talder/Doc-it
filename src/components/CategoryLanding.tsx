"use client";

import { useState, useEffect } from "react";
import {
  Folder, FolderOpen, FileText, Database as DbIcon, ChevronRight, ChevronDown,
  Loader2, Users, LayoutTemplate,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DocDetail {
  name: string;
  category: string;
  tags: string[];
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  isTemplate?: boolean;
}

interface SubCategoryInfo {
  name: string;
  path: string;
  docCount: number;
}

interface DbSummary {
  id: string;
  title: string;
  tags: string[];
  rowCount: number;
  createdAt: string;
  createdBy: string;
}

interface CategoryInfo {
  name: string;
  path: string;
  totalDocs: number;
  subCategoryCount: number;
  databaseCount: number;
}

interface CategoryData {
  category: CategoryInfo;
  docs: DocDetail[];
  subCategories: SubCategoryInfo[];
  subDocs: Record<string, DocDetail[]>;
  databases: DbSummary[];
}

interface Props {
  spaceSlug: string;
  categoryPath: string;
  onOpenDoc: (name: string, category: string) => void;
  onOpenDatabase: (dbId: string) => void;
  onOpenSubCategory?: (path: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-300",
  review: "bg-amber-100 text-amber-700 border-amber-300",
  published: "bg-green-100 text-green-700 border-green-300",
};

// ── Doc row ────────────────────────────────────────────────────────────────────

function DocRow({ doc, onOpen }: { doc: DocDetail; onOpen: () => void }) {
  const status = doc.status || "draft";
  return (
    <tr className="cat-landing-row" onClick={onOpen}>
      <td className="cat-landing-cell cat-landing-cell--name">
        {doc.isTemplate
          ? <LayoutTemplate className="w-3.5 h-3.5 text-text-muted" />
          : <FileText className="w-3.5 h-3.5 text-accent" />}
        {doc.name}
      </td>
      <td className="cat-landing-cell">
        {doc.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map((t) => (
              <span key={t} className="cat-landing-tag">#{t}</span>
            ))}
            {doc.tags.length > 3 && <span className="cat-landing-tag">+{doc.tags.length - 3}</span>}
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="cat-landing-cell">
        <span className={`cat-landing-status ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
          {status}
        </span>
      </td>
      <td className="cat-landing-cell text-text-muted">{doc.createdBy || "—"}</td>
      <td className="cat-landing-cell text-text-muted">{formatDate(doc.createdAt)}</td>
      <td className="cat-landing-cell text-text-muted">{formatDate(doc.updatedAt)}</td>
    </tr>
  );
}

// ── Doc table ──────────────────────────────────────────────────────────────────

function DocTable({ docs, onOpenDoc }: { docs: DocDetail[]; onOpenDoc: (name: string, category: string) => void }) {
  if (docs.length === 0) return <p className="text-sm text-text-muted italic px-1 py-2">No documents</p>;
  return (
    <table className="cat-landing-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Tags</th>
          <th>Status</th>
          <th>Creator</th>
          <th>Created</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <DocRow key={`${doc.category}/${doc.name}`} doc={doc} onOpen={() => onOpenDoc(doc.name, doc.category)} />
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CategoryLanding({ spaceSlug, categoryPath, onOpenDoc, onOpenDatabase, onOpenSubCategory }: Props) {
  const [data, setData] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/categories/${categoryPath}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [spaceSlug, categoryPath]);

  const toggleSub = (path: string) => {
    setCollapsedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading category…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <p className="text-sm">Category not found</p>
      </div>
    );
  }

  const { category, docs, subCategories, subDocs, databases } = data;
  const breadcrumb = category.path.split("/");

  return (
    <div className="flex-1 overflow-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb + title */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
            {breadcrumb.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                <button
                  className="hover:text-accent transition-colors"
                  onClick={() => onOpenSubCategory?.(breadcrumb.slice(0, i + 1).join("/"))}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-accent flex-shrink-0" />
            <h1 className="text-2xl font-bold text-text-primary">{category.name}</h1>
          </div>
        </div>

        {/* Stats bar */}
        <div className="cat-landing-stats">
          <div className="cat-landing-stat">
            <FileText className="w-4 h-4" />
            <span><strong>{category.totalDocs}</strong> documents</span>
          </div>
          {category.subCategoryCount > 0 && (
            <div className="cat-landing-stat">
              <Folder className="w-4 h-4" />
              <span><strong>{category.subCategoryCount}</strong> subcategories</span>
            </div>
          )}
          <div className="cat-landing-stat">
            <DbIcon className="w-4 h-4" />
            <span><strong>{category.databaseCount}</strong> tables</span>
          </div>
        </div>

        {/* Direct documents */}
        {docs.length > 0 && (
          <section className="mb-8">
            <h2 className="cat-landing-section-title">Documents</h2>
            <DocTable docs={docs} onOpenDoc={onOpenDoc} />
          </section>
        )}

        {/* Subcategories (collapsible) */}
        {subCategories.map((sub) => {
          const isCollapsed = collapsedSubs.has(sub.path);
          const subDocsList = subDocs[sub.path] || [];
          return (
            <section key={sub.path} className="mb-6">
              <button
                className="cat-landing-sub-header"
                onClick={() => toggleSub(sub.path)}
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">{sub.name}</span>
                <span className="text-text-muted text-xs ml-auto">{sub.docCount} docs</span>
              </button>
              {!isCollapsed && (
                <div className="ml-5 mt-1">
                  <DocTable docs={subDocsList} onOpenDoc={onOpenDoc} />
                </div>
              )}
            </section>
          );
        })}

        {/* Enhanced tables */}
        {databases.length > 0 && (
          <section className="mb-8">
            <h2 className="cat-landing-section-title">Enhanced Tables</h2>
            <table className="cat-landing-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Tags</th>
                  <th>Rows</th>
                  <th>Creator</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((db) => (
                  <tr key={db.id} className="cat-landing-row" onClick={() => onOpenDatabase(db.id)}>
                    <td className="cat-landing-cell cat-landing-cell--name">
                      <DbIcon className="w-3.5 h-3.5" style={{ color: "#14b8a6" }} />
                      {db.title}
                    </td>
                    <td className="cat-landing-cell">
                      {(db.tags || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(db.tags || []).slice(0, 3).map((t: string) => (
                            <span key={t} className="cat-landing-tag">#{t}</span>
                          ))}
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="cat-landing-cell text-text-muted">{db.rowCount}</td>
                    <td className="cat-landing-cell text-text-muted">{db.createdBy || "—"}</td>
                    <td className="cat-landing-cell text-text-muted">{formatDate(db.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Empty state */}
        {docs.length === 0 && subCategories.length === 0 && databases.length === 0 && (
          <div className="text-center py-16 text-text-muted">
            <Folder className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">This category is empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
