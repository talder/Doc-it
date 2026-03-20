"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ChevronRight, ChevronDown, ArrowLeft, BookOpen, FileText, Home, ChevronLeft } from "lucide-react";

/** Flatten the tree into an ordered list of file paths matching the sidebar order */
function flattenTree(items: DocTreeItem[]): string[] {
  const result: string[] = [];
  // Mirror sidebar order: top-level files first, then dirs
  for (const item of items) {
    if (item.type === "file") {
      result.push(item.path);
    } else if (item.type === "dir" && item.children) {
      result.push(...flattenTree(item.children));
    }
  }
  return result;
}

/** Resolve a relative href from a given file path (e.g. features/editor.md -> features/editor) */
function resolveDocPath(currentFile: string, href: string): string {
  // Strip .md extension
  const target = href.replace(/\.md$/, "");
  // Absolute path (relative to docs root)
  if (target.startsWith("/")) return target.slice(1);
  // Get directory of current file
  const dir = currentFile.includes("/") ? currentFile.split("/").slice(0, -1) : [];
  // Walk target parts, resolving ..
  for (const part of target.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  return dir.join("/");
}

marked.setOptions({ gfm: true, breaks: true });

// ── Types ──────────────────────────────────────────────────────────────────────

interface DocTreeItem {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: DocTreeItem[];
}

// ── Sidebar tree node ──────────────────────────────────────────────────────────

function TreeNode({
  item,
  selectedFile,
  onSelect,
  depth = 0,
}: {
  item: DocTreeItem;
  selectedFile: string;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(
    depth === 0 || (item.children?.some((c) => selectedFile.startsWith(c.path)) ?? false),
  );

  // Auto-expand if a child is selected
  useEffect(() => {
    if (item.type === "dir" && item.children?.some((c) => selectedFile.startsWith(c.path))) {
      setOpen(true);
    }
  }, [selectedFile, item]);

  const LABELS: Record<string, string> = {
    admin: "Admin Guide",
    api: "API Reference",
    features: "Features",
    security: "Security",
  };

  if (item.type === "dir") {
    const label = LABELS[item.name] ?? item.name.replace(/-/g, " ");
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-text-muted hover:bg-muted rounded-md transition-colors text-left"
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span className="capitalize">{label}</span>
        </button>
        {open && (
          <div>
            {item.children?.map((child) => (
              <TreeNode
                key={child.path}
                item={child}
                selectedFile={selectedFile}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = selectedFile === item.path;
  const label = item.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <button
      onClick={() => onSelect(item.path)}
      className={`w-full flex items-center gap-1.5 py-1.5 text-sm rounded-md transition-colors text-left ${
        isActive
          ? "bg-accent-light text-accent font-medium"
          : "text-text-secondary hover:bg-muted hover:text-text-primary"
      }`}
      style={{ paddingLeft: `${16 + depth * 12}px`, paddingRight: "12px" }}
    >
      <FileText className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
      {label}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileParam = searchParams.get("file");

  const [tree, setTree] = useState<DocTreeItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>(fileParam ?? "README");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Ordered flat list: README first, then top-level files, then directory files
  const flatPages = ["README", ...flattenTree(tree.filter((i) => i.name !== "README"))];

  // Load tree on mount
  useEffect(() => {
    fetch("/api/documentation")
      .then((r) => r.json())
      .then((data) => setTree(data.tree ?? []))
      .catch(() => {});
  }, []);

  const loadFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
    setLoading(true);
    setError(null);
    // Scroll content back to top
    if (mainRef.current) mainRef.current.scrollTop = 0;
    router.replace(`/documentation?file=${encodeURIComponent(filePath)}`, { scroll: false });

    fetch(`/api/documentation/content?file=${encodeURIComponent(filePath)}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({ error: "Not found" }));
          throw new Error(data.error ?? "Not found");
        }
        return r.json();
      })
      .then((data) => {
        const raw = marked.parse(data.content, { async: false }) as string;
        setHtmlContent(DOMPurify.sanitize(raw));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  // Load on mount / when file param changes
  useEffect(() => {
    loadFile(fileParam ?? "README");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Intercept clicks on relative .md links inside rendered markdown */
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Let external links / anchors through
      if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      e.preventDefault();
      loadFile(resolveDocPath(selectedFile, href));
    },
    [selectedFile, loadFile],
  );

  // Human-readable title from path
  const pageTitle = selectedFile
    .split("/")
    .at(-1)
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Documentation";

  const isOnIndex = selectedFile === "README";
  const currentIdx = flatPages.indexOf(selectedFile);
  const prevPage = currentIdx > 0 ? flatPages[currentIdx - 1] : null;
  const nextPage = currentIdx >= 0 && currentIdx < flatPages.length - 1 ? flatPages[currentIdx + 1] : null;

  function pageLabel(p: string) {
    return p.split("/").at(-1)?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? p;
  }

  return (
    <div className="flex h-screen bg-surface-alt overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <button
            onClick={() => router.back()}
            className="p-1 rounded hover:bg-muted text-text-muted transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
            <BookOpen className="w-4 h-4 text-accent" />
            Documentation
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {/* README (index) */}
          <button
            onClick={() => loadFile("README")}
            className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors text-left ${
              selectedFile === "README"
                ? "bg-accent-light text-accent font-medium"
                : "text-text-secondary hover:bg-muted hover:text-text-primary"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
            Overview
          </button>

          {/* Top-level files */}
          {tree
            .filter((item) => item.type === "file" && item.name !== "README")
            .map((item) => (
              <TreeNode
                key={item.path}
                item={item}
                selectedFile={selectedFile}
                onSelect={loadFile}
              />
            ))}

          {/* Directories */}
          {tree
            .filter((item) => item.type === "dir")
            .map((item) => (
              <TreeNode
                key={item.path}
                item={item}
                selectedFile={selectedFile}
                onSelect={loadFile}
              />
            ))}
        </nav>
      </aside>

      {/* Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10 pb-20">
          {loading && (
            <div className="flex items-center justify-center py-20 text-text-muted text-sm">
              Loading…
            </div>
          )}
          {error && !loading && (
            <div className="py-20 text-center text-text-muted text-sm">{error}</div>
          )}
          {!loading && !error && (
            <>
              {/* Top nav bar */}
              {!isOnIndex && (
                <div className="mb-5">
                  <button
                    onClick={() => loadFile("README")}
                    className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" />
                    Overview
                  </button>
                </div>
              )}

              <h1 className="text-2xl font-bold text-text-primary mb-6 pb-4 border-b border-border">
                {pageTitle}
              </h1>
              <div
                className="docs-content"
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />

              {/* Bottom navigation */}
              <div className="mt-12 pt-6 border-t border-border">
                {/* Return to overview row */}
                {!isOnIndex && (
                  <div className="mb-4 text-center">
                    <button
                      onClick={() => loadFile("README")}
                      className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                      <Home className="w-3.5 h-3.5" />
                      Back to Overview
                    </button>
                  </div>
                )}
                {/* Prev / Next row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    {prevPage && (
                      <button
                        onClick={() => loadFile(prevPage)}
                        className="group flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent-light transition-colors w-full text-left"
                      >
                        <ChevronLeft className="w-4 h-4 text-text-muted group-hover:text-accent flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] text-text-muted uppercase tracking-wider">Previous</div>
                          <div className="text-sm font-medium text-text-primary truncate">{pageLabel(prevPage)}</div>
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    {nextPage && (
                      <button
                        onClick={() => loadFile(nextPage)}
                        className="group flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent-light transition-colors w-full text-right justify-end"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] text-text-muted uppercase tracking-wider text-right">Next</div>
                          <div className="text-sm font-medium text-text-primary truncate">{pageLabel(nextPage)}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent flex-shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
