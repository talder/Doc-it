"use client";

import { useState } from "react";
import { X, Send, Loader2, FileBarChart } from "lucide-react";
import type { OnCallEntry } from "@/lib/oncall-shared";
import { buildWeeklyReportHtml, filterOnCallEntries } from "@/lib/oncall-shared";

type Period = "week" | "month" | "year" | "custom";

function getRange(period: Period, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const now = new Date();
  if (period === "week") {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10), label: "On-Call Weekly Report" };
  }
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to, label: "On-Call Monthly Report" };
  }
  if (period === "year") {
    const from = `${now.getFullYear()}-01-01`;
    const to = `${now.getFullYear()}-12-31`;
    return { from, to, label: "On-Call Yearly Report" };
  }
  return { from: customFrom, to: customTo, label: "On-Call Report" };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entries: OnCallEntry[];
}

export default function OnCallReportModal({ isOpen, onClose, entries }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [reportRange, setReportRange] = useState<{ from: string; to: string; label: string } | null>(null);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!isOpen) return null;

  const generate = () => {
    const range = getRange(period, customFrom, customTo);
    const filtered = filterOnCallEntries(entries, { from: range.from, to: range.to });
    const html = buildWeeklyReportHtml(filtered, range.from, range.to, {}, range.label);
    setReportHtml(html);
    setReportRange(range);
    setSendResult(null);
  };

  const sendEmail = async () => {
    if (!email.trim() || !reportRange) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/oncall/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: reportRange.from, to: reportRange.to, email: email.trim(), title: reportRange.label }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ ok: true, msg: `Report sent to ${email.trim()}` });
      } else {
        setSendResult({ ok: false, msg: data.error || "Failed to send" });
      }
    } catch {
      setSendResult({ ok: false, msg: "Network error" });
    }
    setSending(false);
  };

  const handleClose = () => {
    setReportHtml(null);
    setReportRange(null);
    setSendResult(null);
    onClose();
  };

  const periods: { value: Period; label: string }[] = [
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "year", label: "This Year" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="cl-modal-overlay" onClick={handleClose}>
      <div className="cl-modal" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">
            <FileBarChart className="w-4 h-4" />
            Generate Report
          </h2>
          <button onClick={handleClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          {/* Period selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {periods.map((p) => (
              <button
                key={p.value}
                className={`cl-radio${period === p.value ? " cl-radio--active" : ""}`}
                onClick={() => { setPeriod(p.value); setReportHtml(null); setSendResult(null); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {period === "custom" && (
            <div className="flex gap-3 mb-4">
              <div className="cl-field">
                <label className="cl-label">From</label>
                <input type="date" className="cl-input" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setReportHtml(null); }} />
              </div>
              <div className="cl-field">
                <label className="cl-label">To</label>
                <input type="date" className="cl-input" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setReportHtml(null); }} />
              </div>
            </div>
          )}

          {/* Generate button */}
          {!reportHtml && (
            <button className="cl-btn cl-btn--primary" onClick={generate}>
              <FileBarChart className="w-3.5 h-3.5" /> Generate Report
            </button>
          )}

          {/* Report preview */}
          {reportHtml && (
            <>
              <div
                className="border border-border rounded-lg p-4 mb-4 max-h-[50vh] overflow-y-auto bg-white text-gray-900"
                dangerouslySetInnerHTML={{ __html: reportHtml }}
              />

              {/* Email send section */}
              <div className="flex items-end gap-3">
                <div className="cl-field flex-1">
                  <label className="cl-label">Send by email</label>
                  <input
                    type="email"
                    className="cl-input"
                    placeholder="recipient@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setSendResult(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) sendEmail(); }}
                  />
                </div>
                <button
                  className="cl-btn cl-btn--primary flex items-center gap-1"
                  onClick={sendEmail}
                  disabled={sending || !email.trim()}
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              {sendResult && (
                <p className={`text-xs mt-2 ${sendResult.ok ? "text-green-600" : "text-red-500"}`}>{sendResult.msg}</p>
              )}

              {/* Back / regenerate */}
              <div className="cl-modal-footer">
                <button className="cl-btn cl-btn--secondary" onClick={() => { setReportHtml(null); setSendResult(null); }}>← Change period</button>
                <button className="cl-btn cl-btn--secondary" onClick={handleClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
