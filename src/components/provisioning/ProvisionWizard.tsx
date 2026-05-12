"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle, ChevronRight,
  Clock, ExternalLink, History, Loader2, Monitor, RefreshCw,
  Server, Shield, X, XCircle, Printer, Laptop, Box,
  HardDrive, Database, Network, Wifi, Cloud, Cpu, Smartphone, Globe,
} from "lucide-react";
import type {
  DeviceProfile, NetboxManufacturer, NetboxDeviceType, NetboxSite,
  NetboxVlan, NetboxPrefix, NetboxDeviceRole,
  ProvisioningRequest, PreflightResult,
  ProvisioningResult, ProvisioningHistoryEntry,
} from "@/lib/provisioning-shared";
import { isValidMac, normalizeMac, isValidIpv4 } from "@/lib/provisioning-shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const PROFILE_ICONS: Record<string, React.ReactNode> = {
  "🖨": <Printer className="w-6 h-6" />,
  "🖥": <Monitor className="w-6 h-6" />,
  "💻": <Laptop className="w-6 h-6" />,
  "🖧": <Server className="w-6 h-6" />,
  "📦": <Box className="w-6 h-6" />,
  server: <Server className="w-6 h-6" />,
  monitor: <Monitor className="w-6 h-6" />,
  laptop: <Laptop className="w-6 h-6" />,
  printer: <Printer className="w-6 h-6" />,
  "hard-drive": <HardDrive className="w-6 h-6" />,
  database: <Database className="w-6 h-6" />,
  network: <Network className="w-6 h-6" />,
  wifi: <Wifi className="w-6 h-6" />,
  shield: <Shield className="w-6 h-6" />,
  cloud: <Cloud className="w-6 h-6" />,
  cpu: <Cpu className="w-6 h-6" />,
  smartphone: <Smartphone className="w-6 h-6" />,
  box: <Box className="w-6 h-6" />,
  globe: <Globe className="w-6 h-6" />,
};

function ProfileIcon({ icon }: { icon: string }) {
  return PROFILE_ICONS[icon] ?? <span className="text-2xl">{icon}</span>;
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  pending:     { cls: "text-text-muted",   icon: <Clock className="w-4 h-4" /> },
  running:     { cls: "text-blue-500",     icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  pass:        { cls: "text-green-600",    icon: <CheckCircle className="w-4 h-4" /> },
  done:        { cls: "text-green-600",    icon: <CheckCircle className="w-4 h-4" /> },
  fail:        { cls: "text-red-500",      icon: <XCircle className="w-4 h-4" /> },
  failed:      { cls: "text-red-500",      icon: <XCircle className="w-4 h-4" /> },
  warn:        { cls: "text-amber-500",    icon: <AlertTriangle className="w-4 h-4" /> },
  skip:        { cls: "text-text-muted",   icon: <ArrowRight className="w-4 h-4" /> },
  "rolled-back": { cls: "text-amber-500",  icon: <RefreshCw className="w-4 h-4" /> },
};

// ── Netbox data fetcher ──────────────────────────────────────────────────────

function useNetboxList<T>(path: string, enabled = true): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(`/api/provisioning/netbox${path}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.results) setData(d.results); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [path, enabled]);
  return { data, loading };
}

// ── Step types ───────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Profile",
  2: "Device Details",
  3: "Network",
  4: "Pre-flight",
  5: "Execute",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ProvisionWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [showHistory, setShowHistory] = useState(false);

  // Profiles
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<DeviceProfile | null>(null);

  // Device details (step 2)
  const [deviceName, setDeviceName] = useState("");
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [deviceTypeId, setDeviceTypeId] = useState<number | null>(null);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [assetTag, setAssetTag] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [comment, setComment] = useState("");

  // Network (step 3)
  const [vlanId, setVlanId] = useState<number | null>(null);
  const [prefixId, setPrefixId] = useState<number | null>(null);
  const [ipAllocation, setIpAllocation] = useState<"auto" | "manual">("auto");
  const [manualIp, setManualIp] = useState("");
  const [dnsZone, setDnsZone] = useState("");
  const [dhcpScope, setDhcpScope] = useState("");

  // Agent reference data (DNS zones, DHCP scopes)
  const [dnsZones, setDnsZones] = useState<{ name: string }[]>([]);
  const [dhcpScopes, setDhcpScopes] = useState<{ scopeId: string; name: string }[]>([]);

  // Preflight (step 4)
  const [preflightResults, setPreflightResults] = useState<PreflightResult[]>([]);
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightIp, setPreflightIp] = useState<string | null>(null);

  // Execute (step 5)
  const [result, setResult] = useState<ProvisioningResult | null>(null);
  const [executing, setExecuting] = useState(false);

  // History
  const [history, setHistory] = useState<ProvisioningHistoryEntry[]>([]);

  // Reference data
  const { data: manufacturers } = useNetboxList<NetboxManufacturer>("/dcim/manufacturers/?limit=1000", step >= 2);
  const { data: allDeviceTypes } = useNetboxList<NetboxDeviceType>(
    vendorId ? `/dcim/device-types/?manufacturer_id=${vendorId}&limit=1000` : "/dcim/device-types/?limit=0",
    step >= 2 && vendorId != null,
  );
  const { data: sites } = useNetboxList<NetboxSite>("/dcim/sites/?limit=1000", step >= 2);
  const { data: vlans } = useNetboxList<NetboxVlan>("/ipam/vlans/?limit=1000", step >= 3);
  const { data: prefixes } = useNetboxList<NetboxPrefix>("/ipam/prefixes/?limit=1000", step >= 3);
  useNetboxList<NetboxDeviceRole>("/dcim/device-roles/?limit=1000", step >= 2);

  // Load profiles
  useEffect(() => {
    fetch("/api/provisioning/device-profiles")
      .then(r => r.ok ? r.json() : null)
      .then(d => setProfiles(d?.profiles ?? []))
      .catch(() => {});
  }, []);

  // Load history
  useEffect(() => {
    if (showHistory) {
      fetch("/api/provisioning/history")
        .then(r => r.ok ? r.json() : null)
        .then(d => setHistory(d?.entries ?? []))
        .catch(() => {});
    }
  }, [showHistory]);

  // Filter manufacturers by profile's manufacturer_filter
  const filteredManufacturers = useMemo(() => {
    if (!selectedProfile?.manufacturerFilter?.length) return manufacturers;
    const ids = new Set(selectedProfile.manufacturerFilter);
    return manufacturers.filter(m => ids.has(m.id));
  }, [manufacturers, selectedProfile]);

  // Fetch DNS zones and DHCP scopes from the agents (via backend proxy)
  useEffect(() => {
    if (step < 3) return;
    fetch("/api/provisioning/agent/dns/zones")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.zones) setDnsZones(d.zones); })
      .catch(() => {});
    fetch("/api/provisioning/agent/dhcp/scopes")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.scopes) setDhcpScopes(d.scopes); })
      .catch(() => {});
  }, [step]);

  // Auto-set defaults when profile is selected
  useEffect(() => {
    if (selectedProfile) {
      setVlanId(selectedProfile.defaultVlanId);
      setPrefixId(selectedProfile.defaultPrefixId);
      if (selectedProfile.defaultDnsZone) setDnsZone(selectedProfile.defaultDnsZone);
      if (selectedProfile.defaultDhcpScope) setDhcpScope(selectedProfile.defaultDhcpScope);
    }
  }, [selectedProfile]);

  // Step validation
  const step2Valid = deviceName.trim() && deviceTypeId && siteId && isValidMac(macAddress);
  const step3Valid = prefixId && (ipAllocation === "auto" || isValidIpv4(manualIp));
  const preflightPassed = preflightResults.length > 0 && preflightResults.every(r => r.status === "pass" || r.status === "skip");

  // Build request object
  const buildRequest = useCallback((): ProvisioningRequest => ({
    profileId: selectedProfile?.id ?? "",
    deviceName: deviceName.trim(),
    deviceTypeId: deviceTypeId!,
    siteId: siteId!,
    assetTag: assetTag.trim() || undefined,
    macAddress: normalizeMac(macAddress),
    comment: comment.trim(),
    vlanId,
    prefixId: prefixId!,
    ipAllocation,
    manualIp: ipAllocation === "manual" ? manualIp.trim() : undefined,
    dnsZone: dnsZone || "sezz.local",
    dhcpScope,
  }), [selectedProfile, deviceName, deviceTypeId, siteId, assetTag, macAddress, comment, vlanId, prefixId, ipAllocation, manualIp, dnsZone, dhcpScope]);

  const runPreflight = async () => {
    setPreflightRunning(true);
    setPreflightResults([]);
    setPreflightIp(null);
    try {
      const r = await fetch("/api/provisioning/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest()),
      });
      const d = await r.json();
      setPreflightResults(d.results ?? []);
      if (d.allocatedIp) setPreflightIp(d.allocatedIp);
    } catch { setPreflightResults([]); }
    setPreflightRunning(false);
  };

  const runExecute = async () => {
    setExecuting(true);
    setResult(null);
    try {
      const r = await fetch("/api/provisioning/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest()),
      });
      const d = await r.json() as ProvisioningResult;
      setResult(d);
    } catch (err) {
      setResult({ success: false, steps: [], error: err instanceof Error ? err.message : "Request failed" });
    }
    setExecuting(false);
  };

  const reset = () => {
    setStep(1);
    setSelectedProfile(null);
    setDeviceName(""); setVendorId(null); setDeviceTypeId(null);
    setSiteId(null); setAssetTag(""); setMacAddress(""); setComment("");
    setVlanId(null); setPrefixId(null); setIpAllocation("auto"); setManualIp("");
    setDnsZone(""); setDhcpScope("");
    setPreflightResults([]); setPreflightIp(null); setResult(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Main content */}
      <div className="flex-1 overflow-auto px-6 py-6">

        {/* Step breadcrumb */}
        {selectedProfile && step > 1 && (
          <div className="flex items-center gap-1 text-xs text-text-muted mb-4">
            {([1, 2, 3, 4, 5] as WizardStep[]).map(s => (
              <span key={s} className="flex items-center gap-0.5">
                {s > 1 && <ChevronRight className="w-3 h-3" />}
                <span className={`px-1.5 py-0.5 rounded ${s === step ? "bg-accent text-white font-medium" : s < step ? "text-accent" : ""}`}>
                  {STEP_LABELS[s]}
                </span>
              </span>
            ))}
            <button onClick={() => setShowHistory(v => !v)}
              className={`ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${showHistory ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:bg-muted"}`}>
              <History className="w-3 h-3" /> History
            </button>
          </div>
        )}
        {step === 1 && (
          <div className="flex items-center justify-between mb-4">
            <div />
            <button onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${showHistory ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:bg-muted"}`}>
              <History className="w-3 h-3" /> History
            </button>
          </div>
        )}

        {/* Step 1: Profile selection */}
        {step === 1 && (
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-1">Select Device Type</h2>
            <p className="text-sm text-text-muted mb-6">Choose the type of device you want to register.</p>
            {profiles.length === 0 ? (
              <div className="text-center py-16 text-text-muted">
                <Box className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No device profiles configured</p>
                <p className="text-xs mt-1">Ask an admin to set up profiles in Admin → Provisioning.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {profiles.map(p => (
                  <button key={p.id}
                    onClick={() => { setSelectedProfile(p); setStep(2); }}
                    className="text-left bg-surface border border-border rounded-xl p-5 hover:border-accent hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent/20 transition-colors">
                        <ProfileIcon icon={p.icon} />
                      </div>
                      <span className="font-semibold text-text-primary group-hover:text-accent transition-colors">{p.name}</span>
                    </div>
                    {p.requiresAssetTag && <span className="text-[10px] text-text-muted">Requires asset tag</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Device Details */}
        {step === 2 && (
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-text-primary mb-4">Device Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Device Name *</label>
                <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. PRN-FLOOR2-01"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Vendor / Manufacturer *</label>
                  <select value={vendorId ?? ""} onChange={e => { setVendorId(Number(e.target.value) || null); setDeviceTypeId(null); }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                    <option value="">Select vendor…</option>
                    {filteredManufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Device Type *</label>
                  <select value={deviceTypeId ?? ""} onChange={e => setDeviceTypeId(Number(e.target.value) || null)}
                    disabled={!vendorId}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent disabled:opacity-50">
                    <option value="">Select type…</option>
                    {allDeviceTypes.map(t => <option key={t.id} value={t.id}>{t.model}{t.part_number ? ` (${t.part_number})` : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Site *</label>
                  <select value={siteId ?? ""} onChange={e => setSiteId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                    <option value="">Select site…</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Asset Tag {selectedProfile?.requiresAssetTag ? "*" : "(optional)"}
                  </label>
                  <input value={assetTag} onChange={e => setAssetTag(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">MAC Address *</label>
                <input value={macAddress} onChange={e => setMacAddress(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF"
                  className={`w-full px-3 py-2 text-sm font-mono border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent ${macAddress && !isValidMac(macAddress) ? "border-red-400" : "border-border"}`} />
                {macAddress && !isValidMac(macAddress) && (
                  <p className="text-[10px] text-red-500 mt-0.5">Invalid MAC address format</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Comment / Description</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent resize-none" />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => { setStep(1); setSelectedProfile(null); }} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <button onClick={() => setStep(3)} disabled={!step2Valid}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Network Configuration */}
        {step === 3 && (
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-text-primary mb-4">Network Configuration</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">VLAN</label>
                  <select value={vlanId ?? ""} onChange={e => setVlanId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                    <option value="">Auto / None</option>
                    {vlans.map(v => <option key={v.id} value={v.id}>VLAN {v.vid} — {v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">IP Prefix *</label>
                  <select value={prefixId ?? ""} onChange={e => setPrefixId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                    <option value="">Select prefix…</option>
                    {prefixes.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.prefix}{p.vlan ? ` (VLAN ${p.vlan.vid})` : ""}{p.description ? ` — ${p.description}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">IP Allocation</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={ipAllocation === "auto"} onChange={() => setIpAllocation("auto")} className="rounded" />
                    <span className="text-sm text-text-secondary">Auto (next free from prefix)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={ipAllocation === "manual"} onChange={() => setIpAllocation("manual")} className="rounded" />
                    <span className="text-sm text-text-secondary">Manual IP</span>
                  </label>
                </div>
                {ipAllocation === "manual" && (
                  <input value={manualIp} onChange={e => setManualIp(e.target.value)} placeholder="e.g. 172.24.152.50"
                    className={`mt-2 w-64 px-3 py-2 text-sm font-mono border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent ${manualIp && !isValidIpv4(manualIp) ? "border-red-400" : "border-border"}`} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">DNS Zone *</label>
                  {dnsZones.length > 0 ? (
                    <select value={dnsZone} onChange={e => setDnsZone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                      <option value="">Select zone…</option>
                      {dnsZones.map(z => <option key={z.name} value={z.name}>{z.name}</option>)}
                    </select>
                  ) : (
                    <input value={dnsZone} onChange={e => setDnsZone(e.target.value)} placeholder="e.g. sezz.local"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
                  )}
                  {selectedProfile?.defaultDnsZone && dnsZone !== selectedProfile.defaultDnsZone && (
                    <p className="text-[10px] text-amber-500 mt-0.5">Profile default: {selectedProfile.defaultDnsZone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">DHCP Scope</label>
                  {dhcpScopes.length > 0 ? (
                    <select value={dhcpScope} onChange={e => setDhcpScope(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent">
                      <option value="">Default from config</option>
                      {dhcpScopes.map(s => <option key={s.scopeId} value={s.scopeId}>{s.scopeId} — {s.name}</option>)}
                    </select>
                  ) : (
                    <input value={dhcpScope} onChange={e => setDhcpScope(e.target.value)} placeholder="auto from config"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:border-accent" />
                  )}
                  {selectedProfile?.defaultDhcpScope && dhcpScope !== selectedProfile.defaultDhcpScope && (
                    <p className="text-[10px] text-amber-500 mt-0.5">Profile default: {selectedProfile.defaultDhcpScope}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <button onClick={() => { setStep(4); runPreflight(); }} disabled={!step3Valid}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                Run Pre-flight Checks <Shield className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Pre-flight Checks */}
        {step === 4 && (
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-text-primary mb-4">Pre-flight Checks</h2>
            {preflightIp && (
              <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-200">
                <Network className="w-3.5 h-3.5 flex-shrink-0" />
                Next available IP: <span className="font-mono font-semibold">{preflightIp}</span>
                <span className="text-blue-500">(will be allocated on execution)</span>
              </div>
            )}
            <div className="border border-border rounded-xl overflow-hidden">
              {preflightRunning && preflightResults.length === 0 ? (
                <div className="flex items-center justify-center py-10 gap-2 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin" /> Running checks…
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {preflightResults.map(r => {
                    const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={s.cls}>{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{r.label}</p>
                          <p className="text-xs text-text-muted truncate">{r.message}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                          r.status === "pass" ? "bg-green-50 text-green-700 border-green-200" :
                          r.status === "fail" ? "bg-red-50 text-red-700 border-red-200" :
                          r.status === "warn" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>{r.status}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {preflightResults.length > 0 && !preflightPassed && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                Some checks failed. Fix the issues and re-run, or go back to adjust.
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <div className="flex gap-2">
                <button onClick={runPreflight} disabled={preflightRunning}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted text-text-secondary disabled:opacity-40">
                  <RefreshCw className={`w-3.5 h-3.5 ${preflightRunning ? "animate-spin" : ""}`} /> Re-run
                </button>
                <button onClick={() => setStep(5)} disabled={!preflightPassed}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                  Proceed to Execute <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Execute */}
        {step === 5 && (
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-text-primary mb-2">Execute Provisioning</h2>
            {!result && !executing && (
              <div className="mb-6">
                <div className="bg-surface border border-border rounded-xl p-4 mb-4">
                  <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Summary</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-text-muted">Device:</span><span className="text-text-primary font-medium">{deviceName}</span>
                    <span className="text-text-muted">Profile:</span><span className="text-text-primary">{selectedProfile?.name}</span>
                    <span className="text-text-muted">MAC:</span><span className="text-text-primary font-mono">{normalizeMac(macAddress)}</span>
                    <span className="text-text-muted">IP:</span><span className="text-text-primary font-mono">{ipAllocation === "auto" ? (preflightIp ? `${preflightIp} (auto)` : "Auto-allocated") : manualIp}</span>
                    <span className="text-text-muted">DNS:</span><span className="text-text-primary">{deviceName}.{dnsZone || "sezz.local"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-200 mb-4">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  This will create real resources in Netbox, DNS and DHCP. The process will roll back on failure.
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep(4)} className="px-4 py-2 text-sm text-text-muted hover:bg-muted rounded-lg">
                    <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
                  </button>
                  <button onClick={runExecute}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <Check className="w-4 h-4" /> Execute Provisioning
                  </button>
                </div>
              </div>
            )}

            {/* Pipeline progress */}
            {(executing || result) && (
              <div className="border border-border rounded-xl overflow-hidden mb-4">
                <div className="divide-y divide-border">
                  {(result?.steps ?? []).map(s => {
                    const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.pending;
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={st.cls}>{st.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{s.label}</p>
                          {s.detail && <p className="text-xs text-text-muted">{s.detail}</p>}
                        </div>
                        {s.resourceUrl && (
                          <a href={s.resourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-accent hover:underline flex items-center gap-0.5">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
                {executing && (
                  <div className="flex items-center justify-center py-4 gap-2 text-blue-500 border-t border-border">
                    <Loader2 className="w-4 h-4 animate-spin" /> Executing…
                  </div>
                )}
              </div>
            )}

            {/* Result banner */}
            {result && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${
                result.success
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-600"
              }`}>
                {result.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                <div className="flex-1">
                  <p className="font-semibold">{result.success ? "Device provisioned successfully!" : "Provisioning failed"}</p>
                  {result.ipAddress && <p className="text-xs">IP: {result.ipAddress}</p>}
                  {result.error && <p className="text-xs">{result.error}</p>}
                </div>
                {result.netboxDeviceUrl && (
                  <a href={result.netboxDeviceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium underline flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Open in Netbox
                  </a>
                )}
              </div>
            )}
            {result && (
              <button onClick={reset}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90">
                <RefreshCw className="w-3.5 h-3.5" /> Provision Another Device
              </button>
            )}
          </div>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="w-[480px] border-l border-border bg-surface flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-accent" />
              <span className="text-sm font-bold text-text-primary">Provisioning History</span>
            </div>
            <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-auto">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-text-muted">
                <History className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No provisioning history yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map(e => (
                  <div key={e.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        e.status === "success" ? "bg-green-500" : e.status === "rolled-back" ? "bg-amber-500" : "bg-red-500"
                      }`} />
                      <span className="text-sm font-medium text-text-primary">{e.deviceName}</span>
                      <span className="ml-auto text-[10px] text-text-muted">{fmtTime(e.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>{e.profileName}</span>
                      {e.ipAddress && <span className="font-mono">{e.ipAddress}</span>}
                      <span>{e.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
