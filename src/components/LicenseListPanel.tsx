"use client";

import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import type { LicenseComplianceEntry, LicenseComplianceSummary, SoftwareLicenseView } from "@/lib/cmdb";

interface Props {
  licenses: SoftwareLicenseView[];
  compliance: LicenseComplianceEntry[];
  summary: LicenseComplianceSummary;
  onCreate: () => void;
  onEdit: (license: SoftwareLicenseView) => void;
  onDelete: (id: string) => Promise<void>;
}

function statusClasses(status: LicenseComplianceEntry["complianceStatus"]): string {
  switch (status) {
    case "compliant":
      return "bg-green-500/10 text-green-600";
    case "expired":
      return "bg-red-500/10 text-red-600";
    case "under-licensed":
      return "bg-orange-500/10 text-orange-600";
    case "over-licensed":
      return "bg-amber-500/10 text-amber-600";
    default:
      return "bg-muted text-text-muted";
  }
}

function statusLabel(status: LicenseComplianceEntry["complianceStatus"]): string {
  return status.replace(/-/g, " ");
}

export default function LicenseListPanel({ licenses, compliance, summary, onCreate, onEdit, onDelete }: Props) {
  const complianceById = new Map(compliance.map((entry) => [entry.licenseId, entry]));

  return (
    <section className="bg-surface rounded-lg border border-border mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Software Licenses</h3>
            <p className="text-xs text-text-muted">Track license coverage against agent-reported software inventory.</p>
          </div>
        </div>
        <button className="cl-btn cl-btn--primary text-xs py-1.5 px-2.5" onClick={onCreate}>
          <Plus className="w-3.5 h-3.5" /> New License
        </button>
      </div>
      {summary.total > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 text-[10px] font-medium">
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600">{summary.compliant} compliant</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">{summary.overLicensed} over-licensed</span>
          <span className="px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600">{summary.underLicensed} under-licensed</span>
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600">{summary.expired} expired</span>
        </div>
      )}

      {licenses.length === 0 ? (
        <div className="px-4 py-5 text-sm text-text-muted">
          No licenses yet. Add a software license to start tracking compliance against discovered software.
        </div>
      ) : (
        <div className="cl-table-wrap mb-0">
          <table className="cl-table">
            <thead>
              <tr>
                <th className="cl-th">License</th>
                <th className="cl-th">Product</th>
                <th className="cl-th">Type</th>
                <th className="cl-th">Seats</th>
                <th className="cl-th">Installations</th>
                <th className="cl-th">Status</th>
                <th className="cl-th">Expiry</th>
                <th className="cl-th">Key</th>
                <th className="cl-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((license) => {
                const entry = complianceById.get(license.id);
                return (
                  <tr key={license.id} className="cl-tr">
                    <td className="cl-td">
                      <div className="font-medium text-text-primary">{license.name}</div>
                      <div className="text-xs text-text-muted">{license.vendor || "No vendor"}</div>
                    </td>
                    <td className="cl-td">{license.product}</td>
                    <td className="cl-td capitalize">{license.licenseType.replace(/-/g, " ")}</td>
                    <td className="cl-td">{license.totalSeats === 0 ? "Unlimited" : license.totalSeats}</td>
                    <td className="cl-td">{entry?.allocatedCount ?? 0}</td>
                    <td className="cl-td">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusClasses(entry?.complianceStatus || "compliant")}`}>
                        {statusLabel(entry?.complianceStatus || "compliant")}
                      </span>
                    </td>
                    <td className="cl-td">{license.expiryDate || "—"}</td>
                    <td className="cl-td">{license.hasLicenseKey ? license.maskedLicenseKey || "Stored securely" : "—"}</td>
                    <td className="cl-td">
                      <div className="flex items-center gap-2">
                        <button className="p-1 text-text-muted hover:text-accent" onClick={() => onEdit(license)} title="Edit license">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1 text-text-muted hover:text-red-500"
                          onClick={async () => {
                            if (!confirm(`Delete license "${license.name}"?`)) return;
                            await onDelete(license.id);
                          }}
                          title="Delete license"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="cl-table-count">{licenses.length} {licenses.length === 1 ? "license" : "licenses"}</div>
        </div>
      )}
    </section>
  );
}
