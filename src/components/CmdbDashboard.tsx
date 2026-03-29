"use client";

import type { CmdbItem, CmdbItemType, LicenseComplianceSummary } from "@/lib/cmdb";

interface Props {
  assets: CmdbItem[];
  assetTypes: CmdbItemType[];
  licenseComplianceSummary?: LicenseComplianceSummary;
  agentStats?: { total: number; withAgent: number; stale: number; coverage: number };
  complianceSummary?: { avgScore: number; fullCompliance: number; nonCompliant: number };
  costSummary?: { totalPurchase: number; totalMonthly: number; totalAnnual: number; currency: string };
  dataQuality?: { avgScore: number; perfect: number; poor: number };
  vulnerabilityCount?: { open: number; critical: number };
  expiryAlerts?: { type: string; itemName: string; daysRemaining: number }[];
  duplicateCount?: number;
}

const STATUS_COLORS: Record<string, string> = {
  Active: "#16a34a",
  Maintenance: "#d97706",
  Decommissioned: "#6b7280",
  Ordered: "#3b82f6",
};

export default function CmdbDashboard({ assets, assetTypes, licenseComplianceSummary, agentStats, complianceSummary, costSummary, dataQuality, vulnerabilityCount, expiryAlerts, duplicateCount }: Props) {
  if (assets.length === 0) return null;

  // Status breakdown
  const byStatus: Record<string, number> = {};
  for (const a of assets) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  const total = assets.length;

  // Type breakdown (top 6)
  const byType: Record<string, number> = {};
  for (const a of assets) {
    const t = assetTypes.find((t) => t.id === a.typeId);
    const name = t?.name || a.type || "Unknown";
    byType[name] = (byType[name] || 0) + 1;
  }
  const typeEntries = Object.entries(byType).sort(([, a], [, b]) => b - a).slice(0, 6);
  const maxTypeCount = typeEntries[0]?.[1] || 1;

  // Warranty warnings (next 30 days)
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);
  const nowStr = now.toISOString().slice(0, 10);
  const thirtyStr = thirtyDays.toISOString().slice(0, 10);
  const expiringWarranty = assets.filter((a) => a.warrantyExpiry && a.warrantyExpiry >= nowStr && a.warrantyExpiry <= thirtyStr);

  // Checked out count
  const checkedOut = assets.filter((a) => a.assignedTo).length;

  // Recently modified (last 5)
  const recent = [...assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const licenseSummary = licenseComplianceSummary || { compliant: 0, expired: 0, overLicensed: 0, underLicensed: 0, total: 0 };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4">
      {/* Total */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-text-muted uppercase font-semibold">Total Assets</p>
        <p className="text-2xl font-bold text-text-primary">{total}</p>
      </div>

      {/* Status bar */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-text-muted uppercase font-semibold mb-2">By Status</p>
        <div className="flex h-4 rounded-full overflow-hidden">
          {Object.entries(byStatus).map(([status, count]) => (
            <div
              key={status}
              className="h-full"
              style={{ width: `${(count / total) * 100}%`, background: STATUS_COLORS[status] || "#6b7280" }}
              title={`${status}: ${count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          {Object.entries(byStatus).map(([status, count]) => (
            <span key={status} className="text-[10px] text-text-muted flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_COLORS[status] || "#6b7280" }} />
              {status} {count}
            </span>
          ))}
        </div>
      </div>

      {/* Type bars */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3 sm:col-span-2 xl:col-span-1">
        <p className="text-xs text-text-muted uppercase font-semibold mb-2">By Type</p>
        <div className="space-y-1.5">
          {typeEntries.map(([name, count]) => {
            const t = assetTypes.find((t) => t.name === name);
            return (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 w-28 truncate text-text-muted" title={name}>{t?.icon || "📦"} {name}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(count / maxTypeCount) * 100}%`, background: t?.color || "#6b7280" }} />
                </div>
                <span className="text-text-muted shrink-0 w-5 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-text-muted uppercase font-semibold mb-1">Alerts</p>
        <div className="space-y-1 text-xs">
          {checkedOut > 0 && (
            <p className="text-text-secondary">📤 <strong>{checkedOut}</strong> checked out</p>
          )}
          {expiringWarranty.length > 0 && (
            <p className="text-orange-500">⚠️ <strong>{expiringWarranty.length}</strong> warranty expiring within 30 days</p>
          )}
          {expiringWarranty.length === 0 && checkedOut === 0 && (
            <p className="text-text-muted italic">No alerts</p>
          )}
        </div>
        <p className="text-[10px] text-text-muted mt-2">Recently updated:</p>
        {recent.slice(0, 3).map((a) => (
          <p key={a.id} className="text-[10px] text-text-muted truncate">{a.name} — {new Date(a.updatedAt).toLocaleDateString()}</p>
        ))}
      </div>

      {/* License compliance */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-text-muted uppercase font-semibold mb-1">License Compliance</p>
        {licenseSummary.total === 0 ? (
          <p className="text-xs text-text-muted italic">No licenses defined</p>
        ) : (
          <div className="space-y-1 text-xs">
            <p className="text-green-600"><strong>{licenseSummary.compliant}</strong> compliant</p>
            <p className="text-amber-600"><strong>{licenseSummary.overLicensed}</strong> over-licensed</p>
            <p className="text-orange-600"><strong>{licenseSummary.underLicensed}</strong> under-licensed</p>
            <p className="text-red-600"><strong>{licenseSummary.expired}</strong> expired</p>
          </div>
        )}
      </div>

      {/* Agent coverage */}
      {agentStats && agentStats.total > 0 && (
        <div className="bg-surface rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-text-muted uppercase font-semibold mb-1">Agent Coverage</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${agentStats.coverage}%` }} />
              </div>
              <span className="font-bold text-text-primary">{agentStats.coverage}%</span>
            </div>
            <p className="text-text-secondary">{agentStats.withAgent}/{agentStats.total} CIs reporting</p>
            {agentStats.stale > 0 && <p className="text-orange-500">⚠️ {agentStats.stale} stale (&gt;7 days)</p>}
          </div>
        </div>
      )}

      {/* Compliance */}
      {complianceSummary && (
        <div className="bg-surface rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-text-muted uppercase font-semibold mb-1">Compliance</p>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${complianceSummary.avgScore}%`, background: complianceSummary.avgScore >= 80 ? "#16a34a" : complianceSummary.avgScore >= 50 ? "#d97706" : "#dc2626" }} />
            </div>
            <span className="text-xs font-bold text-text-primary">{complianceSummary.avgScore}%</span>
          </div>
          <div className="text-[10px] text-text-muted">
            <span className="text-green-600">{complianceSummary.fullCompliance} fully compliant</span>
            {complianceSummary.nonCompliant > 0 && <span className="text-red-600 ml-2">{complianceSummary.nonCompliant} non-compliant</span>}
          </div>
        </div>
      )}

      {/* Data Quality */}
      {dataQuality && (
        <div className="bg-surface rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-text-muted uppercase font-semibold mb-1">Data Quality</p>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${dataQuality.avgScore}%` }} />
            </div>
            <span className="text-xs font-bold text-text-primary">{dataQuality.avgScore}%</span>
          </div>
          <div className="text-[10px] text-text-muted">
            {dataQuality.perfect > 0 && <span className="text-green-600">{dataQuality.perfect} complete</span>}
            {dataQuality.poor > 0 && <span className="text-orange-600 ml-2">{dataQuality.poor} incomplete</span>}
          </div>
        </div>
      )}

      {/* Cost Summary */}
      {costSummary && costSummary.totalPurchase > 0 && (
        <div className="bg-surface rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-text-muted uppercase font-semibold mb-1">TCO</p>
          <div className="space-y-0.5 text-xs">
            <p className="text-text-primary"><strong>€{costSummary.totalPurchase.toLocaleString()}</strong> purchase</p>
            <p className="text-text-secondary">€{costSummary.totalMonthly.toLocaleString()}/mo · €{costSummary.totalAnnual.toLocaleString()}/yr</p>
          </div>
        </div>
      )}

      {/* Vulnerabilities + Alerts */}
      <div className="bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-text-muted uppercase font-semibold mb-1">Security & Alerts</p>
        <div className="space-y-0.5 text-xs">
          {vulnerabilityCount && vulnerabilityCount.open > 0 ? (
            <>
              <p className="text-orange-600">🛡️ {vulnerabilityCount.open} open vulnerabilities</p>
              {vulnerabilityCount.critical > 0 && <p className="text-red-600">🚨 {vulnerabilityCount.critical} critical</p>}
            </>
          ) : <p className="text-green-600">✓ No open vulnerabilities</p>}
          {duplicateCount && duplicateCount > 0 && <p className="text-amber-600">⚠ {duplicateCount} duplicate groups</p>}
          {expiryAlerts && expiryAlerts.length > 0 && (
            <>
              <p className="text-orange-500 mt-1">🕔 {expiryAlerts.length} upcoming expiries</p>
              {expiryAlerts.slice(0, 2).map((a, i) => <p key={i} className="text-[10px] text-text-muted truncate">{a.itemName} — {a.daysRemaining}d</p>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
