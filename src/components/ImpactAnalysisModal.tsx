"use client";

import { useState } from "react";
import { X, AlertTriangle, ChevronRight, ChevronDown, Briefcase } from "lucide-react";
import type { CmdbItem, ImpactNode, ImpactResult, ServiceCriticality } from "@/lib/cmdb";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assets: CmdbItem[];
  initialAssetId?: string;
}

function critColor(c: ServiceCriticality): string {
  switch (c) {
    case "critical": return "text-red-600";
    case "high": return "text-orange-600";
    case "medium": return "text-amber-600";
    case "low": return "text-green-600";
  }
}

function critBg(c: ServiceCriticality): string {
  switch (c) {
    case "critical": return "bg-red-500/10 text-red-600";
    case "high": return "bg-orange-500/10 text-orange-600";
    case "medium": return "bg-amber-500/10 text-amber-600";
    case "low": return "bg-green-500/10 text-green-600";
  }
}

function depthColor(depth: number): string {
  if (depth <= 1) return "border-red-400";
  if (depth <= 2) return "border-orange-400";
  if (depth <= 3) return "border-amber-400";
  return "border-gray-400";
}

export default function ImpactAnalysisModal({ isOpen, onClose, assets, initialAssetId }: Props) {
  const [assetId, setAssetId] = useState(initialAssetId || "");
  const [direction, setDirection] = useState<"upstream" | "downstream" | "both">("both");
  const [maxDepth, setMaxDepth] = useState(10);
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const analyze = async () => {
    if (!assetId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/cmdb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyzeImpact", assetId, direction, maxDepth }),
      });
      if (res.ok) {
        const data: ImpactResult = await res.json();
        setResult(data);
        // Auto-expand first two depth levels
        const autoExpand = new Set<string>();
        for (const n of data.nodes) { if (n.depth <= 2) autoExpand.add(n.assetId); }
        setExpanded(autoExpand);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Build tree from flat nodes
  const buildTree = (nodes: ImpactNode[], rootId: string) => {
    const children = nodes.filter((n) => n.parentAssetId === rootId);
    return children;
  };

  const TreeNode = ({ node, nodes }: { node: ImpactNode; nodes: ImpactNode[] }) => {
    const children = buildTree(nodes, node.assetId);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(node.assetId);

    return (
      <div className="ml-4">
        <div className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-muted border-l-2 ${depthColor(node.depth)}`}>
          {hasChildren ? (
            <button className="w-4 h-4 flex-shrink-0" onClick={() => toggleExpand(node.assetId)}>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
            </button>
          ) : (
            <span className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="text-sm text-text-primary font-medium">{node.assetName}</span>
          <span className="text-xs text-text-muted">({node.assetId})</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-text-muted ml-auto">{node.relationshipLabel}</span>
          <span className="text-[10px] text-text-muted">depth {node.depth}</span>
        </div>
        {isExpanded && children.map((child) => (
          <TreeNode key={child.assetId} node={child} nodes={nodes} />
        ))}
      </div>
    );
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent" /> Impact Analysis
          </h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="cl-field flex-1" style={{ minWidth: 180 }}>
              <label className="cl-label">CmdbItem</label>
              <select className="cl-input" value={assetId} onChange={(e) => { setAssetId(e.target.value); setResult(null); }}>
                <option value="">— Select asset —</option>
                {[...assets].sort((a, b) => a.name.localeCompare(b.name)).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
              </select>
            </div>
            <div className="cl-field" style={{ minWidth: 120 }}>
              <label className="cl-label">Direction</label>
              <select className="cl-input" value={direction} onChange={(e) => setDirection(e.target.value as "upstream" | "downstream" | "both")}>
                <option value="both">Both</option>
                <option value="downstream">Downstream</option>
                <option value="upstream">Upstream</option>
              </select>
            </div>
            <div className="cl-field" style={{ minWidth: 80 }}>
              <label className="cl-label">Max Depth</label>
              <input type="number" min={1} max={20} className="cl-input" value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value) || 10)} />
            </div>
            <div className="cl-field flex items-end">
              <button className="cl-btn cl-btn--primary text-xs" onClick={analyze} disabled={!assetId || loading}>
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <>
              {/* Affected services */}
              {result.affectedServices.length > 0 && (
                <div className="mb-4 p-3 border border-border rounded-lg bg-surface">
                  <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1 mb-2">
                    <Briefcase className="w-3.5 h-3.5 text-accent" /> Affected Services ({result.affectedServices.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.affectedServices.map((svc) => (
                      <div key={svc.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${critBg(svc.criticality)}`}>
                        <span className={critColor(svc.criticality)}>●</span>
                        {svc.name}
                        <span className="opacity-60 capitalize">({svc.criticality})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Impact tree */}
              <div className="border border-border rounded-lg p-3">
                <h4 className="text-xs font-semibold text-text-primary mb-2">
                  Impact Tree — {result.rootAssetName} ({result.nodes.length} affected CI{result.nodes.length !== 1 ? "s" : ""})
                </h4>
                {result.nodes.length === 0 ? (
                  <p className="text-xs text-text-muted italic">No connected CIs found in the {direction} direction.</p>
                ) : (
                  <div>
                    {/* Root level children */}
                    {buildTree(result.nodes, result.rootAssetId).map((node) => (
                      <TreeNode key={node.assetId} node={node} nodes={result.nodes} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!result && !loading && (
            <p className="text-sm text-text-muted italic text-center py-6">Select an asset and click Analyze to see the impact graph.</p>
          )}
        </div>
      </div>
    </div>
  );
}
