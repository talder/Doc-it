"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Monitor, Settings, ChevronRight, ChevronDown, ChevronUp, FolderOpen, Upload } from "lucide-react";
import AssetModal from "@/components/AssetModal";
import AssetDetailModal from "@/components/AssetDetailModal";
import AssetContainerModal from "@/components/AssetContainerModal";
import AssetFieldDefsModal from "@/components/AssetFieldDefsModal";
import AssetCsvImportModal from "@/components/AssetCsvImportModal";
import type { Asset, AssetContainer, CustomFieldDef } from "@/lib/assets";

type SortKey = "id" | "name" | "type" | "status" | "location" | "owner";
type SortDir = "asc" | "desc";

export default function AssetsPage() {
  const router = useRouter();

  const [containers, setContainers] = useState<AssetContainer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Search
  const [searchQ, setSearchQ] = useState("");

  // Modals
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [editContainer, setEditContainer] = useState<AssetContainer | null>(null);
  const [showFieldDefs, setShowFieldDefs] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets");
      if (res.ok) {
        const data = await res.json();
        setContainers(data.containers || []);
        setAssets(data.assets || []);
        setFieldDefs(data.customFieldDefs || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // API helper
  const post = async (body: Record<string, unknown>) => {
    await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await fetchData();
  };

  // Filtered & sorted assets
  const filtered = useMemo(() => {
    let list = assets;
    if (selectedContainer) {
      // Include assets in selected container and all descendant containers
      const ids = new Set<string>();
      const collect = (pid: string) => {
        ids.add(pid);
        containers.filter((c) => c.parentId === pid).forEach((c) => collect(c.id));
      };
      collect(selectedContainer);
      list = list.filter((a) => ids.has(a.containerId));
    }
    if (searchQ.trim().length >= 2) {
      const q = searchQ.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) || a.ipAddresses.some((ip) => ip.includes(q)) ||
        a.location.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q),
      );
    }
    return list;
  }, [assets, selectedContainer, containers, searchQ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = a[sortKey] || "";
      const vb = b[sortKey] || "";
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  // Tree helpers
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const rootContainers = containers.filter((c) => c.parentId === null).sort((a, b) => a.order - b.order);

  const TreeNode = ({ container, depth }: { container: AssetContainer; depth: number }) => {
    const children = containers.filter((c) => c.parentId === container.id).sort((a, b) => a.order - b.order);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(container.id);
    const isSelected = selectedContainer === container.id;
    const assetCount = assets.filter((a) => a.containerId === container.id).length;

    return (
      <>
        <div
          className={`am-tree-node${isSelected ? " am-tree-node--active" : ""}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => setSelectedContainer(isSelected ? null : container.id)}
          onContextMenu={(e) => { e.preventDefault(); setEditContainer(container); setShowContainerModal(true); }}
        >
          <button className="am-tree-chevron" onClick={(e) => { e.stopPropagation(); toggleExpand(container.id); }}>
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5" />}
          </button>
          <FolderOpen className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="am-tree-label">{container.name}</span>
          {assetCount > 0 && <span className="am-tree-count">{assetCount}</span>}
        </div>
        {isExpanded && children.map((child) => <TreeNode key={child.id} container={child} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="jp-root">
      {/* Header */}
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Monitor className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Assets</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="jp-action-btn" onClick={() => setShowCsvImport(true)} data-tip="Import CSV">
            <Upload className="w-4 h-4" /> Import
          </button>
          <button className="jp-action-btn" onClick={() => setShowFieldDefs(true)} data-tip="Custom Fields">
            <Settings className="w-4 h-4" />
          </button>
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowNewAsset(true)}>
            <Plus className="w-4 h-4" /> New Asset
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="jp-main">
        {/* Sidebar: Tree */}
        <aside className="jp-sidebar">
          <div className="jp-section">
            <h3 className="jp-section-title">Groups</h3>
            <div
              className={`am-tree-node${selectedContainer === null ? " am-tree-node--active" : ""}`}
              style={{ paddingLeft: 8 }}
              onClick={() => setSelectedContainer(null)}
            >
              <span className="w-3.5" />
              <Monitor className="w-3.5 h-3.5 text-text-muted" />
              <span className="am-tree-label">All Assets</span>
              <span className="am-tree-count">{assets.length}</span>
            </div>
            {rootContainers.map((c) => <TreeNode key={c.id} container={c} depth={0} />)}
            <button className="am-tree-add" onClick={() => { setEditContainer(null); setShowContainerModal(true); }}>
              <Plus className="w-3.5 h-3.5" /> New Group
            </button>
          </div>

          <div className="jp-section">
            <h3 className="jp-section-title">Search</h3>
            <input className="cl-input" placeholder="Search assets…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          </div>
        </aside>

        {/* Table */}
        <main className="jp-content">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="jp-empty">
              <Monitor className="w-10 h-10 text-text-muted mb-3 opacity-40" />
              <p className="text-text-muted">{containers.length === 0 ? "Create a group first to start adding assets" : "No assets" + (searchQ || selectedContainer ? " matching filters" : " yet")}</p>
              {containers.length > 0 && (
                <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowNewAsset(true)}>
                  <Plus className="w-4 h-4" /> New Asset
                </button>
              )}
              {containers.length === 0 && (
                <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => { setEditContainer(null); setShowContainerModal(true); }}>
                  <Plus className="w-4 h-4" /> New Group
                </button>
              )}
            </div>
          ) : (
            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("id")} className="cl-th cl-th--sort">ID <SortIcon col="id" /></th>
                    <th onClick={() => toggleSort("name")} className="cl-th cl-th--sort">Name <SortIcon col="name" /></th>
                    <th onClick={() => toggleSort("type")} className="cl-th cl-th--sort">Type <SortIcon col="type" /></th>
                    <th className="cl-th">IP</th>
                    <th onClick={() => toggleSort("status")} className="cl-th cl-th--sort">Status <SortIcon col="status" /></th>
                    <th onClick={() => toggleSort("location")} className="cl-th cl-th--sort">Location <SortIcon col="location" /></th>
                    <th onClick={() => toggleSort("owner")} className="cl-th cl-th--sort">Owner <SortIcon col="owner" /></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a) => (
                    <tr key={a.id} className="cl-tr" onClick={() => setDetailAsset(a)}>
                      <td className="cl-td cl-td--id">{a.id}</td>
                      <td className="cl-td" style={{ fontWeight: 600 }}>{a.name}</td>
                      <td className="cl-td">{a.type}</td>
                      <td className="cl-td cl-td--system">{a.ipAddresses.join(", ")}</td>
                      <td className="cl-td"><span className={`cl-badge am-status--${a.status.toLowerCase()}`}>{a.status}</span></td>
                      <td className="cl-td">{a.location}</td>
                      <td className="cl-td">{a.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cl-table-count">{sorted.length} {sorted.length === 1 ? "asset" : "assets"}</div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <AssetModal
        isOpen={showNewAsset || !!editAsset}
        onClose={() => { setShowNewAsset(false); setEditAsset(null); }}
        containers={containers}
        customFieldDefs={fieldDefs}
        editAsset={editAsset}
        defaultContainerId={selectedContainer}
        onSave={async (data) => { await post(data); }}
      />
      <AssetDetailModal
        asset={detailAsset}
        containers={containers}
        customFieldDefs={fieldDefs}
        onClose={() => setDetailAsset(null)}
        onEdit={(a) => { setDetailAsset(null); setEditAsset(a); }}
        onDelete={async (id) => { await post({ action: "deleteAsset", id }); }}
      />
      <AssetContainerModal
        isOpen={showContainerModal}
        onClose={() => { setShowContainerModal(false); setEditContainer(null); }}
        containers={containers}
        editContainer={editContainer}
        onSave={async (name, parentId) => {
          if (editContainer) {
            await post({ action: "updateContainer", id: editContainer.id, name, parentId });
          } else {
            await post({ action: "createContainer", name, parentId });
          }
        }}
        onDelete={async (id) => {
          await post({ action: "deleteContainer", id });
          if (selectedContainer === id) setSelectedContainer(null);
        }}
      />
      <AssetFieldDefsModal
        isOpen={showFieldDefs}
        onClose={() => { setShowFieldDefs(false); fetchData(); }}
        fieldDefs={fieldDefs}
        onAdd={async (name, type, options) => { await post({ action: "createFieldDef", name, type, options }); await fetchData(); }}
        onUpdate={async (id, name, type, options) => { await post({ action: "updateFieldDef", id, name, type, options }); await fetchData(); }}
        onDelete={async (id) => { await post({ action: "deleteFieldDef", id }); await fetchData(); }}
      />
      <AssetCsvImportModal
        isOpen={showCsvImport}
        onClose={() => { setShowCsvImport(false); fetchData(); }}
        containers={containers}
        customFieldDefs={fieldDefs}
        onImport={async (rows) => {
          const res = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "bulkCreateAssets", rows }),
          });
          const data = await res.json();
          await fetchData();
          return data;
        }}
      />
    </div>
  );
}
