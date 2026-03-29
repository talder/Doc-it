"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Monitor, ChevronRight, ChevronDown, ChevronUp, FolderOpen, Home, List, Briefcase, KeyRound, Search, Bookmark, Settings, Wrench, Network, Download, Upload, Radar, AlertTriangle, Layers, MapPin, GitBranch, Copy, CheckSquare, X, Trash2, Cpu, RotateCcw } from "lucide-react";
import CmdbItemModal from "@/components/CmdbItemModal";
import CmdbItemDetailModal from "@/components/CmdbItemDetailModal";
import CmdbContainerModal from "@/components/CmdbContainerModal";
import CmdbFieldDefsModal from "@/components/CmdbFieldDefsModal";
import CmdbCsvImportModal from "@/components/CmdbCsvImportModal";
import CmdbItemTypeModal from "@/components/CmdbItemTypeModal";
import CmdbRelationshipModal from "@/components/CmdbRelationshipModal";
import CmdbDiagram from "@/components/CmdbDiagram";
import CmdbDashboard from "@/components/CmdbDashboard";
import LicenseModal from "@/components/LicenseModal";
import LicenseListPanel from "@/components/LicenseListPanel";
import LifecycleEditorModal from "@/components/LifecycleEditorModal";
import LocationTreeModal from "@/components/LocationTreeModal";
import BusinessServiceModal from "@/components/BusinessServiceModal";
import BusinessServiceListPanel from "@/components/BusinessServiceListPanel";
import ImpactAnalysisModal from "@/components/ImpactAnalysisModal";
import type { CmdbItem, CmdbContainer, CmdbItemType, CmdbRelationship, RelationshipTypeDef, CustomFieldDef, SoftwareLicenseView, LicenseComplianceEntry, LicenseComplianceSummary, LifecycleWorkflow, Location as CmdbLocation, BusinessService, SavedView, CmdbTemplate, MaintenanceWindow, CmdbItemStatus, ScanConfig, ScanResult, VulnerabilityEntry, ChangeRequest, ComplianceCheckDef, ServiceSla, ExpiryAlert, DuplicateGroup, CmdbReportSettings } from "@/lib/cmdb";

type SortKey = "id" | "name" | "type" | "status" | "location" | "owner";
type SortDir = "asc" | "desc";
type ActiveView = "dashboard" | "allCIs" | "group" | "services" | "licenses" | "recycleBin" | "agent";
const EMPTY_LICENSE_SUMMARY: LicenseComplianceSummary = { compliant: 0, expired: 0, overLicensed: 0, underLicensed: 0, total: 0 };

export default function CmdbPage() {
  const router = useRouter();

  // ── Data state ──
  const [containers, setContainers] = useState<CmdbContainer[]>([]);
  const [assets, setAssets] = useState<CmdbItem[]>([]);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [assetTypes, setAssetTypes] = useState<CmdbItemType[]>([]);
  const [lifecycleWorkflows, setLifecycleWorkflows] = useState<LifecycleWorkflow[]>([]);
  const [locations, setLocations] = useState<CmdbLocation[]>([]);
  const [relationships, setRelationships] = useState<CmdbRelationship[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeDef[]>([]);
  const [licenses, setLicenses] = useState<SoftwareLicenseView[]>([]);
  const [businessServices, setBusinessServices] = useState<BusinessService[]>([]);
  const [licenseCompliance, setLicenseCompliance] = useState<LicenseComplianceEntry[]>([]);
  const [licenseComplianceSummary, setLicenseComplianceSummary] = useState<LicenseComplianceSummary>(EMPTY_LICENSE_SUMMARY);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [templates, setTemplates] = useState<CmdbTemplate[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [activeMaintenanceAssetIds, setActiveMaintenanceAssetIds] = useState<string[]>([]);
  const [agentStats, setAgentStats] = useState<{ total: number; withAgent: number; stale: number; coverage: number }>({ total: 0, withAgent: 0, stale: 0, coverage: 0 });
  const [scanConfigs, setScanConfigs] = useState<ScanConfig[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [complianceCheckDefs, setComplianceCheckDefs] = useState<ComplianceCheckDef[]>([]);
  const [complianceSummary, setComplianceSummary] = useState<{ avgScore: number; fullCompliance: number; nonCompliant: number }>({ avgScore: 0, fullCompliance: 0, nonCompliant: 0 });
  const [vulnerabilities, setVulnerabilities] = useState<VulnerabilityEntry[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [costSummary, setCostSummary] = useState<{ totalPurchase: number; totalMonthly: number; totalAnnual: number; currency: string }>({ totalPurchase: 0, totalMonthly: 0, totalAnnual: 0, currency: "EUR" });
  const [dataQuality, setDataQuality] = useState<{ avgScore: number; perfect: number; poor: number }>({ avgScore: 0, perfect: 0, poor: 0 });
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlert[]>([]);
  const [recycleBin, setRecycleBin] = useState<CmdbItem[]>([]);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Navigation ──
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showViews, setShowViews] = useState(false);

  // ── Sort / filter ──
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQ, setSearchQ] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // ── Bulk ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  // ── Modals ──
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [editAsset, setEditAsset] = useState<CmdbItem | null>(null);
  const [detailAsset, setDetailAsset] = useState<CmdbItem | null>(null);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [editContainer, setEditContainer] = useState<CmdbContainer | null>(null);
  const [showFieldDefs, setShowFieldDefs] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showRelModal, setShowRelModal] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [diagramFocusId, setDiagramFocusId] = useState<string | undefined>(undefined);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [editLicense, setEditLicense] = useState<SoftwareLicenseView | null>(null);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editService, setEditService] = useState<BusinessService | null>(null);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactAssetId, setImpactAssetId] = useState<string | undefined>(undefined);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [scanPolling, setScanPolling] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // ── Toast ──
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cmdb");
      if (res.ok) {
        const d = await res.json();
        setContainers(d.containers || []); setAssets(d.assets || []); setFieldDefs(d.customFieldDefs || []);
        setAssetTypes(d.assetTypes || []); setLifecycleWorkflows(d.lifecycleWorkflows || []);
        setLocations(d.locations || []); setRelationships(d.relationships || []);
        setRelationshipTypes(d.relationshipTypes || []); setLicenses(d.licenses || []);
        setBusinessServices(d.businessServices || []); setLicenseCompliance(d.licenseCompliance || []);
        setLicenseComplianceSummary(d.licenseComplianceSummary || EMPTY_LICENSE_SUMMARY);
        setAllTags(d.allTags || []); setSavedViews(d.savedViews || []); setTemplates(d.templates || []);
        setMaintenanceWindows(d.maintenanceWindows || []);
        setActiveMaintenanceAssetIds(d.activeMaintenanceAssetIds || []);
        setAgentStats(d.agentStats || { total: 0, withAgent: 0, stale: 0, coverage: 0 });
        setScanConfigs(d.scanConfigs || []); setScanResults(d.scanResults || []);
        setComplianceCheckDefs(d.complianceCheckDefs || []);
        setComplianceSummary(d.complianceSummary || { avgScore: 0, fullCompliance: 0, nonCompliant: 0 });
        setVulnerabilities(d.vulnerabilities || []); setChangeRequests(d.changeRequests || []);
        setCostSummary(d.costSummary || { totalPurchase: 0, totalMonthly: 0, totalAnnual: 0, currency: "EUR" });
        setDataQuality(d.dataQuality || { avgScore: 0, perfect: 0, poor: 0 });
        setDuplicates(d.duplicates || []); setExpiryAlerts(d.expiryAlerts || []);
        setRecycleBin(d.recycleBin || []);
      }
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const post = async (body: Record<string, unknown>) => {
    await fetch("/api/cmdb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await fetchData();
  };

  // ── Filtering & sorting ──
  const showCIList = activeView === "allCIs" || activeView === "group";

  const filtered = useMemo(() => {
    let list = assets;
    if (selectedContainer) {
      const ids = new Set<string>();
      const collect = (pid: string) => { ids.add(pid); containers.filter((c) => c.parentId === pid).forEach((c) => collect(c.id)); };
      collect(selectedContainer);
      list = list.filter((a) => ids.has(a.containerId));
    }
    if (searchQ.trim().length >= 2) {
      const q = searchQ.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) || a.ipAddresses.some((ip) => ip.includes(q)) ||
        a.location.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.includes(q)),
      );
    }
    if (filterTags.length > 0) list = list.filter((a) => filterTags.every((t) => (a.tags || []).includes(t)));
    if (filterTypeId) list = list.filter((a) => a.typeId === filterTypeId);
    if (filterStatus) list = list.filter((a) => a.status === filterStatus);
    return list;
  }, [assets, selectedContainer, containers, searchQ, filterTags, filterTypeId, filterStatus]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => { const va = a[sortKey] || ""; const vb = b[sortKey] || ""; const cmp = String(va).localeCompare(String(vb)); return sortDir === "asc" ? cmp : -cmp; });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } };
  const SortIcon = ({ col }: { col: SortKey }) => { if (sortKey !== col) return null; return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />; };
  const toggleExpand = (id: string) => { setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const rootContainers = containers.filter((c) => c.parentId === null).sort((a, b) => a.order - b.order);

  const handleExportCsv = () => {
    const headers = ["ID","Name","Type","Status","Tags","IP","OS","Location","Owner","Purchase Date","Warranty Expiry","Assigned To"];
    const rows = sorted.map((a) => { const t = assetTypes.find((t) => t.id === a.typeId); return [a.id, a.name, t?.name || a.type, a.status, (a.tags || []).join(";"), a.ipAddresses.join(";"), a.os, a.location, a.owner, a.purchaseDate, a.warrantyExpiry, a.assignedTo || ""].map((v) => `"${String(v).replace(/"/g, '""')}"`); });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "cmdb-export.csv"; a.click(); URL.revokeObjectURL(url);
  };

  // ── Tree node ──
  const TreeNode = ({ container, depth }: { container: CmdbContainer; depth: number }) => {
    const children = containers.filter((c) => c.parentId === container.id).sort((a, b) => a.order - b.order);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(container.id);
    const isSelected = activeView === "group" && selectedContainer === container.id;
    const assetCount = assets.filter((a) => a.containerId === container.id).length;
    return (
      <>
        <div className={`am-tree-node${isSelected ? " am-tree-node--active" : ""}`} style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => { setSelectedContainer(container.id); setActiveView("group"); }}
          onContextMenu={(e) => { e.preventDefault(); setEditContainer(container); setShowContainerModal(true); }}>
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

  // ── Nav item ──
  const NavItem = ({ icon, label, active, count, onClick }: { icon: React.ReactNode; label: string; active: boolean; count?: number; onClick: () => void }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary hover:bg-muted"}`}>
      {icon}<span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-text-muted">{count}</span>}
    </button>
  );

  return (
    <div className="jp-root">
      {/* ── Top bar ── */}
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Monitor className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">CMDB</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Tools dropdown */}
          <div className="relative">
            <button className="jp-action-btn" onClick={() => { setShowToolsMenu(!showToolsMenu); setShowSettingsMenu(false); }}><Wrench className="w-4 h-4" /> Tools <ChevronDown className="w-3 h-3" /></button>
            {showToolsMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-[180px] py-1">
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setDiagramFocusId(undefined); setShowDiagram(true); setShowToolsMenu(false); }}><Network className="w-3.5 h-3.5" /> Diagram</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { handleExportCsv(); setShowToolsMenu(false); }}><Download className="w-3.5 h-3.5" /> Export CSV</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowCsvImport(true); setShowToolsMenu(false); }}><Upload className="w-3.5 h-3.5" /> Import CSV</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowScanPanel(true); setShowToolsMenu(false); }}><Radar className="w-3.5 h-3.5" /> Network Scan</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setImpactAssetId(undefined); setShowImpactModal(true); setShowToolsMenu(false); }}><AlertTriangle className="w-3.5 h-3.5" /> Impact Analysis</button>
              </div>
            )}
          </div>
          {/* Settings dropdown */}
          <div className="relative">
            <button className="jp-action-btn" onClick={() => { setShowSettingsMenu(!showSettingsMenu); setShowToolsMenu(false); }}><Settings className="w-4 h-4" /> <ChevronDown className="w-3 h-3" /></button>
            {showSettingsMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-[180px] py-1">
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowTypeModal(true); setShowSettingsMenu(false); }}><Layers className="w-3.5 h-3.5" /> CI Types</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowFieldDefs(true); setShowSettingsMenu(false); }}><Settings className="w-3.5 h-3.5" /> Custom Fields</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowLocationModal(true); setShowSettingsMenu(false); }}><MapPin className="w-3.5 h-3.5" /> Locations</button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted flex items-center gap-2" onClick={() => { setShowWorkflowModal(true); setShowSettingsMenu(false); }}><GitBranch className="w-3.5 h-3.5" /> Lifecycle</button>
              </div>
            )}
          </div>
          {/* New CI */}
          <div className="relative group">
            <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowNewAsset(true)}><Plus className="w-4 h-4" /> New CI</button>
            {templates.length > 0 && (
              <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-[180px] py-1">
                <button className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted" onClick={() => setShowNewAsset(true)}>Blank CI</button>
                <div className="border-t border-border my-1" />
                {templates.map((tpl) => (
                  <button key={tpl.id} className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-muted" onClick={() => {
                    setEditAsset({ id: "", name: "", containerId: tpl.containerId || containers[0]?.id || "", status: "Active" as CmdbItemStatus, type: "", typeId: tpl.typeId, ipAddresses: [], os: tpl.fields.os || "", location: tpl.fields.location || "", locationId: tpl.fields.locationId, owner: tpl.fields.owner || "", purchaseDate: "", warrantyExpiry: "", notes: tpl.fields.notes || "", customFields: tpl.fields.customFields || {}, tags: tpl.tags || [], history: [], createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" } as CmdbItem);
                    setShowNewAsset(true);
                  }}><Copy className="w-3 h-3 inline mr-1 opacity-50" />{tpl.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {(showToolsMenu || showSettingsMenu) && <div className="fixed inset-0 z-40" onClick={() => { setShowToolsMenu(false); setShowSettingsMenu(false); }} />}

      {/* ── Main layout ── */}
      <div className="jp-main">
        {/* ── Sidebar ── */}
        <aside className="jp-sidebar">
          <div className="space-y-1 mb-3">
            <NavItem icon={<Home className="w-4 h-4" />} label="Dashboard" active={activeView === "dashboard"} onClick={() => { setActiveView("dashboard"); setSelectedContainer(null); }} />
            <NavItem icon={<List className="w-4 h-4" />} label="All CIs" active={activeView === "allCIs"} count={assets.length} onClick={() => { setActiveView("allCIs"); setSelectedContainer(null); }} />
          </div>
          <div className="jp-section">
            <h3 className="jp-section-title">Groups</h3>
            {rootContainers.map((c) => <TreeNode key={c.id} container={c} depth={0} />)}
            <button className="am-tree-add" onClick={() => { setEditContainer(null); setShowContainerModal(true); }}><Plus className="w-3.5 h-3.5" /> New Group</button>
          </div>
          <div className="border-t border-border my-2" />
          <div className="space-y-1 mb-3">
            <NavItem icon={<Briefcase className="w-4 h-4" />} label="Services" active={activeView === "services"} count={businessServices.length} onClick={() => setActiveView("services")} />
            <NavItem icon={<KeyRound className="w-4 h-4" />} label="Licenses" active={activeView === "licenses"} count={licenses.length} onClick={() => setActiveView("licenses")} />
            <NavItem icon={<Cpu className="w-4 h-4" />} label="Agent" active={activeView === "agent"} onClick={() => setActiveView("agent")} />
            <NavItem icon={<Trash2 className="w-4 h-4" />} label="Recycle Bin" active={activeView === "recycleBin"} count={recycleBin.length} onClick={() => setActiveView("recycleBin")} />
          </div>
          <div className="border-t border-border my-2" />
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-text-muted uppercase" onClick={() => setShowFilters(!showFilters)}>
            <Search className="w-3 h-3" /> Filters {showFilters ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
          </button>
          {showFilters && (
            <div className="px-2 pb-2 space-y-1.5">
              <input className="cl-input" placeholder="Search…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} style={{ fontSize: "0.75rem" }} />
              <select className="cl-input" value={filterTypeId} onChange={(e) => setFilterTypeId(e.target.value)} style={{ fontSize: "0.75rem" }}><option value="">All Types</option>{assetTypes.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}</select>
              <select className="cl-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ fontSize: "0.75rem" }}><option value="">All Statuses</option>{["Active","Maintenance","Decommissioned","Ordered"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
              {allTags.length > 0 && <div className="flex flex-wrap gap-1">{allTags.map((tag) => <button key={tag} className={`text-[10px] px-2 py-0.5 rounded-full border ${filterTags.includes(tag) ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:border-accent"}`} onClick={() => setFilterTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag])}>{tag}</button>)}</div>}
              {(filterTypeId || filterStatus || filterTags.length > 0 || searchQ) && <button className="text-[10px] text-accent" onClick={() => { setFilterTypeId(""); setFilterStatus(""); setFilterTags([]); setSearchQ(""); }}>Clear all</button>}
            </div>
          )}
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-text-muted uppercase" onClick={() => setShowViews(!showViews)}>
            <Bookmark className="w-3 h-3" /> Views {showViews ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
          </button>
          {showViews && (
            <div className="px-2 pb-2 space-y-0.5">
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent cursor-pointer py-0.5">
                  <button className="flex-1 text-left truncate" onClick={() => { setActiveView("allCIs"); if (v.filters.containerId) { setSelectedContainer(v.filters.containerId); setActiveView("group"); } if (v.filters.search) setSearchQ(v.filters.search); if (v.filters.tags) setFilterTags(v.filters.tags); if (v.filters.typeId) setFilterTypeId(v.filters.typeId); if (v.filters.status) setFilterStatus(v.filters.status); }}>{v.name}</button>
                  <button className="text-text-muted hover:text-red-500 text-[10px]" onClick={() => post({ action: "deleteView", id: v.id })}>×</button>
                </div>
              ))}
              {(filterTypeId || filterStatus || filterTags.length > 0 || searchQ || selectedContainer) && (
                <button className="am-tree-add mt-1" onClick={() => { const name = prompt("View name:"); if (name) post({ action: "createView", name, filters: { containerId: selectedContainer || undefined, search: searchQ || undefined, tags: filterTags.length > 0 ? filterTags : undefined, typeId: filterTypeId || undefined, status: filterStatus || undefined } }); }}><Plus className="w-3 h-3" /> Save view</button>
              )}
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main className="jp-content">
          {activeView === "dashboard" && (
            <>
              <CmdbDashboard assets={assets} assetTypes={assetTypes} licenseComplianceSummary={licenseComplianceSummary} agentStats={agentStats} complianceSummary={complianceSummary} costSummary={costSummary} dataQuality={dataQuality} vulnerabilityCount={{ open: vulnerabilities.filter((v) => v.status === "open" || v.status === "mitigated").length, critical: vulnerabilities.filter((v) => v.severity === "critical" && v.status === "open").length }} expiryAlerts={expiryAlerts} duplicateCount={duplicates.length} />
              {vulnerabilities.length > 0 && <div className="mb-4 border border-border rounded-lg p-3 bg-surface"><h3 className="text-xs font-semibold text-text-muted uppercase mb-2">🛡️ Vulnerabilities ({vulnerabilities.filter((v) => v.status === "open").length} open)</h3><div className="space-y-1">{vulnerabilities.slice(0, 8).map((v) => <div key={v.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted"><span className={`w-2 h-2 rounded-full ${v.severity === "critical" ? "bg-red-500" : v.severity === "high" ? "bg-orange-500" : "bg-amber-500"}`} /><span className="font-medium text-text-primary flex-1 truncate">{v.cveId && <span className="text-text-muted mr-1">{v.cveId}</span>}{v.title}</span><select className="text-[10px] bg-transparent border-none text-text-muted" value={v.status} onChange={(e) => post({ action: "updateVulnerability", id: v.id, status: e.target.value })}><option value="open">Open</option><option value="mitigated">Mitigated</option><option value="accepted">Accepted</option><option value="resolved">Resolved</option></select></div>)}</div><button className="am-tree-add mt-2" onClick={() => { const title = prompt("Title:"); if (title) post({ action: "createVulnerability", title, severity: "medium" }); }}><Plus className="w-3 h-3" /> Add</button></div>}
              {changeRequests.length > 0 && <div className="mb-4 border border-border rounded-lg p-3 bg-surface"><h3 className="text-xs font-semibold text-text-muted uppercase mb-2">📝 Change Requests ({changeRequests.filter((c) => c.status !== "implemented" && c.status !== "rolled-back").length} active)</h3><div className="space-y-1">{changeRequests.slice(0, 8).map((cr) => <div key={cr.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted"><span className="font-mono text-accent text-[10px]">{cr.id}</span><span className="font-medium text-text-primary flex-1 truncate">{cr.title}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${cr.status === "approved" ? "bg-green-500/10 text-green-600" : cr.status === "pending" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"}`}>{cr.status}</span>{cr.status === "draft" && <button className="text-[10px] text-accent" onClick={() => post({ action: "updateChangeRequest", id: cr.id, status: "pending" })}>Submit</button>}{cr.status === "pending" && <button className="text-[10px] text-green-600" onClick={() => post({ action: "updateChangeRequest", id: cr.id, status: "approved" })}>Approve</button>}{cr.status === "approved" && <button className="text-[10px] text-blue-600" onClick={() => post({ action: "updateChangeRequest", id: cr.id, status: "implemented" })}>Done</button>}</div>)}</div><button className="am-tree-add mt-2" onClick={() => { const title = prompt("Title:"); if (title) post({ action: "createChangeRequest", title, risk: "medium" }); }}><Plus className="w-3 h-3" /> New RFC</button></div>}
              {expiryAlerts.length > 0 && <div className="mb-4 border border-border rounded-lg p-3 bg-surface"><h3 className="text-xs font-semibold text-text-muted uppercase mb-2">🕔 Expiries ({expiryAlerts.length})</h3><div className="space-y-1">{expiryAlerts.slice(0, 10).map((a, i) => <div key={i} className="flex items-center gap-2 text-xs py-1 px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.type === "warranty" ? "bg-orange-500/10 text-orange-600" : "bg-blue-500/10 text-blue-600"}`}>{a.type}</span><span className="flex-1 truncate">{a.itemName}</span><span className={`font-bold ${a.daysRemaining <= 7 ? "text-red-600" : a.daysRemaining <= 30 ? "text-orange-600" : "text-text-muted"}`}>{a.daysRemaining}d</span></div>)}</div></div>}
              {duplicates.length > 0 && <button className="w-full mb-4 border border-amber-500/30 rounded-lg p-3 bg-amber-500/5 text-left hover:bg-amber-500/10" onClick={() => setShowDuplicatesModal(true)}><h3 className="text-xs font-semibold text-amber-600 uppercase">⚠ {duplicates.length} duplicate groups — click to review</h3></button>}
            </>
          )}

          {showCIList && (<>
            {loading ? <div className="jp-empty">Loading…</div> : sorted.length === 0 ? <div className="jp-empty"><Monitor className="w-10 h-10 text-text-muted mb-3 opacity-40" /><p className="text-text-muted">{containers.length === 0 ? "Create a group first" : "No CIs matching filters"}</p></div> : (
              <div className="cl-table-wrap">
                {selectedIds.size > 0 && <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-accent/10 border border-accent/30 text-xs"><CheckSquare className="w-3.5 h-3.5 text-accent" /><span className="font-medium text-accent">{selectedIds.size} selected</span><select className="cl-input py-0.5 text-xs" style={{ width: 140 }} value={bulkAction || ""} onChange={(e) => setBulkAction(e.target.value || null)}><option value="">Action…</option><option value="status">Status</option><option value="owner">Owner</option><option value="type">Type</option><option value="container">Group</option><option value="addTag">Tag</option><option value="delete">Delete</option></select>
                  {bulkAction === "status" && <select className="cl-input py-0.5 text-xs" style={{ width: 120 }} onChange={async (e) => { if (e.target.value) { await post({ action: "bulkUpdate", ids: [...selectedIds], updates: { status: e.target.value } }); setSelectedIds(new Set()); setBulkAction(null); } }}><option value="">Pick…</option>{["Active","Maintenance","Decommissioned","Ordered"].map((s) => <option key={s} value={s}>{s}</option>)}</select>}
                  {bulkAction === "owner" && <input className="cl-input py-0.5 text-xs" style={{ width: 120 }} placeholder="Owner" onKeyDown={async (e) => { if (e.key === "Enter" && (e.target as HTMLInputElement).value) { await post({ action: "bulkUpdate", ids: [...selectedIds], updates: { owner: (e.target as HTMLInputElement).value } }); setSelectedIds(new Set()); setBulkAction(null); } }} />}
                  {bulkAction === "type" && <select className="cl-input py-0.5 text-xs" style={{ width: 120 }} onChange={async (e) => { if (e.target.value) { await post({ action: "bulkUpdate", ids: [...selectedIds], updates: { typeId: e.target.value } }); setSelectedIds(new Set()); setBulkAction(null); } }}><option value="">Pick…</option>{assetTypes.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}</select>}
                  {bulkAction === "container" && <select className="cl-input py-0.5 text-xs" style={{ width: 120 }} onChange={async (e) => { if (e.target.value) { await post({ action: "bulkUpdate", ids: [...selectedIds], updates: { containerId: e.target.value } }); setSelectedIds(new Set()); setBulkAction(null); } }}><option value="">Pick…</option>{containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                  {bulkAction === "addTag" && <input className="cl-input py-0.5 text-xs" style={{ width: 120 }} placeholder="Tag" onKeyDown={async (e) => { if (e.key === "Enter" && (e.target as HTMLInputElement).value) { await post({ action: "bulkUpdate", ids: [...selectedIds], updates: { addTags: [(e.target as HTMLInputElement).value] } }); setSelectedIds(new Set()); setBulkAction(null); } }} />}
                  {bulkAction === "delete" && <button className="cl-btn text-xs" style={{ background: "#dc2626", color: "#fff", padding: "2px 10px" }} onClick={async () => { if (confirm(`Delete ${selectedIds.size} CIs?`)) { await post({ action: "bulkDelete", ids: [...selectedIds] }); setSelectedIds(new Set()); setBulkAction(null); } }}>Confirm</button>}
                  <button className="text-text-muted ml-auto" onClick={() => { setSelectedIds(new Set()); setBulkAction(null); }}>✕</button>
                </div>}
                <table className="cl-table"><thead><tr>
                  <th className="cl-th" style={{ width: 32 }}><input type="checkbox" checked={sorted.length > 0 && selectedIds.size === sorted.length} onChange={(e) => setSelectedIds(e.target.checked ? new Set(sorted.map((a) => a.id)) : new Set())} /></th>
                  <th onClick={() => toggleSort("id")} className="cl-th cl-th--sort">ID <SortIcon col="id" /></th>
                  <th onClick={() => toggleSort("name")} className="cl-th cl-th--sort">Name <SortIcon col="name" /></th>
                  <th onClick={() => toggleSort("type")} className="cl-th cl-th--sort">Type <SortIcon col="type" /></th>
                  <th className="cl-th">Tags</th>
                  <th onClick={() => toggleSort("status")} className="cl-th cl-th--sort">Status <SortIcon col="status" /></th>
                  <th onClick={() => toggleSort("owner")} className="cl-th cl-th--sort">Owner <SortIcon col="owner" /></th>
                </tr></thead><tbody>{sorted.map((a) => (
                  <tr key={a.id} className="cl-tr" onClick={() => setDetailAsset(a)}>
                    <td className="cl-td" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(a.id)} onChange={(e) => setSelectedIds((p) => { const n = new Set(p); e.target.checked ? n.add(a.id) : n.delete(a.id); return n; })} /></td>
                    <td className="cl-td cl-td--id">{activeMaintenanceAssetIds.includes(a.id) && <span title="Maintenance" className="mr-1">🔧</span>}{a.id}</td>
                    <td className="cl-td" style={{ fontWeight: 600 }}>{a.name}</td>
                    <td className="cl-td">{(() => { const t = assetTypes.find((t) => t.id === a.typeId); return t ? <span>{t.icon} {t.name}</span> : <span>{a.type}</span>; })()}</td>
                    <td className="cl-td"><div className="flex flex-wrap gap-0.5">{(a.tags || []).slice(0, 3).map((tag) => <span key={tag} className="text-[10px] px-1.5 py-0 rounded-full bg-accent/10 text-accent">{tag}</span>)}{(a.tags || []).length > 3 && <span className="text-[10px] text-text-muted">+{a.tags.length - 3}</span>}</div></td>
                    <td className="cl-td"><span className={`cl-badge am-status--${a.status.toLowerCase()}`}>{a.status}</span></td>
                    <td className="cl-td">{a.owner}</td>
                  </tr>
                ))}</tbody></table>
                <div className="cl-table-count">{sorted.length} {sorted.length === 1 ? "CI" : "CIs"}</div>
              </div>
            )}
          </>)}
          {activeView === "recycleBin" && (
            <div>
              <h2 className="text-sm font-bold text-text-primary mb-3">🗑️ Recycle Bin ({recycleBin.length} items — auto-purged after 30 days)</h2>
              {recycleBin.length === 0 ? <p className="text-sm text-text-muted">Empty</p> : (
                <table className="cl-table"><thead><tr><th className="cl-th">ID</th><th className="cl-th">Name</th><th className="cl-th">Type</th><th className="cl-th">Deleted</th><th className="cl-th">By</th><th className="cl-th">Actions</th></tr></thead>
                <tbody>{recycleBin.map((a) => { const t = assetTypes.find((t) => t.id === a.typeId); return (
                  <tr key={a.id} className="cl-tr"><td className="cl-td cl-td--id">{a.id}</td><td className="cl-td">{a.name}</td><td className="cl-td">{t ? `${t.icon} ${t.name}` : a.type}</td><td className="cl-td text-xs text-text-muted">{a.deletedAt ? new Date(a.deletedAt).toLocaleDateString() : ""}</td><td className="cl-td text-xs">{a.deletedBy}</td>
                  <td className="cl-td"><div className="flex gap-2"><button className="text-[10px] text-accent hover:underline flex items-center gap-0.5" onClick={() => { post({ action: "restoreCmdbItem", id: a.id }); showToast(`Restored ${a.name}`); }}><RotateCcw className="w-3 h-3" /> Restore</button><button className="text-[10px] text-red-500 hover:underline" onClick={() => { if (confirm(`Permanently delete ${a.name}?`)) post({ action: "permanentlyDelete", id: a.id }); }}>Delete forever</button></div></td></tr>
                ); })}</tbody></table>)}
            </div>
          )}

          {activeView === "agent" && (
            <div>
              <h2 className="text-sm font-bold text-text-primary mb-4">🤖 Inventory Agent</h2>
              <div className="mb-4 border border-border rounded-lg p-4 bg-surface">
                <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Coverage</h3>
                <div className="flex items-center gap-3"><div className="flex-1 h-4 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${agentStats.coverage}%` }} /></div><span className="text-sm font-bold">{agentStats.coverage}%</span></div>
                <p className="text-xs text-text-muted mt-1">{agentStats.withAgent}/{agentStats.total} CIs reporting{agentStats.stale > 0 && <span className="text-orange-500 ml-2">⚠ {agentStats.stale} stale</span>}</p>
              </div>
              <div className="mb-4 border border-border rounded-lg p-4 bg-surface">
                <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Step 1 — Create API Key</h3>
                <p className="text-xs text-text-muted mb-2">The agent needs a service API key to authenticate.</p>
                {agentKey ? (
                  <div className="bg-muted rounded p-2"><code className="text-xs font-mono text-accent break-all select-all">{agentKey}</code><p className="text-[10px] text-red-500 mt-1">⚠ Copy now — won't be shown again!</p></div>
                ) : (
                  <button className="cl-btn cl-btn--primary text-xs" onClick={async () => { const res = await fetch("/api/cmdb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createAgentKey" }) }); if (res.ok) { const d = await res.json(); setAgentKey(d.secret); showToast("API key created"); } else { const e = await res.json(); alert(e.error || "Failed"); } }}>Generate Agent API Key</button>
                )}
              </div>
              <div className="mb-4 border border-border rounded-lg p-4 bg-surface">
                <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Step 2 — Download Script</h3>
                <p className="text-xs text-text-muted mb-3">Pre-configured with your server URL{agentKey ? " and API key" : ""}.</p>
                <div className="flex gap-2">
                  {(["linux", "macos", "windows"] as const).map((os) => (
                    <a key={os} href={`/api/cmdb/agent-script?os=${os}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}&key=${encodeURIComponent(agentKey || "YOUR_API_KEY")}`} download className="cl-btn cl-btn--secondary text-xs">
                      {os === "linux" ? "🐧" : os === "macos" ? "🍎" : "🪟"} {os.charAt(0).toUpperCase() + os.slice(1)}
                    </a>
                  ))}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 bg-surface">
                <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Step 3 — Install</h3>
                <div className="text-xs text-text-secondary space-y-3">
                  <div><p className="font-semibold mb-1">Linux / macOS</p><pre className="bg-muted rounded p-2 font-mono text-[11px] whitespace-pre-wrap">chmod +x docit-agent.sh{"\n"}./docit-agent.sh{"\n\n"}# Schedule every 6 hours:{"\n"}crontab -e{"\n"}0 */6 * * * /path/to/docit-agent.sh</pre></div>
                  <div><p className="font-semibold mb-1">Windows (PowerShell as Admin)</p><pre className="bg-muted rounded p-2 font-mono text-[11px] whitespace-pre-wrap">Set-ExecutionPolicy RemoteSigned -Scope CurrentUser{"\n"}.\docit-agent.ps1{"\n\n"}# Schedule: Task Scheduler → every 6 hours</pre></div>
                  <p className="text-text-muted mt-2">Collects: hostname, OS, IPs, CPU, RAM, disks, NICs, installed software.</p>
                  <p className="text-text-muted">Existing CIs matched by hostname are <strong>updated</strong>; new ones are auto-created.</p>
                </div>
              </div>
            </div>
          )}

          {activeView === "services" && <BusinessServiceListPanel services={businessServices} onCreate={() => { setEditService(null); setShowServiceModal(true); }} onEdit={(s) => { setEditService(s); setShowServiceModal(true); }} onDelete={async (id) => { await post({ action: "deleteService", id }); }} />}
          {activeView === "licenses" && <LicenseListPanel licenses={licenses} compliance={licenseCompliance} summary={licenseComplianceSummary} onCreate={() => { setEditLicense(null); setShowLicenseModal(true); }} onEdit={(l) => { setEditLicense(l); setShowLicenseModal(true); }} onDelete={async (id) => { await post({ action: "deleteLicense", id }); }} />}
        </main>
      </div>

      {/* ── Modals ── */}
      <CmdbItemModal isOpen={showNewAsset || !!editAsset} onClose={() => { setShowNewAsset(false); setEditAsset(null); }} containers={containers} customFieldDefs={fieldDefs} assetTypes={assetTypes} lifecycleWorkflows={lifecycleWorkflows} locations={locations} editAsset={editAsset} defaultContainerId={selectedContainer} onSave={async (data) => { await post(data); }} />
      <CmdbItemDetailModal asset={detailAsset} containers={containers} customFieldDefs={fieldDefs} assetTypes={assetTypes} relationships={relationships} relationshipTypes={relationshipTypes} assets={assets} licenseCompliance={licenseCompliance} lifecycleWorkflows={lifecycleWorkflows} locations={locations} businessServices={businessServices} complianceCheckDefs={complianceCheckDefs} vulnerabilities={vulnerabilities} onClose={() => setDetailAsset(null)} onEdit={(a) => { setDetailAsset(null); setEditAsset(a); }} onDelete={async (id) => { await post({ action: "deleteCmdbItem", id }); }} onSave={async (data) => { await post(data); }} onSelectAsset={(a) => setDetailAsset(a)} onAddRelationship={() => setShowRelModal(true)} onAnalyzeImpact={(a) => { setImpactAssetId(a.id); setShowImpactModal(true); }} onViewDiagram={(a) => { setDiagramFocusId(a.id); setShowDiagram(true); setDetailAsset(null); }} />
      <CmdbContainerModal isOpen={showContainerModal} onClose={() => { setShowContainerModal(false); setEditContainer(null); }} containers={containers} editContainer={editContainer} onSave={async (name, parentId) => { if (editContainer) await post({ action: "updateContainer", id: editContainer.id, name, parentId }); else await post({ action: "createContainer", name, parentId }); }} onDelete={async (id) => { await post({ action: "deleteContainer", id }); if (selectedContainer === id) { setSelectedContainer(null); setActiveView("dashboard"); } }} />
      <CmdbFieldDefsModal isOpen={showFieldDefs} onClose={() => { setShowFieldDefs(false); fetchData(); }} fieldDefs={fieldDefs} onAdd={async (n, t, o) => { await post({ action: "createFieldDef", name: n, type: t, options: o }); }} onUpdate={async (id, n, t, o) => { await post({ action: "updateFieldDef", id, name: n, type: t, options: o }); }} onDelete={async (id) => { await post({ action: "deleteFieldDef", id }); }} />
      <CmdbCsvImportModal isOpen={showCsvImport} onClose={() => { setShowCsvImport(false); fetchData(); }} containers={containers} customFieldDefs={fieldDefs} onImport={async (rows) => { const res = await fetch("/api/cmdb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulkCreateCmdbItems", rows }) }); const data = await res.json(); await fetchData(); return data; }} />
      <CmdbItemTypeModal isOpen={showTypeModal} onClose={() => { setShowTypeModal(false); fetchData(); }} assetTypes={assetTypes} onSave={async (data) => { await post(data); }} />
      <LicenseModal isOpen={showLicenseModal || !!editLicense} onClose={() => { setShowLicenseModal(false); setEditLicense(null); }} editLicense={editLicense} onSave={async (data) => { await post(data); }} />
      <BusinessServiceModal isOpen={showServiceModal || !!editService} onClose={() => { setShowServiceModal(false); setEditService(null); }} editService={editService} assets={assets} onSave={async (data) => { await post(data); }} />
      <LifecycleEditorModal isOpen={showWorkflowModal} onClose={() => { setShowWorkflowModal(false); fetchData(); }} workflows={lifecycleWorkflows} onSave={async (data) => { await post(data); }} />
      <LocationTreeModal isOpen={showLocationModal} onClose={() => { setShowLocationModal(false); fetchData(); }} locations={locations} onSave={async (data) => { await post(data); }} />
      {detailAsset && <CmdbRelationshipModal isOpen={showRelModal} onClose={() => setShowRelModal(false)} sourceAsset={detailAsset} assets={assets} assetTypes={assetTypes} relationshipTypes={relationshipTypes} onSave={async (data) => { await post(data); }} />}
      <CmdbDiagram isOpen={showDiagram} onClose={() => { setShowDiagram(false); setDiagramFocusId(undefined); }} assets={assets} assetTypes={assetTypes} relationships={relationships} relationshipTypes={relationshipTypes} businessServices={businessServices} onSelectAsset={(a) => { setShowDiagram(false); setDiagramFocusId(undefined); setDetailAsset(a); }} focusAssetId={diagramFocusId} />
      <ImpactAnalysisModal isOpen={showImpactModal} onClose={() => { setShowImpactModal(false); setImpactAssetId(undefined); }} assets={assets} initialAssetId={impactAssetId} />

      {/* Scan modal */}
      {showScanPanel && (
        <div className="cl-modal-overlay" onClick={() => setShowScanPanel(false)}>
          <div className="cl-modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title flex items-center gap-2"><Radar className="w-4 h-4 text-accent" /> Network Discovery</h2><button onClick={() => setShowScanPanel(false)} className="cl-modal-close"><X className="w-4 h-4" /></button></div>
            <div className="cl-modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <div className="mb-4">{scanConfigs.map((cfg) => (
                <div key={cfg.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted">
                  <span className="font-medium text-text-primary flex-1">{cfg.name}</span><span className="text-xs text-text-muted">{cfg.ipRange}</span>
                  <button className="cl-btn cl-btn--primary text-[10px] py-0.5 px-2" disabled={scanPolling} onClick={async () => {
                    await fetch("/api/cmdb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "runScan", configId: cfg.id }) });
                    setScanPolling(true);
                    const poll = async () => { try { const res = await fetch("/api/cmdb?q=__scanonly"); if (res.ok) { const d = await res.json(); setScanResults(d.scanResults || []); if ((d.scanResults || [])[0]?.status === "running") setTimeout(poll, 5000); else { setScanPolling(false); fetchData(); } } else setScanPolling(false); } catch { setScanPolling(false); } };
                    setTimeout(poll, 3000);
                  }}>{scanPolling ? "Scanning…" : "Run"}</button>
                  <button className="text-text-muted hover:text-red-500 text-xs" onClick={() => post({ action: "deleteScanConfig", id: cfg.id })}>✕</button>
                </div>
              ))}<button className="am-tree-add mt-2" onClick={() => { const name = prompt("Name:"); if (!name) return; const ipRange = prompt("IP range (e.g. 10.0.0.0/24):"); if (!ipRange) return; post({ action: "createScanConfig", name, ipRange, ports: [], defaultContainerId: selectedContainer || containers[0]?.id }); }}><Plus className="w-3 h-3" /> New Config</button></div>
              {scanResults.length > 0 && (() => { const r = scanResults[0]; return (
                <div className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2"><span className="font-medium text-sm">{r.configName}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === "completed" ? "bg-green-500/10 text-green-600" : r.status === "running" ? "bg-blue-500/10 text-blue-600" : "bg-red-500/10 text-red-600"}`}>{r.status}</span><span className="text-[10px] text-text-muted">{r.scannedCount} scanned · {r.discoveredDevices.length} found</span></div>
                  {r.discoveredDevices.length > 0 && <>
                    <table className="cl-table text-xs w-full"><thead><tr><th className="cl-th">IP</th><th className="cl-th">Hostname</th><th className="cl-th">Type</th><th className="cl-th">Ports</th><th className="cl-th">Status</th></tr></thead><tbody>{r.discoveredDevices.map((d) => <tr key={d.ip} className="cl-tr"><td className="cl-td font-mono">{d.ip}</td><td className="cl-td">{d.hostname !== d.ip ? d.hostname : "—"}</td><td className="cl-td">{d.guessedType}</td><td className="cl-td text-text-muted">{d.openPorts.join(", ") || "—"}</td><td className="cl-td">{d.alreadyExists ? <span className="text-green-600">Known</span> : <span className="text-amber-600">New</span>}</td></tr>)}</tbody></table>
                    {r.discoveredDevices.some((d) => !d.alreadyExists) && <button className="cl-btn cl-btn--primary text-xs mt-2" onClick={async () => {
                      const newD = r.discoveredDevices.filter((d) => !d.alreadyExists);
                      const cid = selectedContainer || containers[0]?.id; if (!cid) { alert("Create a group first"); return; }
                      await post({ action: "importDiscovered", devices: newD, containerId: cid });
                      setShowScanPanel(false); showToast(`Imported ${newD.length} devices`);
                    }}>Import {r.discoveredDevices.filter((d) => !d.alreadyExists).length} new</button>}
                  </>}
                </div>
              ); })()}
            </div>
          </div>
        </div>
      )}

      {/* Duplicates modal */}
      {showDuplicatesModal && (
        <div className="cl-modal-overlay" onClick={() => setShowDuplicatesModal(false)}>
          <div className="cl-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header"><h2 className="cl-modal-title">⚠ Duplicates ({duplicates.length})</h2><button onClick={() => setShowDuplicatesModal(false)} className="cl-modal-close"><X className="w-4 h-4" /></button></div>
            <div className="cl-modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <p className="text-xs text-text-muted mb-3">Select duplicates to delete.</p>
              {duplicates.map((d, gi) => <div key={gi} className="mb-3 border border-border rounded-lg p-3"><p className="text-xs font-semibold text-text-muted mb-1">{d.field}: <span className="font-mono text-text-primary">{d.value}</span></p>{d.assetIds.map((id, i) => <div key={id} className="flex items-center gap-2 text-xs py-1"><input type="checkbox" checked={selectedIds.has(id)} onChange={(e) => setSelectedIds((p) => { const n = new Set(p); e.target.checked ? n.add(id) : n.delete(id); return n; })} /><span className="font-mono text-accent">{id}</span><span>{d.assetNames[i]}</span></div>)}</div>)}
              {selectedIds.size > 0 && <button className="cl-btn text-xs" style={{ background: "#dc2626", color: "#fff" }} onClick={async () => { if (!confirm(`Delete ${selectedIds.size} CIs?`)) return; await post({ action: "bulkDelete", ids: [...selectedIds] }); setSelectedIds(new Set()); showToast(`Deleted duplicates`); setShowDuplicatesModal(false); }}>Delete {selectedIds.size} selected</button>}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="fixed bottom-6 right-6 z-[9999] bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">✓ {toast}</div>}
    </div>
  );
}
