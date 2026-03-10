"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, FileCode2, CheckCircle, AlertCircle } from "lucide-react";
import type { Ticket } from "@/lib/helpdesk";

interface CsrInfo {
  id: string;
  name: string;
  subject: { CN?: string; O?: string; OU?: string; C?: string };
  signedCertId?: string;
}

interface CertInfo {
  id: string;
  name: string;
  subject: { CN?: string };
  notAfter: string;
  issuerId?: string;
}

interface StoreSummary {
  csrs: CsrInfo[];
  certs: CertInfo[];
}

interface TicketCertPanelProps {
  ticket: Ticket;
  onUpdated: () => void;
}

export default function TicketCertPanel({ ticket, onUpdated }: TicketCertPanelProps) {
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Linked CSR from custom field
  const linkedCsrId = (ticket.customFields?.cert_csr_id as string | undefined) ?? "";

  const [selectedCsrId, setSelectedCsrId] = useState(linkedCsrId);
  const [selectedCaId, setSelectedCaId] = useState("");
  const [certName, setCertName] = useState("");
  const [validityDays, setValidityDays] = useState(365);

  useEffect(() => {
    fetch("/api/admin/certificates")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setStore({ csrs: data.csrs, certs: data.certs });
      })
      .finally(() => setLoading(false));
  }, []);

  // Update selectedCsrId if ticket's customField changes
  useEffect(() => {
    if (linkedCsrId) setSelectedCsrId(linkedCsrId);
  }, [linkedCsrId]);

  const linkedCsr = store?.csrs.find((c) => c.id === selectedCsrId);
  const caCerts = store?.certs.filter((c) => c.subject.CN) ?? [];

  const flash = (m: string, type: "ok" | "err") => {
    if (type === "ok") { setMsg(m); setError(""); }
    else { setError(m); setMsg(""); }
    setTimeout(() => { setMsg(""); setError(""); }, 4000);
  };

  const linkCsr = async (csrId: string) => {
    setSelectedCsrId(csrId);
    // Persist to ticket custom field
    await fetch("/api/helpdesk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateTicket",
        id: ticket.id,
        customFields: { ...ticket.customFields, cert_csr_id: csrId },
      }),
    });
    onUpdated();
  };

  const signAndIssue = async () => {
    if (!selectedCsrId) { flash("Select a CSR first", "err"); return; }
    if (!selectedCaId) { flash("Select a CA certificate", "err"); return; }
    if (!certName.trim()) { flash("Certificate name is required", "err"); return; }
    setWorking(true);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signCsr",
          csrId: selectedCsrId,
          caId: selectedCaId,
          certName: certName.trim(),
          validityDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign failed");

      // Leave internal comment on ticket
      await fetch("/api/helpdesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addComment",
          ticketId: ticket.id,
          content: `Certificate issued: **${certName.trim()}** (ID: ${data.certId ?? "—"}). Valid for ${validityDays} days. Signed with CA cert ID ${selectedCaId}.`,
          isInternal: true,
        }),
      });

      // Mark ticket resolved
      await fetch("/api/helpdesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateTicket", id: ticket.id, status: "Resolved" }),
      });

      flash(`Certificate "${certName}" issued successfully. Ticket resolved.`, "ok");
      onUpdated();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Error signing CSR", "err");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 p-3 border border-border rounded-lg bg-gray-50 text-sm text-text-muted">
        Loading certificate store…
      </div>
    );
  }

  return (
    <div className="mt-4 border border-blue-200 rounded-lg bg-blue-50 overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-100 flex items-center gap-2 border-b border-blue-200">
        <ShieldCheck className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-semibold text-blue-900">Certificate Request</h4>
      </div>

      <div className="p-4 space-y-4">
        {msg && (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-green-800 text-xs">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {msg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* CSR picker */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            <FileCode2 className="w-3.5 h-3.5 inline mr-1" />
            Linked CSR
          </label>
          {store?.csrs.length === 0 ? (
            <p className="text-xs text-text-muted">No CSRs found in certificate store.</p>
          ) : (
            <select
              value={selectedCsrId}
              onChange={(e) => linkCsr(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-border rounded"
            >
              <option value="">Select CSR…</option>
              {store?.csrs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.subject.CN || "No CN"}){c.signedCertId ? " ✓ signed" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* CSR details */}
        {linkedCsr && (
          <div className="text-xs space-y-1 p-3 bg-white rounded border border-blue-200">
            <p className="font-semibold text-gray-700">{linkedCsr.name}</p>
            {linkedCsr.subject.CN && <p><span className="text-text-muted">CN:</span> {linkedCsr.subject.CN}</p>}
            {linkedCsr.subject.O && <p><span className="text-text-muted">O:</span> {linkedCsr.subject.O}</p>}
            {linkedCsr.subject.OU && <p><span className="text-text-muted">OU:</span> {linkedCsr.subject.OU}</p>}
            {linkedCsr.subject.C && <p><span className="text-text-muted">C:</span> {linkedCsr.subject.C}</p>}
            {linkedCsr.signedCertId && (
              <p className="text-green-700 font-medium">✓ Already signed — cert ID: {linkedCsr.signedCertId}</p>
            )}
          </div>
        )}

        {/* Sign & Issue */}
        {linkedCsr && !linkedCsr.signedCertId && (
          <div className="space-y-2 pt-2 border-t border-blue-200">
            <p className="text-xs font-semibold text-gray-600">Sign &amp; Issue Certificate</p>
            <input
              value={certName}
              onChange={(e) => setCertName(e.target.value)}
              placeholder="Certificate name"
              className="w-full px-2 py-1.5 text-sm border border-border rounded"
            />
            <div className="flex gap-2">
              <select
                value={selectedCaId}
                onChange={(e) => setSelectedCaId(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-border rounded"
              >
                <option value="">Select CA…</option>
                {caCerts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.subject.CN})</option>
                ))}
              </select>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="w-24 px-2 py-1.5 text-sm border border-border rounded"
                placeholder="Days"
                min={1}
              />
            </div>
            <button
              onClick={signAndIssue}
              disabled={working || !selectedCaId || !certName.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {working ? "Issuing…" : "Sign & Issue Certificate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
