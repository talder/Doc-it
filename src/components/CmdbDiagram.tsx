"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CmdbItem, CmdbItemType, CmdbRelationship, RelationshipTypeDef, BusinessService } from "@/lib/cmdb";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assets: CmdbItem[];
  assetTypes: CmdbItemType[];
  relationships: CmdbRelationship[];
  relationshipTypes: RelationshipTypeDef[];
  businessServices?: BusinessService[];
  onSelectAsset: (asset: CmdbItem) => void;
  focusAssetId?: string; // If set, only show this CI and its direct neighbors
}

interface Node {
  id: string;
  label: string;
  icon: string;
  color: string;
  status: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
}

const STATUS_COLORS: Record<string, string> = {
  Active: "#16a34a",
  Maintenance: "#d97706",
  Decommissioned: "#6b7280",
  Ordered: "#3b82f6",
};

export default function CmdbDiagram({ isOpen, onClose, assets, assetTypes, relationships, relationshipTypes, businessServices = [], onSelectAsset, focusAssetId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const animRef = useRef<number>(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [filterServiceId, setFilterServiceId] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Build graph data
  const { initialNodes, edges } = useMemo(() => {
    // Optionally filter to a single business service
    const svcFilter = filterServiceId ? businessServices.find((s) => s.id === filterServiceId) : null;
    const allowedIds = svcFilter ? new Set(svcFilter.memberAssetIds) : null;

    // If focusAssetId is set, only show that CI and its direct neighbors
    let focusIds: Set<string> | null = null;
    if (focusAssetId) {
      focusIds = new Set<string>([focusAssetId]);
      for (const r of relationships) {
        if (r.sourceId === focusAssetId) focusIds.add(r.targetId);
        if (r.targetId === focusAssetId) focusIds.add(r.sourceId);
      }
    }

    // Only include assets that have relationships
    const connectedIds = new Set<string>();
    for (const r of relationships) { connectedIds.add(r.sourceId); connectedIds.add(r.targetId); }
    const connected = assets.filter((a) => connectedIds.has(a.id) && (!allowedIds || allowedIds.has(a.id)) && (!focusIds || focusIds.has(a.id)));

    const W = dimensions.w, H = dimensions.h;
    const initialNodes: Node[] = connected.map((a, i) => {
      const t = assetTypes.find((t) => t.id === a.typeId);
      const angle = (2 * Math.PI * i) / Math.max(connected.length, 1);
      const r = Math.min(W, H) * 0.3;
      return {
        id: a.id,
        label: a.name,
        icon: t?.icon || "📦",
        color: t?.color || "#6b7280",
        status: a.status,
        x: W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
      };
    });

    const edges: Edge[] = relationships.map((r) => {
      const rt = relationshipTypes.find((t) => t.id === r.typeId);
      return { id: r.id, source: r.sourceId, target: r.targetId, label: rt?.label || "" };
    });

    return { initialNodes, edges };
  }, [assets, assetTypes, relationships, relationshipTypes, dimensions, filterServiceId, businessServices, focusAssetId]);

  // Initialize nodes when graph data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  // Measure container
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDimensions({ w: rect.width || 800, h: rect.height || 600 });
  }, [isOpen]);

  // Force simulation
  useEffect(() => {
    if (!isOpen || nodes.length === 0) return;
    let running = true;
    let iteration = 0;
    const MAX_ITER = 200;

    const tick = () => {
      if (!running || iteration > MAX_ITER) return;
      iteration++;

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const k = 0.01; // spring constant
        const repulsion = 8000;
        const damping = 0.85;
        const centerForce = 0.005;
        const W = dimensions.w, H = dimensions.h;

        // Repulsion between all nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = repulsion / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx; next[i].vy -= fy;
            next[j].vx += fx; next[j].vy += fy;
          }
        }

        // Attraction along edges
        for (const edge of edges) {
          const a = next.find((n) => n.id === edge.source);
          const b = next.find((n) => n.id === edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const ideal = 180;
          const force = k * (dist - ideal);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        // Center gravity
        for (const n of next) {
          n.vx += (W / 2 - n.x) * centerForce;
          n.vy += (H / 2 - n.y) * centerForce;
        }

        // Apply velocity
        for (const n of next) {
          if (dragging === n.id) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= damping; n.vy *= damping;
          n.x += n.vx; n.y += n.vy;
          n.x = Math.max(60, Math.min(W - 60, n.x));
          n.y = Math.max(30, Math.min(H - 30, n.y));
        }

        return next;
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [isOpen, nodes.length, edges, dimensions, dragging]);

  if (!isOpen) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const node = nodeMap.get(id);
    if (!node) return;
    dragOffset.current = { x: e.clientX - node.x, y: e.clientY - node.y };
    setDragging(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragging
          ? { ...n, x: e.clientX - rect.left - dragOffset.current.x + rect.left, y: e.clientY - rect.top - dragOffset.current.y + rect.top, vx: 0, vy: 0 }
          : n
      )
    );
  };

  const handleMouseUp = () => setDragging(null);

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: "90vw", width: "90vw", height: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="flex items-center gap-3 flex-1">
            <h2 className="cl-modal-title">Relationship Diagram</h2>
            {businessServices.length > 0 && (
              <select className="cl-input text-xs py-1" style={{ width: 160 }} value={filterServiceId} onChange={(e) => setFilterServiceId(e.target.value)}>
                <option value="">All CIs</option>
                {businessServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1 ml-2">
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted" onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}>+</button>
              <span className="text-xs text-text-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}>−</button>
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted" onClick={() => {
                if (!containerRef.current) return;
                const el = containerRef.current;
                const canvas = document.createElement("canvas");
                canvas.width = el.offsetWidth * 2; canvas.height = el.offsetHeight * 2;
                const ctx = canvas.getContext("2d")!;
                ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
                // Draw edges
                for (const edge of edges) {
                  const a = nodeMap.get(edge.source); const b = nodeMap.get(edge.target); if (!a || !b) continue;
                  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.stroke();
                  if (edge.label) { ctx.fillStyle = "#999"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(edge.label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 6); }
                }
                // Draw nodes
                for (const node of nodes) {
                  ctx.beginPath(); ctx.arc(node.x, node.y, 18, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = STATUS_COLORS[node.status] || "#6b7280"; ctx.lineWidth = 2; ctx.stroke();
                  ctx.fillStyle = "#333"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.fillText(node.icon, node.x, node.y + 6);
                  ctx.font = "10px sans-serif"; ctx.fillText(node.label.slice(0, 20), node.x, node.y + 30);
                }
                const url = canvas.toDataURL("image/png");
                const a2 = document.createElement("a"); a2.href = url; a2.download = "cmdb-diagram.png"; a2.click();
              }}>Export PNG</button>
            </div>
          </div>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div
          ref={containerRef}
          className="relative w-full flex-1 overflow-hidden"
          style={{ height: "calc(80vh - 60px)", background: "var(--color-surface-alt)" }}
          onMouseMove={(e) => {
            if (panning) { setPan({ x: e.clientX - panStart.current.x + panStart.current.px, y: e.clientY - panStart.current.y + panStart.current.py }); return; }
            handleMouseMove(e);
          }}
          onMouseUp={() => { handleMouseUp(); setPanning(false); }}
          onMouseLeave={() => { handleMouseUp(); setPanning(false); }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest(".cmdb-node")) return;
            setPanning(true); panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }}
          onWheel={(e) => { e.preventDefault(); setZoom((z) => Math.max(0.3, Math.min(3, z + (e.deltaY > 0 ? -0.1 : 0.1)))); }}
        >
          {/* SVG edges */}
          <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--color-text-muted)" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const a = nodeMap.get(edge.source);
              const b = nodeMap.get(edge.target);
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              return (
                <g key={edge.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-border)" strokeWidth={1.5} markerEnd="url(#arrow)" />
                  {edge.label && (
                    <text x={mx} y={my - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)" fontFamily="sans-serif">{edge.label}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center", position: "absolute", inset: 0 }}>
          {nodes.map((node) => {
            const asset = assets.find((a) => a.id === node.id);
            return (
              <div
                key={node.id}
                className="cmdb-node absolute flex flex-col items-center gap-0.5 cursor-grab select-none group"
                style={{
                  left: node.x - 50,
                  top: node.y - 24,
                  zIndex: dragging === node.id ? 10 : 2,
                  width: 100,
                }}
                onMouseDown={(e) => handleMouseDown(node.id, e)}
                onDoubleClick={() => asset && onSelectAsset(asset)}
                title={`${node.label} (${node.id}) — ${node.status}`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm border-2"
                  style={{ background: "var(--color-surface)", borderColor: STATUS_COLORS[node.status] || "#6b7280" }}
                >
                  {node.icon}
                </div>
                <span className="text-[10px] text-text-primary font-medium text-center leading-tight w-full overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{node.label}</span>
                {/* Full name tooltip on hover */}
                <div className="hidden group-hover:block absolute top-full mt-1 z-50 bg-surface border border-border rounded px-2 py-1 shadow-lg text-[10px] text-text-primary whitespace-nowrap">{node.label}</div>
              </div>
            );
          })}

          </div>
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
              No relationships to display. Add relationships between CIs first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
