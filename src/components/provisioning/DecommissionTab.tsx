"use client";

import { useState } from "react";
import {
  AlertTriangle, CheckCircle, Clock, Loader2, Search, Trash2,
  XCircle,
} from "lucide-react";
import type { DecommissionResult, DecommissionStep } from "@/lib/provisioning-shared";

// ── Types ────────────────────────────────────────────────────────────────────

interface NetboxDevice {
  id: number;
  name: string;
  device_type: { model: string; manufacturer: { name: string } };
  site: { name: string } | null;
  primary_ip4: { address: string; dns_name?: string } | null;
  status: { value: string; label: string };
}

const STEP_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  pending: { cls: "text-text-muted",  icon: <Clock className="w-4 h-4" /> },
  running: { cls: "text-blue-500",    icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  done:    { cls: "text-green-600",   icon: <CheckCircle className="w-4 h-4" /> },
  failed:  { cls: "text-red-500",     icon: <XCircle className="w-4 h-4" /> },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function DecommissionTab() {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [devices, setDevices] = useState<NetboxDevice[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);

  // Selected device
  const [selected, setSelected] = useState<NetboxDevice | null>(null);
  const [confirmName, setConfirmName] = useState("");

  // Execution
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<DecommissionResult | null>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError("");
    setDevices([]);
    setSearched(true);
    setSelected(null);
    setResult(null);
    try {
      const res = await fetch(`/api/provisioning/netbox/dcim/devices/?name__ic=${encodeURIComponent(search.trim())}&limit=25`);
      if (!res.ok) {
        setSearchError(`Netbox returned HTTP ${res.status}`);
      } else {
        const d = await res.json();
        setDevices(d.results ?? []);
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    }
    setSearching(false);
  };

  const handleDecommission = async () => {
    if (!selected || confirmName !== selected.name) return;
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch("/api/provisioning/decommission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: selected.name }),
      });
      const data = await res.json() as DecommissionResult;
      setResult(data);
    } catch (e) {
      setResult({
        success: false,
        steps: [],
        error: e instanceof Error ? e.message : "Decommission failed",
        deviceName: selected.name,
      });
    }
    setExecuting(false);
  };

  const reset = () => {
    setSelected(null);
    setConfirmName("");
    setResult(null);
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Trash2 className="w-5 h-5 text-red-500" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">Decommission Device</h2>
            <p className="text-xs text-text-muted">Remove a device from Netbox, DNS, and DHCP in one operation.</p>
          </div>
        </div>

        {/* Search */}
        {!result && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <label className="block text-sm font-medium text-text-primary mb-2">Search Netbox</label>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-surface flex-1">
                <Search className="w-3.5 h-3.5 text-text-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Device name…"
                  className="flex-1 text-sm bg-transparent text-text-primary outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !search.trim()}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>

            {searchError && <p className="text-sm text-red-500 mt-2">{searchError}</p>}

            {/* Results */}
            {searched && !searching && devices.length === 0 && !searchError && (
              <p className="text-sm text-text-muted mt-3">No devices found.</p>
            )}

            {devices.length > 0 && !selected && (
              <div className="mt-3 border border-border rounded-lg divide-y divide-border overflow-hidden">
                {devices.map(dev => {
                  const ip = dev.primary_ip4?.address?.split("/")[0] ?? "—";
                  return (
                    <button
                      key={dev.id}
                      onClick={() => { setSelected(dev); setConfirmName(""); }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-primary">{dev.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          dev.status.value === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}>{dev.status.label}</span>
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {dev.device_type.manufacturer.name} {dev.device_type.model}
                        {dev.site ? ` · ${dev.site.name}` : ""}
                        {` · IP: ${ip}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Selected device detail + confirm */}
        {selected && !result && (
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{selected.name}</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {selected.device_type.manufacturer.name} {selected.device_type.model}
                  {selected.site ? ` · ${selected.site.name}` : ""}
                </p>
              </div>
              <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary">Change</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs font-medium text-text-muted block">IP Address</span>
                <span className="text-text-primary font-mono">{selected.primary_ip4?.address?.split("/")[0] ?? "None"}</span>
              </div>
              <div>
                <span className="text-xs font-medium text-text-muted block">DNS Name</span>
                <span className="text-text-primary font-mono">{selected.primary_ip4?.dns_name || "None"}</span>
              </div>
              <div>
                <span className="text-xs font-medium text-text-muted block">Status</span>
                <span className="text-text-primary">{selected.status.label}</span>
              </div>
              <div>
                <span className="text-xs font-medium text-text-muted block">Netbox ID</span>
                <span className="text-text-primary font-mono">{selected.id}</span>
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">This will permanently delete:</p>
                  <ul className="text-xs text-red-700 mt-1 list-disc ml-4 space-y-0.5">
                    <li>DNS A record (if exists)</li>
                    <li>DHCP reservation (if exists)</li>
                    <li>IP address, interface, and device from Netbox</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Type <strong className="text-red-600">{selected.name}</strong> to confirm
              </label>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                placeholder={selected.name}
              />
            </div>

            <button
              onClick={handleDecommission}
              disabled={executing || confirmName !== selected.name}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {executing ? "Decommissioning…" : "Decommission Device"}
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <div className={`flex items-center gap-2 ${result.success ? "text-green-600" : "text-red-500"}`}>
              {result.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              <h3 className="text-base font-semibold">
                {result.success ? "Device decommissioned" : "Decommission completed with errors"}
              </h3>
            </div>

            <p className="text-sm text-text-muted">
              {result.deviceName}{result.ipAddress ? ` (${result.ipAddress})` : ""}
            </p>

            {result.error && !result.steps.length && (
              <p className="text-sm text-red-600">{result.error}</p>
            )}

            {/* Step display */}
            {result.steps.length > 0 && (
              <div className="space-y-1">
                {result.steps.map(step => {
                  const style = STEP_STYLE[step.status] ?? STEP_STYLE.pending;
                  return (
                    <div key={step.id} className={`flex items-start gap-2.5 py-1.5 ${style.cls}`}>
                      <span className="mt-0.5 shrink-0">{style.icon}</span>
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{step.label}</span>
                        {step.detail && (
                          <p className="text-xs text-text-muted mt-0.5">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => { reset(); setSearch(""); setDevices([]); setSearched(false); }}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Decommission Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
