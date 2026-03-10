"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Plus, ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, LayoutDashboard } from "lucide-react";
import DashboardIcon from "./DashboardIcon";
import DashboardCard from "./DashboardCard";
import DashboardSectionModal from "./DashboardSectionModal";
import DashboardLinkModal from "./DashboardLinkModal";
import type { DashboardData, DashboardSection, DashboardLink, UserGroup } from "@/lib/types";

interface DashboardViewProps {
  isAdmin: boolean;
}

export default function DashboardView({ isAdmin }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData>({ sections: [], links: [] });
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Modal state
  const [sectionModal, setSectionModal] = useState<{ open: boolean; section?: DashboardSection | null }>({ open: false });
  const [linkModal, setLinkModal] = useState<{ open: boolean; link?: DashboardLink | null; defaultSectionId?: string }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "section" | "link"; id: string } | null>(null);

  // Drag state
  const dragItem = useRef<{ type: "section" | "link"; id: string } | null>(null);
  const dragOverItem = useRef<{ type: "section" | "link"; id: string } | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [dashRes, groupsRes] = await Promise.all([
        fetch("/api/dashboard"),
        isAdmin ? fetch("/api/admin/user-groups") : Promise.resolve(null),
      ]);
      if (dashRes.ok) {
        const d: DashboardData = await dashRes.json();
        setData(d);
        // Restore collapsed state from sections
        const c: Record<string, boolean> = {};
        d.sections.forEach((s) => { c[s.id] = s.collapsed; });
        setCollapsed(c);
      }
      if (groupsRes?.ok) {
        const g = await groupsRes.json();
        setUserGroups(g.groups || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Helpers ───────────────────────────────────────────────────────
  const sortedSections = [...data.sections].sort((a, b) => a.order - b.order);

  const linksForSection = (sectionId: string) =>
    data.links
      .filter((l) => l.sectionId === sectionId)
      .sort((a, b) => a.order - b.order);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Section CRUD ──────────────────────────────────────────────────
  const handleSaveSection = async (fields: { name: string; icon: string; color: string }) => {
    const editing = sectionModal.section;
    if (editing) {
      await fetch("/api/dashboard/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...fields }),
      });
    } else {
      await fetch("/api/dashboard/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
    }
    fetchData();
  };

  const handleDeleteSection = async (id: string) => {
    await fetch("/api/dashboard/sections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteConfirm(null);
    fetchData();
  };

  // ── Link CRUD ─────────────────────────────────────────────────────
  const handleSaveLink = async (fields: {
    title: string; url: string; description: string; icon: string;
    color: string; openInNewTab: boolean; sectionId: string; visibleToGroups: string[];
  }) => {
    const editing = linkModal.link;
    if (editing) {
      await fetch("/api/dashboard/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...fields }),
      });
    } else {
      await fetch("/api/dashboard/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
    }
    fetchData();
  };

  const handleDeleteLink = async (id: string) => {
    await fetch("/api/dashboard/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteConfirm(null);
    fetchData();
  };

  // ── Drag & drop (sections) ────────────────────────────────────────
  const handleSectionDragStart = (id: string) => {
    dragItem.current = { type: "section", id };
  };

  const handleSectionDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverItem.current = { type: "section", id };
  };

  const handleSectionDrop = async () => {
    if (!dragItem.current || !dragOverItem.current) return;
    if (dragItem.current.type !== "section" || dragOverItem.current.type !== "section") return;
    if (dragItem.current.id === dragOverItem.current.id) return;

    const items = [...sortedSections];
    const fromIdx = items.findIndex((s) => s.id === dragItem.current!.id);
    const toIdx = items.findIndex((s) => s.id === dragOverItem.current!.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    const reordered = items.map((s, i) => ({ ...s, order: i }));

    const newData = { ...data, sections: reordered };
    setData(newData);
    dragItem.current = null;
    dragOverItem.current = null;

    // Persist full dashboard for reorder
    await fetch("/api/dashboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newData),
    });
  };

  // ── Drag & drop (links within a section) ──────────────────────────
  const handleLinkDragStart = (id: string) => {
    dragItem.current = { type: "link", id };
  };

  const handleLinkDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverItem.current = { type: "link", id };
  };

  const handleLinkDrop = async (sectionId: string) => {
    if (!dragItem.current || !dragOverItem.current) return;
    if (dragItem.current.type !== "link" || dragOverItem.current.type !== "link") return;
    if (dragItem.current.id === dragOverItem.current.id) return;

    const sectionLinks = linksForSection(sectionId);
    const fromIdx = sectionLinks.findIndex((l) => l.id === dragItem.current!.id);
    const toIdx = sectionLinks.findIndex((l) => l.id === dragOverItem.current!.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = sectionLinks.splice(fromIdx, 1);
    sectionLinks.splice(toIdx, 0, moved);
    const reorderedLinks = sectionLinks.map((l, i) => ({ ...l, order: i }));

    const otherLinks = data.links.filter((l) => l.sectionId !== sectionId);
    const newData = { ...data, links: [...otherLinks, ...reorderedLinks] };
    setData(newData);
    dragItem.current = null;
    dragOverItem.current = null;

    await fetch("/api/dashboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newData),
    });
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) return null;
  if (data.sections.length === 0 && !isAdmin) return null;

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Dashboard
          </h2>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSectionModal({ open: true, section: null })}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Section
            </button>
            {data.sections.length > 0 && (
              <button
                onClick={() => setLinkModal({ open: true, link: null })}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Link
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty state for admins */}
      {data.sections.length === 0 && isAdmin && (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <LayoutDashboard className="w-8 h-8 mx-auto mb-2 text-text-muted opacity-40" />
          <p className="text-sm text-text-muted mb-2">No dashboard sections yet.</p>
          <button
            onClick={() => setSectionModal({ open: true, section: null })}
            className="text-sm text-accent hover:underline"
          >
            Create your first section
          </button>
        </div>
      )}

      {/* Sections */}
      {sortedSections.map((section) => {
        const links = linksForSection(section.id);
        const isCollapsed = collapsed[section.id];

        return (
          <div
            key={section.id}
            className="mb-4"
            draggable={isAdmin}
            onDragStart={() => handleSectionDragStart(section.id)}
            onDragOver={(e) => handleSectionDragOver(e, section.id)}
            onDrop={handleSectionDrop}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2 group">
              {isAdmin && (
                <GripVertical className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-60 cursor-grab flex-shrink-0" />
              )}
              <button
                onClick={() => toggleCollapse(section.id)}
                className="flex items-center gap-1.5 flex-1 min-w-0"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                )}
                {section.icon && <DashboardIcon icon={section.icon} size={16} />}
                <span
                  className="text-sm font-semibold text-text-primary truncate"
                  style={section.color ? { color: section.color } : undefined}
                >
                  {section.name}
                </span>
                <span className="text-xs text-text-muted ml-1">({links.length})</span>
              </button>
              {isAdmin && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setLinkModal({ open: true, link: null, defaultSectionId: section.id })}
                    className="p-1 rounded hover:bg-muted text-text-muted hover:text-accent"
                    title="Add link to section"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSectionModal({ open: true, section })}
                    className="p-1 rounded hover:bg-muted text-text-muted hover:text-text-secondary"
                    title="Edit section"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: "section", id: section.id })}
                    className="p-1 rounded hover:bg-red-100 text-text-muted hover:text-red-600"
                    title="Delete section"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Cards grid */}
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-5">
                {links.length === 0 && isAdmin ? (
                  <button
                    onClick={() => setLinkModal({ open: true, link: null, defaultSectionId: section.id })}
                    className="flex items-center justify-center gap-1 border border-dashed border-border rounded-lg py-4 text-xs text-text-muted hover:text-accent hover:border-accent transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add link
                  </button>
                ) : (
                  links.map((link) => (
                    <DashboardCard
                      key={link.id}
                      link={link}
                      isAdmin={isAdmin}
                      onEdit={() => setLinkModal({ open: true, link })}
                      onDelete={() => setDeleteConfirm({ type: "link", id: link.id })}
                      draggable={isAdmin}
                      onDragStart={(e) => { e.stopPropagation(); handleLinkDragStart(link.id); }}
                      onDragOver={(e) => { e.stopPropagation(); handleLinkDragOver(e, link.id); }}
                      onDrop={(e) => { e.stopPropagation(); handleLinkDrop(section.id); }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modals */}
      <DashboardSectionModal
        isOpen={sectionModal.open}
        section={sectionModal.section}
        onClose={() => setSectionModal({ open: false })}
        onSave={handleSaveSection}
      />
      <DashboardLinkModal
        isOpen={linkModal.open}
        link={linkModal.link}
        sections={data.sections}
        userGroups={userGroups}
        defaultSectionId={linkModal.defaultSectionId}
        onClose={() => setLinkModal({ open: false })}
        onSave={handleSaveLink}
      />

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                Delete {deleteConfirm.type === "section" ? "Section" : "Link"}
              </h2>
            </div>
            <div className="modal-body">
              <p className="text-sm text-text-secondary mb-4">
                {deleteConfirm.type === "section"
                  ? "This will also delete all links in this section. This cannot be undone."
                  : "Are you sure you want to delete this link?"}
              </p>
              <div className="modal-actions">
                <button onClick={() => setDeleteConfirm(null)} className="modal-btn-cancel">
                  Cancel
                </button>
                <button
                  onClick={() =>
                    deleteConfirm.type === "section"
                      ? handleDeleteSection(deleteConfirm.id)
                      : handleDeleteLink(deleteConfirm.id)
                  }
                  className="modal-btn-primary"
                  style={{ backgroundColor: "var(--color-red-600, #dc2626)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
