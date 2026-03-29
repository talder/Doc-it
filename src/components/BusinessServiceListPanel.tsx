"use client";

import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import type { BusinessService, ServiceCriticality, ServiceStatus } from "@/lib/cmdb";

interface Props {
  services: BusinessService[];
  onCreate: () => void;
  onEdit: (service: BusinessService) => void;
  onDelete: (id: string) => Promise<void>;
}

function critClasses(c: ServiceCriticality): string {
  switch (c) {
    case "critical": return "bg-red-500/10 text-red-600";
    case "high": return "bg-orange-500/10 text-orange-600";
    case "medium": return "bg-amber-500/10 text-amber-600";
    case "low": return "bg-green-500/10 text-green-600";
  }
}

function statusClasses(s: ServiceStatus): string {
  switch (s) {
    case "operational": return "bg-green-500/10 text-green-600";
    case "degraded": return "bg-amber-500/10 text-amber-600";
    case "outage": return "bg-red-500/10 text-red-600";
    case "planned": return "bg-blue-500/10 text-blue-600";
  }
}

export default function BusinessServiceListPanel({ services, onCreate, onEdit, onDelete }: Props) {
  const counts = {
    operational: services.filter((s) => s.status === "operational").length,
    degraded: services.filter((s) => s.status === "degraded").length,
    outage: services.filter((s) => s.status === "outage").length,
    planned: services.filter((s) => s.status === "planned").length,
  };

  return (
    <section className="bg-surface rounded-lg border border-border mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Business Services</h3>
            <p className="text-xs text-text-muted">Logical services composed of infrastructure assets.</p>
          </div>
        </div>
        <button className="cl-btn cl-btn--primary text-xs py-1.5 px-2.5" onClick={onCreate}>
          <Plus className="w-3.5 h-3.5" /> New Service
        </button>
      </div>
      {services.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 text-[10px] font-medium">
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600">{counts.operational} operational</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">{counts.degraded} degraded</span>
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600">{counts.outage} outage</span>
          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">{counts.planned} planned</span>
        </div>
      )}

      {services.length === 0 ? (
        <div className="px-4 py-5 text-sm text-text-muted">
          No business services yet. Define services to group assets and enable impact analysis.
        </div>
      ) : (
        <div className="cl-table-wrap mb-0">
          <table className="cl-table">
            <thead>
              <tr>
                <th className="cl-th">Service</th>
                <th className="cl-th">Owner</th>
                <th className="cl-th">Criticality</th>
                <th className="cl-th">Status</th>
                <th className="cl-th">Assets</th>
                <th className="cl-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id} className="cl-tr">
                  <td className="cl-td">
                    <div className="font-medium text-text-primary">{svc.name}</div>
                    <div className="text-xs text-text-muted">{svc.id}</div>
                  </td>
                  <td className="cl-td">{svc.owner || "—"}</td>
                  <td className="cl-td">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${critClasses(svc.criticality)}`}>
                      {svc.criticality}
                    </span>
                  </td>
                  <td className="cl-td">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusClasses(svc.status)}`}>
                      {svc.status}
                    </span>
                  </td>
                  <td className="cl-td">{svc.memberAssetIds.length}</td>
                  <td className="cl-td">
                    <div className="flex items-center gap-2">
                      <button className="p-1 text-text-muted hover:text-accent" onClick={() => onEdit(svc)} title="Edit service">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1 text-text-muted hover:text-red-500"
                        onClick={async () => {
                          if (!confirm(`Delete service "${svc.name}"?`)) return;
                          await onDelete(svc.id);
                        }}
                        title="Delete service"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cl-table-count">{services.length} {services.length === 1 ? "service" : "services"}</div>
        </div>
      )}
    </section>
  );
}
