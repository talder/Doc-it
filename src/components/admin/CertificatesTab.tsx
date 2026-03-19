"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, KeyRound, FileCode2, ScrollText, LayoutTemplate, RefreshCw, Plus, Trash2, Download, ShieldAlert, RotateCcw, Upload, Eye, EyeOff, Shield, Network, Globe, User, Code2, Mail, FileText, ChevronRight, ChevronDown, FolderInput, FilePlus, Pencil, Copy, Check, X } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import type {
  PkiCertNode,
  PkiCertificate,
  PkiCrl,
  PkiCsr,
  PkiTemplate,
  PkiKeyAlgorithm,
  PkiCertType,
  PkiPrivateKey,
  PkiRevocationReason,
  PkiExportFormat,
} from "@/lib/types";

type SubTab = "certs" | "keys" | "csrs" | "crls" | "templates" | "import" | "create";
type TplTab = "subject" | "extensions" | "keyusage";

interface TplForm {
  name: string; type: PkiCertType; validityDays: number;
  // Subject
  cn: string; o: string; ou: string; c: string; st: string; l: string; email: string;
  // Basic Constraints
  bcType: "not-defined" | "end-entity" | "ca"; bcPathLen: string; bcCritical: boolean;
  // Key Identifiers
  ski: boolean; aki: boolean;
  // Key Usage
  kuCritical: boolean;
  ku_ds: boolean; ku_nr: boolean; ku_ke: boolean; ku_de: boolean;
  ku_ka: boolean; ku_cs: boolean; ku_crl: boolean; ku_eo: boolean; ku_do: boolean;
  // Extended Key Usage
  ekuCritical: boolean;
  eku_sa: boolean; eku_ca: boolean; eku_cs: boolean; eku_ep: boolean;
  eku_ts: boolean; eku_os: boolean; eku_msic: boolean; eku_mscc: boolean;
  eku_mstl: boolean; eku_mssgc: boolean; eku_msefs: boolean; eku_nssgc: boolean;
  // SAN / CDP / AIA
  san: string; crlDP: string; ocspUrl: string;
}

function tplToForm(t: PkiTemplate): TplForm {
  const ext = t.extensions as Record<string, unknown>;
  const ku  = Array.isArray(ext.keyUsage)     ? (ext.keyUsage     as string[]) : [];
  const eku = Array.isArray(ext.extKeyUsage)  ? (ext.extKeyUsage  as string[]) : [];
  const san    = Array.isArray(ext.san)                   ? (ext.san                   as string[]).join("\n") : "";
  const crlDP  = Array.isArray(ext.crlDistributionPoints) ? (ext.crlDistributionPoints as string[]).join("\n") : "";
  const ocspUrl = Array.isArray(ext.ocspResponders)       ? (ext.ocspResponders        as string[]).join("\n") : "";
  return {
    name: t.name, type: t.type, validityDays: t.validityDays,
    cn: t.subject.CN || "", o: t.subject.O || "", ou: t.subject.OU || "",
    c: t.subject.C || "", st: t.subject.ST || "", l: t.subject.L || "",
    email: t.subject.emailAddress || "",
    bcType: ext.isCA === true ? "ca" : ext.isCA === false ? "end-entity" : "not-defined",
    bcPathLen: ext.pathLen !== undefined ? String(ext.pathLen) : "",
    bcCritical: Boolean(ext.basicConstraintsCritical),
    ski: Boolean(ext.subjectKeyIdentifier), aki: Boolean(ext.authorityKeyIdentifier),
    kuCritical: Boolean(ext.keyUsageCritical),
    ku_ds: ku.includes("digitalSignature"), ku_nr: ku.includes("nonRepudiation"),
    ku_ke: ku.includes("keyEncipherment"),  ku_de: ku.includes("dataEncipherment"),
    ku_ka: ku.includes("keyAgreement"),     ku_cs: ku.includes("keyCertSign"),
    ku_crl: ku.includes("cRLSign"),         ku_eo: ku.includes("encipherOnly"),
    ku_do: ku.includes("decipherOnly"),
    ekuCritical: Boolean(ext.extKeyUsageCritical),
    eku_sa: eku.includes("serverAuth"),    eku_ca: eku.includes("clientAuth"),
    eku_cs: eku.includes("codeSigning"),   eku_ep: eku.includes("emailProtection"),
    eku_ts: eku.includes("timeStamping"),  eku_os: eku.includes("ocspSigning"),
    eku_msic:  eku.includes("msCodeInd"),  eku_mscc:  eku.includes("msCodeCom"),
    eku_mstl:  eku.includes("msCTLSign"),  eku_mssgc: eku.includes("msSGC"),
    eku_msefs: eku.includes("msEFS"),      eku_nssgc: eku.includes("nsSGC"),
    san, crlDP, ocspUrl,
  };
}

const emptyTpl = (): TplForm => ({
  name: "", type: "tls-server", validityDays: 365,
  cn: "", o: "", ou: "", c: "", st: "", l: "", email: "",
  bcType: "not-defined", bcPathLen: "", bcCritical: false,
  ski: true, aki: true,
  kuCritical: false,
  ku_ds: false, ku_nr: false, ku_ke: false, ku_de: false,
  ku_ka: false, ku_cs: false, ku_crl: false, ku_eo: false, ku_do: false,
  ekuCritical: false,
  eku_sa: false, eku_ca: false, eku_cs: false, eku_ep: false,
  eku_ts: false, eku_os: false, eku_msic: false, eku_mscc: false,
  eku_mstl: false, eku_mssgc: false, eku_msefs: false, eku_nssgc: false,
  san: "", crlDP: "", ocspUrl: "",
});

function tplToPayload(f: TplForm) {
  const ku: string[] = [
    f.ku_ds && "digitalSignature", f.ku_nr && "nonRepudiation", f.ku_ke && "keyEncipherment",
    f.ku_de && "dataEncipherment", f.ku_ka && "keyAgreement", f.ku_cs && "keyCertSign",
    f.ku_crl && "cRLSign", f.ku_eo && "encipherOnly", f.ku_do && "decipherOnly",
  ].filter(Boolean) as string[];
  const eku: string[] = [
    f.eku_sa && "serverAuth", f.eku_ca && "clientAuth", f.eku_cs && "codeSigning",
    f.eku_ep && "emailProtection", f.eku_ts && "timeStamping", f.eku_os && "ocspSigning",
    f.eku_msic && "msCodeInd", f.eku_mscc && "msCodeCom", f.eku_mstl && "msCTLSign",
    f.eku_mssgc && "msSGC", f.eku_msefs && "msEFS", f.eku_nssgc && "nsSGC",
  ].filter(Boolean) as string[];
  const sanList = f.san.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const crlList = f.crlDP.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const ocspList = f.ocspUrl.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  return {
    action: "createTemplate", name: f.name.trim(), type: f.type, validityDays: f.validityDays,
    subject: {
      CN: f.cn || undefined, O: f.o || undefined, OU: f.ou || undefined,
      C: f.c || undefined, ST: f.st || undefined, L: f.l || undefined,
      emailAddress: f.email || undefined,
    },
    extensions: {
      isCA: f.bcType === "ca",
      basicConstraintsCritical: f.bcCritical || undefined,
      pathLen: f.bcType === "ca" && f.bcPathLen !== "" ? Number(f.bcPathLen) : undefined,
      subjectKeyIdentifier: f.ski || undefined,
      authorityKeyIdentifier: f.aki || undefined,
      keyUsage: ku.length ? ku : undefined,
      keyUsageCritical: f.kuCritical || undefined,
      extKeyUsage: eku.length ? eku : undefined,
      extKeyUsageCritical: f.ekuCritical || undefined,
      san: sanList.length ? sanList : undefined,
      crlDistributionPoints: crlList.length ? crlList : undefined,
      ocspResponders: ocspList.length ? ocspList : undefined,
    },
  };
}

type CsrTab = "source" | "subject" | "extensions" | "keyusage";
interface SanEntry { type: "DNS" | "IP" | "email" | "URI" | "otherName"; value: string; }
interface CsrFormState {
  // Source
  unstructuredName: string; challengePassword: string;
  signingMode: "csr-only" | "self-signed" | "ca-signed";
  signingSerial: string; signingCaId: string;
  signatureAlgorithm: "SHA256" | "SHA384" | "SHA512";
  templateId: string;
  // Subject
  internalName: string;
  cn: string; o: string; ou: string; c: string; st: string; l: string; email: string;
  keyId: string;
  autoGenKey: boolean;
  autoGenKeyAlgorithm: PkiKeyAlgorithm;
  // Extensions
  bcType: "not-defined" | "end-entity" | "ca"; bcPathLen: string; bcCritical: boolean;
  ski: boolean; aki: boolean; validityDays: number;
  sanEntries: SanEntry[]; crlDP: string; ocspUrl: string;
  // Key Usage
  kuCritical: boolean;
  ku_ds: boolean; ku_nr: boolean; ku_ke: boolean; ku_de: boolean;
  ku_ka: boolean; ku_cs: boolean; ku_crl: boolean; ku_eo: boolean; ku_do: boolean;
  // Extended Key Usage
  ekuCritical: boolean;
  eku_sa: boolean; eku_ca: boolean; eku_cs: boolean; eku_ep: boolean;
  eku_ts: boolean; eku_os: boolean; eku_msic: boolean; eku_mscc: boolean;
  eku_mstl: boolean; eku_mssgc: boolean; eku_msefs: boolean; eku_nssgc: boolean;
}

const emptyCsrForm = (): CsrFormState => ({
  unstructuredName: "", challengePassword: "",
  signingMode: "csr-only", signingSerial: "", signingCaId: "",
  signatureAlgorithm: "SHA256", templateId: "",
  internalName: "", cn: "", o: "", ou: "", c: "", st: "", l: "", email: "",
  keyId: "",
  autoGenKey: false, autoGenKeyAlgorithm: "RSA-2048" as PkiKeyAlgorithm,
  bcType: "not-defined", bcPathLen: "", bcCritical: false,
  ski: false, aki: false, validityDays: 365,
  sanEntries: [], crlDP: "", ocspUrl: "",
  kuCritical: false,
  ku_ds: false, ku_nr: false, ku_ke: false, ku_de: false,
  ku_ka: false, ku_cs: false, ku_crl: false, ku_eo: false, ku_do: false,
  ekuCritical: false,
  eku_sa: false, eku_ca: false, eku_cs: false, eku_ep: false,
  eku_ts: false, eku_os: false, eku_msic: false, eku_mscc: false,
  eku_mstl: false, eku_mssgc: false, eku_msefs: false, eku_nssgc: false,
});

function applyTemplateToCsr(tpl: PkiTemplate, mode: "subject" | "extensions" | "all", f: CsrFormState): CsrFormState {
  const n = { ...f };
  if (mode === "subject" || mode === "all") {
    if (tpl.subject.CN) n.cn = tpl.subject.CN;
    if (tpl.subject.O) n.o = tpl.subject.O;
    if (tpl.subject.OU) n.ou = tpl.subject.OU;
    if (tpl.subject.C) n.c = tpl.subject.C;
    if (tpl.subject.ST) n.st = tpl.subject.ST;
    if (tpl.subject.L) n.l = tpl.subject.L;
    if (tpl.subject.emailAddress) n.email = tpl.subject.emailAddress;
    if (tpl.validityDays) n.validityDays = tpl.validityDays;
  }
  if (mode === "extensions" || mode === "all") {
    const ext = tpl.extensions as Record<string, unknown>;
    if (ext.isCA !== undefined) n.bcType = ext.isCA ? "ca" : "end-entity";
    if (ext.pathLen !== undefined) n.bcPathLen = String(ext.pathLen);
    if (ext.basicConstraintsCritical !== undefined) n.bcCritical = Boolean(ext.basicConstraintsCritical);
    if (ext.subjectKeyIdentifier !== undefined) n.ski = Boolean(ext.subjectKeyIdentifier);
    if (ext.authorityKeyIdentifier !== undefined) n.aki = Boolean(ext.authorityKeyIdentifier);
    if (Array.isArray(ext.san)) {
      n.sanEntries = (ext.san as string[]).map((s) => {
        if (s.startsWith("DNS:")) return { type: "DNS" as const, value: s.slice(4) };
        if (s.startsWith("IP:")) return { type: "IP" as const, value: s.slice(3) };
        if (s.startsWith("email:")) return { type: "email" as const, value: s.slice(6) };
        if (s.startsWith("URI:")) return { type: "URI" as const, value: s.slice(4) };
        return { type: "DNS" as const, value: s };
      });
    }
    if (Array.isArray(ext.crlDistributionPoints) && (ext.crlDistributionPoints as string[])[0])
      n.crlDP = (ext.crlDistributionPoints as string[])[0];
    if (Array.isArray(ext.ocspResponders) && (ext.ocspResponders as string[])[0])
      n.ocspUrl = (ext.ocspResponders as string[])[0];
    if (Array.isArray(ext.keyUsage)) {
      const ku = ext.keyUsage as string[];
      n.ku_ds = ku.includes("digitalSignature"); n.ku_nr = ku.includes("nonRepudiation");
      n.ku_ke = ku.includes("keyEncipherment"); n.ku_de = ku.includes("dataEncipherment");
      n.ku_ka = ku.includes("keyAgreement"); n.ku_cs = ku.includes("keyCertSign");
      n.ku_crl = ku.includes("cRLSign"); n.ku_eo = ku.includes("encipherOnly"); n.ku_do = ku.includes("decipherOnly");
    }
    if (ext.keyUsageCritical !== undefined) n.kuCritical = Boolean(ext.keyUsageCritical);
    if (Array.isArray(ext.extKeyUsage)) {
      const eku = ext.extKeyUsage as string[];
      n.eku_sa = eku.includes("serverAuth"); n.eku_ca = eku.includes("clientAuth");
      n.eku_cs = eku.includes("codeSigning"); n.eku_ep = eku.includes("emailProtection");
      n.eku_ts = eku.includes("timeStamping"); n.eku_os = eku.includes("ocspSigning");
      n.eku_msic = eku.includes("msCodeInd"); n.eku_mscc = eku.includes("msCodeCom");
      n.eku_mstl = eku.includes("msCTLSign"); n.eku_mssgc = eku.includes("msSGC");
      n.eku_msefs = eku.includes("msEFS"); n.eku_nssgc = eku.includes("nsSGC");
    }
    if (ext.extKeyUsageCritical !== undefined) n.ekuCritical = Boolean(ext.extKeyUsageCritical);
  }
  return n;
}

interface StoreResponse {
  keys: Omit<PkiPrivateKey, "pemEncrypted">[];
  csrs: PkiCsr[];
  certs: PkiCertificate[];
  crls: PkiCrl[];
  templates: PkiTemplate[];
  tree: PkiCertNode[];
}

export default function CertificatesTab() {
  const [tab, setTab] = useState<SubTab>("certs");
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<StoreResponse | null>(null);
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Forms (minimal, practical)
  const [newKey, setNewKey] = useState({ name: "", comment: "", algorithm: "RSA-2048" as PkiKeyAlgorithm });
  const [importKeyPem, setImportKeyPem] = useState("");
  const [importKeyName, setImportKeyName] = useState("");
  const [importCertPem, setImportCertPem] = useState("");
  const [importCertName, setImportCertName] = useState("");
  const [importCertFormat, setImportCertFormat] = useState<"PEM" | "DER" | "PKCS7" | "PKCS12">("PEM");
  const [importCertPassphrase, setImportCertPassphrase] = useState("");
  const [importCertPassVisible, setImportCertPassVisible] = useState(false);
  const [importCsrPem, setImportCsrPem] = useState("");
  const [selfSign, setSelfSign] = useState({ keyId: "", name: "", cn: "", validityDays: 365, certType: "other" as PkiCertType });
  // XCA-style template form
  const [tplTab, setTplTab] = useState<TplTab>("subject");
  const [tplForm, setTplForm] = useState<TplForm>(emptyTpl);
  const setTpl = (patch: Partial<TplForm>) => setTplForm(f => ({ ...f, ...patch }));
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [selectedCsrId, setSelectedCsrId] = useState<string | null>(null);
  const [copiedCsrId, setCopiedCsrId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [keyPemCache, setKeyPemCache] = useState<Record<string, string>>({});
  const [certExportFormat, setCertExportFormat] = useState<PkiExportFormat>("PEM");
  const [certExportPassphrase, setCertExportPassphrase] = useState("");
  const [certExportPassVisible, setCertExportPassVisible] = useState(false);
  const [certExportPassModal, setCertExportPassModal] = useState(false);
  const [pendingExport, setPendingExport] = useState<{ type: "cert" | "key"; id: string; format: string } | null>(null);

  const triggerExport = (type: "cert" | "key", id: string, format: string) => {
    if (format === "PEM+key" || format === "PKCS12") {
      setCertExportPassphrase("");
      setCertExportPassVisible(false);
      setPendingExport({ type, id, format });
      setCertExportPassModal(true);
    } else {
      doExport(type, id, format);
    }
  };
  // XCA-style CSR form
  const [csrTab, setCsrTab] = useState<CsrTab>("source");
  const [csrForm, setCsrForm] = useState<CsrFormState>(emptyCsrForm);
  const setCsr = (patch: Partial<CsrFormState>) => setCsrForm(f => ({ ...f, ...patch }));
  const [newSanType, setNewSanType] = useState<SanEntry["type"]>("DNS");
  const [newSanValue, setNewSanValue] = useState("");
  // Collapsed tree nodes
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsedNodes(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  // Use a state-based callback ref so the drag effect re-runs when the element
  // actually mounts (the drop zone is only rendered after `store` loads).
  const [certDropZoneEl, setCertDropZoneEl] = useState<HTMLDivElement | null>(null);
  const [certDragOver, setCertDragOver] = useState(false);
  // Keep a ref to importCertName so the native drop handler is never stale
  const importCertNameRef = useRef(importCertName);
  useEffect(() => { importCertNameRef.current = importCertName; }, [importCertName]);

  const selectedCert = useMemo(
    () => store?.certs.find((c) => c.id === selectedCertId) || null,
    [store, selectedCertId]
  );

  const flash = (msg: string, type: "error" | "success") => {
    if (type === "error") {
      setError(msg);
      setSuccess("");
    } else {
      setSuccess(msg);
      setError("");
    }
    setTimeout(() => {
      setError("");
      setSuccess("");
    }, 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/certificates");
      if (!res.ok) throw new Error("Failed to load certificate store");
      const data = await res.json();
      setStore(data);
      if (!selectedCertId && data.certs?.[0]) setSelectedCertId(data.certs[0].id);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Native drag-and-drop for the cert import zone.
  // Deps on certDropZoneEl so this runs exactly when the element appears
  // (the drop zone is only in the DOM after `store` loads).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = certDropZoneEl;
    if (!el) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setCertDragOver(true);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleDragLeave = (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node)) setCertDragOver(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCertDragOver(false);
      const dt = e.dataTransfer;
      const file: File | null =
        (dt?.files?.length ?? 0) > 0
          ? dt!.files[0]
          : (dt?.items[0]?.kind === "file" ? dt!.items[0].getAsFile() : null);
      if (!file) {
        setError("No file received — try clicking to browse");
        setSuccess("");
        setTimeout(() => setError(""), 3500);
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, "");
      readCertFile(file)
        .then(({ data, format }) => {
          // Attempt auto-import immediately
          return fetch("/api/admin/certificates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "importCert", pem: data, format, name }),
          })
            .then(async (res) => {
              const result = await res.json().catch(() => ({}));
              if (!res.ok) {
                // Import failed (e.g. P12 needs passphrase) — populate form so user can fix it
                setImportCertPem(data);
                setImportCertFormat(format);
                setImportCertName(name);
                setError(result.error || "Import failed — enter passphrase if required");
                setSuccess("");
                setTimeout(() => setError(""), 5000);
                return;
              }
              // Success — clear form and reload
              setImportCertPem("");
              setImportCertName("");
              setImportCertPassphrase("");
              setImportCertFormat("PEM");
              setSuccess(`“${name}” imported successfully`);
              setError("");
              setTimeout(() => setSuccess(""), 3500);
              // Reload store
              fetch("/api/admin/certificates")
                .then((r) => r.json())
                .then((d) => { setStore(d); setLoading(false); })
                .catch(() => {});
            });
        })
        .catch(() => {
          setError("Could not read file");
          setTimeout(() => setError(""), 3500);
        });
    };

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, [certDropZoneEl]); // re-runs when the element mounts/unmounts

  const runAction = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  /** Read a file and return { data, format } ready to send to the API. */
  const readCertFile = (file: File): Promise<{ data: string; format: "PEM" | "DER" | "PKCS7" | "PKCS12" }> =>
    new Promise((resolve, reject) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const textExts = ["pem", "crt", "cert"];
      const derExts = ["der", "cer", "bin"];
      const p12Exts = ["p12", "pfx"];
      const p7Exts = ["p7b", "p7c"];

      const reader = new FileReader();

      if (textExts.includes(ext)) {
        reader.onload = () => {
          const text = reader.result as string;
          // Could still be DER even with .crt extension — check for PEM header
          if (text.includes("-----BEGIN ")) {
            resolve({ data: text, format: "PEM" });
          } else {
            // Re-read as binary
            const r2 = new FileReader();
            r2.onload = () => resolve({ data: Buffer.from(r2.result as ArrayBuffer).toString("base64"), format: "DER" });
            r2.onerror = reject;
            r2.readAsArrayBuffer(file);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      } else if (p12Exts.includes(ext)) {
        reader.onload = () => resolve({ data: Buffer.from(reader.result as ArrayBuffer).toString("base64"), format: "PKCS12" });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      } else if (p7Exts.includes(ext)) {
        reader.onload = () => {
          const text = reader.result as string;
          if (text.includes("-----BEGIN ")) {
            resolve({ data: text, format: "PKCS7" });
          } else {
            const r2 = new FileReader();
            r2.onload = () => resolve({ data: Buffer.from(r2.result as ArrayBuffer).toString("base64"), format: "PKCS7" });
            r2.onerror = reject;
            r2.readAsArrayBuffer(file);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      } else if (derExts.includes(ext)) {
        reader.onload = () => resolve({ data: Buffer.from(reader.result as ArrayBuffer).toString("base64"), format: "DER" });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      } else {
        // Unknown extension — try text first
        reader.onload = () => {
          const text = reader.result as string;
          if (text.includes("-----BEGIN ")) resolve({ data: text, format: "PEM" });
          else {
            const r2 = new FileReader();
            r2.onload = () => resolve({ data: Buffer.from(r2.result as ArrayBuffer).toString("base64"), format: "DER" });
            r2.onerror = reject;
            r2.readAsArrayBuffer(file);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      }
    });

  const submitCsr = async () => {
    const subject = {
      CN: csrForm.cn || undefined, O: csrForm.o || undefined, OU: csrForm.ou || undefined,
      C: csrForm.c || undefined, ST: csrForm.st || undefined, L: csrForm.l || undefined,
      emailAddress: csrForm.email || undefined,
    };
    const ku = [
      csrForm.ku_ds && "digitalSignature", csrForm.ku_nr && "nonRepudiation",
      csrForm.ku_ke && "keyEncipherment", csrForm.ku_de && "dataEncipherment",
      csrForm.ku_ka && "keyAgreement", csrForm.ku_cs && "keyCertSign",
      csrForm.ku_crl && "cRLSign", csrForm.ku_eo && "encipherOnly", csrForm.ku_do && "decipherOnly",
    ].filter(Boolean) as string[];
    const eku = [
      csrForm.eku_sa && "serverAuth", csrForm.eku_ca && "clientAuth",
      csrForm.eku_cs && "codeSigning", csrForm.eku_ep && "emailProtection",
      csrForm.eku_ts && "timeStamping", csrForm.eku_os && "ocspSigning",
      csrForm.eku_msic && "msCodeInd", csrForm.eku_mscc && "msCodeCom",
      csrForm.eku_mstl && "msCTLSign", csrForm.eku_mssgc && "msSGC",
      csrForm.eku_msefs && "msEFS", csrForm.eku_nssgc && "nsSGC",
    ].filter(Boolean) as string[];
    const sanList = csrForm.sanEntries
      .filter(e => e.value.trim())
      .map(e => `${e.type}:${e.value.trim()}`);
    const extensions = {
      isCA: csrForm.bcType === "ca" ? true : csrForm.bcType === "end-entity" ? false : undefined,
      basicConstraintsCritical: csrForm.bcCritical || undefined,
      pathLen: csrForm.bcType === "ca" && csrForm.bcPathLen !== "" ? Number(csrForm.bcPathLen) : undefined,
      subjectKeyIdentifier: csrForm.ski || undefined,
      authorityKeyIdentifier: csrForm.aki || undefined,
      keyUsage: ku.length ? ku : undefined,
      keyUsageCritical: csrForm.kuCritical || undefined,
      extKeyUsage: eku.length ? eku : undefined,
      extKeyUsageCritical: csrForm.ekuCritical || undefined,
      san: sanList.length ? sanList : undefined,
      crlDistributionPoints: csrForm.crlDP ? [csrForm.crlDP] : undefined,
      ocspResponders: csrForm.ocspUrl ? [csrForm.ocspUrl] : undefined,
    };
    const name = csrForm.internalName.trim() || csrForm.cn || "New CSR";
    try {
      // Resolve the key ID — either existing selection or freshly generated
      let keyId = csrForm.keyId;
      if (csrForm.autoGenKey) {
        const keyResult = await runAction({
          action: "generateKey",
          name: `${name} Key`,
          algorithm: csrForm.autoGenKeyAlgorithm,
          comment: `Auto-generated for CSR: ${name}`,
        });
        keyId = keyResult.key?.id ?? keyResult.id;
        if (!keyId) { flash("Failed to generate private key", "error"); return; }
      } else if (!keyId) {
        flash("Select a private key", "error"); return;
      }

      if (csrForm.signingMode === "csr-only") {
        await runAction({ action: "createCsr", keyId, name, subject, extensions });
        flash("CSR created", "success");
      } else if (csrForm.signingMode === "self-signed") {
        await runAction({ action: "createSelfSigned", keyId, name,
          certType: csrForm.bcType === "ca" ? "root-ca" : "other",
          validityDays: csrForm.validityDays, subject, extensions });
        flash("Self-signed certificate created", "success");
        setTab("certs");
      } else if (csrForm.signingMode === "ca-signed") {
        if (!csrForm.signingCaId) { flash("Select a CA certificate", "error"); return; }
        const result = await runAction({ action: "createCsr", keyId, name, subject, extensions });
        await runAction({ action: "signCsr", csrId: result.csr.id, caId: csrForm.signingCaId,
          certName: name, validityDays: csrForm.validityDays });
        flash("Certificate created and signed", "success");
        setTab("certs");
      }
      await load();
      setCsrForm(emptyCsrForm());
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const downloadCsr = (csr: PkiCsr) => {
    const blob = new Blob([csr.pem], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csr.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.csr`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyCsr = async (csr: PkiCsr) => {
    await copyToClipboard(csr.pem);
    setCopiedCsrId(csr.id);
    setTimeout(() => setCopiedCsrId(null), 2000);
  };

  const doExport = async (type: "cert" | "key", id: string, format: string, passphrase?: string) => {
    try {
      const action = type === "cert" ? "exportCert" : "exportKey";
      const idField = type === "cert" ? "certId" : "keyId";
      const data = await runAction({ action, [idField]: id, format, ...(passphrase ? { passphrase } : {}) });
      const blob =
        data.mimeType === "application/x-pkcs12" || data.mimeType === "application/pkcs7-mime" || data.mimeType === "application/pkix-cert"
          ? new Blob([Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))], { type: data.mimeType })
          : new Blob([data.data], { type: data.mimeType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "export.bin";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Export failed", "error");
    }
  };

  const CERT_ICONS: Record<PkiCertType, React.ReactNode> = {
    "root-ca":        <Shield   className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />,
    "intermediate-ca":<Network  className="w-3.5 h-3.5 text-blue-500  flex-shrink-0" />,
    "tls-server":     <Globe    className="w-3.5 h-3.5 text-green-500  flex-shrink-0" />,
    "tls-client":     <User     className="w-3.5 h-3.5 text-cyan-500   flex-shrink-0" />,
    "code-signing":   <Code2    className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />,
    "email":          <Mail     className="w-3.5 h-3.5 text-pink-500   flex-shrink-0" />,
    "other":          <FileText className="w-3.5 h-3.5 text-gray-400   flex-shrink-0" />,
  };

  const CertTree = ({ nodes, depth = 0 }: { nodes: PkiCertNode[]; depth?: number }) => (
    <div>
      {nodes.map((node) => {
        const daysLeft = Math.floor((new Date(node.notAfter).getTime() - Date.now()) / 86400000);
        const statusBadge = node.isRevoked
          ? "bg-gray-200 text-gray-600" : daysLeft < 0
          ? "bg-red-100 text-red-700" : daysLeft <= 7
          ? "bg-red-100 text-red-700" : daysLeft <= 30
          ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";
        const isExpanded = !collapsedNodes.has(node.id);
        const hasChildren = node.children.length > 0;
        const isSelected = selectedCertId === node.id;
        return (
          <div key={node.id} className="relative">
            <div
              className={`flex items-center gap-1.5 py-1.5 pr-2 rounded cursor-pointer select-none ${
                isSelected ? "bg-accent/10 border-r-2 border-accent" : "hover:bg-gray-50"
              }`}
              style={{ paddingLeft: `${depth * 20 + 6}px` }}
              onClick={() => setSelectedCertId(node.id)}
            >
              {/* Expand/collapse toggle */}
              <span
                className={`p-0.5 rounded flex-shrink-0 ${hasChildren ? "hover:bg-gray-200 cursor-pointer" : ""}`}
                style={{ visibility: hasChildren ? "visible" : "hidden" }}
                onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleCollapse(node.id); }}
              >
                {isExpanded
                  ? <ChevronDown  className="w-3 h-3 text-text-muted" />
                  : <ChevronRight className="w-3 h-3 text-text-muted" />}
              </span>
              {CERT_ICONS[node.type] ?? CERT_ICONS["other"]}
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate block leading-tight">
                  {node.subject.CN || node.name}
                </span>
                {(node.subject.O || node.name !== (node.subject.CN || node.name)) && (
                  <span className="text-[10px] text-text-muted truncate block">
                    {node.subject.O ? `${node.subject.O}` : ""}{node.subject.O && node.name ? " · " : ""}{node.name !== (node.subject.CN || node.name) ? node.name : ""}
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge}`}>
                  {node.isRevoked ? "revoked" : daysLeft < 0 ? "expired" : `${daysLeft}d`}
                </span>
                <span className="text-[10px] text-text-muted tabular-nums">
                  {new Date(node.notAfter).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </span>
            </div>
            {hasChildren && isExpanded && (
              <div className="relative" style={{ borderLeft: "1px solid var(--color-border, #e5e7eb)", marginLeft: `${depth * 20 + 13}px` }}>
                <CertTree nodes={node.children} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!store) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-border p-6">
        <p className="text-sm text-text-muted">Loading certificates…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
      {success && <div className="px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{success}</div>}

      <div className="bg-surface rounded-xl shadow-sm border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-text-primary">Certificate Manager</h2>
          </div>
          <button onClick={load} disabled={loading} className="p-1.5 rounded hover:bg-muted text-text-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="px-4 pt-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <TabBtn active={tab === "certs"} onClick={() => setTab("certs")} icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Certificates" />
            <TabBtn active={tab === "keys"} onClick={() => setTab("keys")} icon={<KeyRound className="w-3.5 h-3.5" />} label="Private Keys" />
            <TabBtn active={tab === "csrs"} onClick={() => setTab("csrs")} icon={<FileCode2 className="w-3.5 h-3.5" />} label="CSRs" />
            <TabBtn active={tab === "crls"} onClick={() => setTab("crls")} icon={<ScrollText className="w-3.5 h-3.5" />} label="CRLs" />
            <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<LayoutTemplate className="w-3.5 h-3.5" />} label="Templates" />
            <TabBtn active={tab === "import"} onClick={() => setTab("import")} icon={<FolderInput className="w-3.5 h-3.5" />} label="Import" />
            <TabBtn active={tab === "create"} onClick={() => setTab("create")} icon={<FilePlus className="w-3.5 h-3.5" />} label="New Certificate" />
          </div>
        </div>

        {/* Certificates */}
        {tab === "certs" && (
          <div className="p-4 grid grid-cols-5 gap-4">
            <div className="col-span-2 border border-border rounded-lg p-3 max-h-[640px] overflow-auto">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Chain View</h3>
              {store.tree?.length ? <CertTree nodes={store.tree} /> : <p className="text-sm text-text-muted">No certificates.</p>}
            </div>
            <div className="col-span-3 border border-border rounded-lg p-4">
              {selectedCert ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">{selectedCert.name}</h3>
                      <p className="text-xs text-text-muted">{selectedCert.subject.CN || "No CN"} · {selectedCert.type}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => doExport("cert", selectedCert.id, "PEM")} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"><Download className="w-3 h-3" />PEM</button>
                      <button onClick={() => triggerExport("cert", selectedCert.id, "PKCS12")} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">P12</button>
                      <span className="w-px h-4 bg-border mx-0.5" />
                      <select
                        value={certExportFormat}
                        onChange={(e) => setCertExportFormat(e.target.value as PkiExportFormat)}
                        className="px-1.5 py-1 text-xs border border-border rounded bg-surface"
                      >
                        <option value="PEM">PEM (*.crt)</option>
                        <option value="DER">DER (*.cer)</option>
                        <option value="PKCS7">PKCS #7 (*.p7b)</option>
                        <option value="PKCS7-chain">PKCS #7 all (*.p7b)</option>
                        <option value="PEM-chain">PEM all (*.pem)</option>
                        <option value="PKCS12">PKCS #12 (*.p12)</option>
                        <option value="PEM+key">PEM + Key (*.pem)</option>
                        <option value="cert-index">Certificate Index (*.txt)</option>
                      </select>
                      <button
                        onClick={() => triggerExport("cert", selectedCert.id, certExportFormat)}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />Export
                      </button>
                      <button
                        onClick={async () => {
                          const reason = prompt("Revocation reason (unspecified|key-compromise|ca-compromise|affiliation-changed|superseded|cessation-of-operation|certificate-hold)", "superseded");
                          if (!reason) return;
                          await runAction({ action: "revokeCert", certId: selectedCert.id, reason: reason as PkiRevocationReason });
                          flash("Certificate revoked", "success");
                          await load();
                        }}
                        className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50 flex items-center gap-1"
                      >
                        <ShieldAlert className="w-3 h-3" />Revoke
                      </button>
                      <button
                        onClick={async () => {
                          const validity = Number(prompt("Renew validity days", "365") || "365");
                          await runAction({ action: "renewCert", certId: selectedCert.id, validityDays: validity, revokeOld: true });
                          flash("Certificate renewed", "success");
                          await load();
                        }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />Renew
                      </button>
                    </div>
                  </div>
                  <DetailRow label="Subject CN" value={selectedCert.subject.CN || "—"} />
                  <DetailRow label="Issuer CN" value={selectedCert.issuer.CN || "—"} />
                  <DetailRow label="Serial" value={selectedCert.serial} mono />
                  <DetailRow label="Not Before" value={new Date(selectedCert.notBefore).toLocaleString()} />
                  <DetailRow label="Not After" value={new Date(selectedCert.notAfter).toLocaleString()} />
                  <DetailRow label="SHA-1" value={selectedCert.fingerprintSha1} mono />
                  <DetailRow label="SHA-256" value={selectedCert.fingerprintSha256} mono />
                  <div className="pt-3 border-t border-border">
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Quick actions</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          const nextUpdateDays = Number(prompt("CRL next update days", "30") || "30");
                          await runAction({ action: "generateCrl", caId: selectedCert.id, nextUpdateDays });
                          flash("CRL generated", "success");
                          await load();
                        }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                      >
                        Generate CRL
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Delete this certificate?")) return;
                          await runAction({ action: "deleteCert", certId: selectedCert.id });
                          flash("Certificate deleted", "success");
                          setSelectedCertId(null);
                          await load();
                        }}
                        className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted">Select a certificate to view details.</p>
              )}
            </div>
          </div>
        )}

        {/* Keys */}
        {tab === "keys" && (
          <div className="p-4 space-y-4">
            <div className="border border-border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Generate Key</h3>
              <div className="flex gap-2">
                <input value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} placeholder="Key name" className="flex-1 px-3 py-1.5 text-sm border border-border rounded" />
                <select value={newKey.algorithm} onChange={(e) => setNewKey({ ...newKey, algorithm: e.target.value as PkiKeyAlgorithm })} className="px-2 py-1.5 text-sm border border-border rounded">
                  {["RSA-2048", "RSA-4096", "EC-P256", "EC-P384", "EC-P521", "Ed25519"].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button
                  onClick={async () => {
                    await runAction({ action: "generateKey", ...newKey });
                    setNewKey({ ...newKey, name: "", comment: "" });
                    flash("Key generated", "success");
                    await load();
                  }}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />Generate
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Import Key</h3>
              <p className="text-xs text-text-muted">Accepts PEM (.pem .key), PKCS#8, or PKCS#12 (.p12 .pfx)</p>
              {/* File picker */}
              <input
                ref={keyFileRef}
                type="file"
                accept=".pem,.key,.p12,.pfx,.pk8"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text().catch(() => "");
                    if (text.includes("-----BEGIN ")) {
                      setImportKeyPem(text);
                    } else {
                      // Binary — base64 encode
                      const buf = await file.arrayBuffer();
                      setImportKeyPem(Buffer.from(buf).toString("base64"));
                    }
                    if (!importKeyName) setImportKeyName(file.name.replace(/\.[^.]+$/, ""));
                  } catch {
                    flash("Could not read key file", "error");
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => keyFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded hover:bg-muted"
              >
                <Upload className="w-3.5 h-3.5" />
                Choose key file…
              </button>
              <textarea
                value={importKeyPem}
                onChange={(e) => setImportKeyPem(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-xs font-mono border border-border rounded"
                placeholder="Paste private key PEM…"
              />
              <div className="flex gap-2">
                <input
                  value={importKeyName}
                  onChange={(e) => setImportKeyName(e.target.value)}
                  placeholder="Key name *"
                  className="flex-1 px-2 py-1.5 text-sm border border-border rounded"
                />
                <button
                  onClick={async () => {
                    if (!importKeyPem.trim()) { flash("No key data", "error"); return; }
                    const name = importKeyName.trim() || "Imported Key";
                    await runAction({ action: "importKey", pem: importKeyPem, name });
                    setImportKeyPem("");
                    setImportKeyName("");
                    flash("Key imported", "success");
                    await load();
                  }}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover"
                >
                  Import
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Algorithm</th>
                    <th className="text-left px-3 py-2">Fingerprint</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {store.keys.map((k) => (
                    <React.Fragment key={k.id}>
                      <tr
                        className={`border-t border-border cursor-pointer select-none ${
                          selectedKeyId === k.id ? "bg-accent/5" : "hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          const next = selectedKeyId === k.id ? null : k.id;
                          setSelectedKeyId(next);
                          if (next && !keyPemCache[next]) {
                            runAction({ action: "exportKey", keyId: next, format: "PEM" })
                              .then((d) => setKeyPemCache((c) => ({ ...c, [next]: d.data })))
                              .catch(() => setKeyPemCache((c) => ({ ...c, [next]: "(failed to load)" })));
                          }
                        }}
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <ChevronRight className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform ${
                              selectedKeyId === k.id ? "rotate-90" : ""
                            }`} />
                            {k.name}
                          </span>
                        </td>
                        <td className="px-3 py-2">{k.algorithm}</td>
                        <td className="px-3 py-2 font-mono text-xs">{k.fingerprint.slice(0, 24)}…</td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button onClick={() => doExport("key", k.id, "PEM")} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">PEM</button>
                            <button onClick={() => triggerExport("key", k.id, "PKCS12")} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">P12</button>
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this key?")) return;
                                await runAction({ action: "deleteKey", keyId: k.id });
                                flash("Key deleted", "success");
                                await load();
                              }}
                              className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {selectedKeyId === k.id && (
                        <tr className="border-t border-border bg-gray-50">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">PEM Content</span>
                              <button
                                onClick={async () => {
                                  const pem = keyPemCache[k.id];
                                  if (!pem) return;
                                  await copyToClipboard(pem);
                                  setCopiedKeyId(k.id);
                                  setTimeout(() => setCopiedKeyId(null), 2000);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                              >
                                {copiedKeyId === k.id
                                  ? <><Check className="w-3 h-3 text-green-600" />Copied!</>
                                  : <><Copy className="w-3 h-3" />Copy</>}
                              </button>
                            </div>
                            {keyPemCache[k.id]
                              ? <pre className="text-xs font-mono bg-white border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all select-all">{keyPemCache[k.id]}</pre>
                              : <p className="text-xs text-text-muted animate-pulse">Loading…</p>
                            }
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CSRs */}
        {tab === "csrs" && (
          <div className="p-4 space-y-4">

            {/* XCA-style CSR creation form */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Create Certificate Signing Request</h3>
                <div className="flex gap-0.5 bg-white border border-border rounded-lg p-0.5">
                  {(["source", "subject", "extensions", "keyusage"] as CsrTab[]).map((t) => (
                    <button key={t} onClick={() => setCsrTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        csrTab === t ? "bg-accent text-white" : "text-text-muted hover:bg-muted"
                      }`}>
                      {t === "source" ? "Source" : t === "subject" ? "Subject" : t === "extensions" ? "Extensions" : "Key Usage"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source tab */}
              {csrTab === "source" && (
                <div className="p-4 space-y-4">
                  {/* Template selector */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Template for the new certificate</h4>
                    <div className="flex items-center gap-2">
                      <select value={csrForm.templateId} onChange={(e) => setCsr({ templateId: e.target.value })}
                        className="flex-1 tpl-input">
                        <option value="">— select template —</option>
                        {store.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {csrForm.templateId && (() => {
                        const tpl = store.templates.find(t => t.id === csrForm.templateId);
                        if (!tpl) return null;
                        return (
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => { setCsrForm(applyTemplateToCsr(tpl, "extensions", csrForm)); flash("Extensions applied from template", "success"); }}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted whitespace-nowrap">Apply extensions</button>
                            <button onClick={() => { setCsrForm(applyTemplateToCsr(tpl, "subject", csrForm)); flash("Subject applied from template", "success"); }}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted whitespace-nowrap">Apply subject</button>
                            <button onClick={() => { setCsrForm(applyTemplateToCsr(tpl, "all", csrForm)); flash("Template applied", "success"); }}
                              className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover whitespace-nowrap">Apply all</button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Misc */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="tpl-label">Unstructured Name</label>
                      <input value={csrForm.unstructuredName} onChange={(e) => setCsr({ unstructuredName: e.target.value })}
                        placeholder="optional" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Challenge Password</label>
                      <input type="password" value={csrForm.challengePassword} onChange={(e) => setCsr({ challengePassword: e.target.value })}
                        placeholder="optional" className="tpl-input w-full" />
                    </div>
                  </div>

                  {/* Signing */}
                  <div className="border border-border rounded p-3 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Signing</h4>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={csrForm.signingMode === "csr-only"}
                        onChange={() => setCsr({ signingMode: "csr-only" })} />
                      Create a Certificate Signing Request (CSR only, no signing)
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="radio" checked={csrForm.signingMode === "self-signed"}
                        onChange={() => setCsr({ signingMode: "self-signed" })} />
                      <span className="text-sm">Create a self-signed certificate with serial</span>
                      {csrForm.signingMode === "self-signed" && (
                        <input value={csrForm.signingSerial} onChange={(e) => setCsr({ signingSerial: e.target.value })}
                          placeholder="1" className="w-20 tpl-input" />
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="radio" checked={csrForm.signingMode === "ca-signed"} className="mt-0.5"
                        onChange={() => setCsr({ signingMode: "ca-signed" })} />
                      <div className="flex-1">
                        <span className="text-sm">Use this Certificate for signing</span>
                        {csrForm.signingMode === "ca-signed" && (
                          <select value={csrForm.signingCaId} onChange={(e) => setCsr({ signingCaId: e.target.value })}
                            className="block mt-1 w-full tpl-input">
                            <option value="">— select CA certificate —</option>
                            {store.certs.filter(c => c.type === "root-ca" || c.type === "intermediate-ca")
                              .map(c => <option key={c.id} value={c.id}>{c.name} ({c.subject.CN})</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="pt-1">
                      <label className="tpl-label">Signature Algorithm</label>
                      <select value={csrForm.signatureAlgorithm} onChange={(e) => setCsr({ signatureAlgorithm: e.target.value as CsrFormState["signatureAlgorithm"] })}
                        className="tpl-input">
                        <option value="SHA256">SHA 256</option>
                        <option value="SHA384">SHA 384</option>
                        <option value="SHA512">SHA 512</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Subject tab */}
              {csrTab === "subject" && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="tpl-label">Internal Name *</label>
                      <input value={csrForm.internalName} onChange={(e) => setCsr({ internalName: e.target.value })}
                        placeholder="e.g. My Server Certificate" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Common Name (CN)</label>
                      <input value={csrForm.cn} onChange={(e) => setCsr({ cn: e.target.value })}
                        placeholder="example.com" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">E-mail address</label>
                      <input value={csrForm.email} onChange={(e) => setCsr({ email: e.target.value })}
                        placeholder="admin@example.com" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Organization (O)</label>
                      <input value={csrForm.o} onChange={(e) => setCsr({ o: e.target.value })}
                        placeholder="ACME Corp" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Organizational Unit (OU)</label>
                      <input value={csrForm.ou} onChange={(e) => setCsr({ ou: e.target.value })}
                        placeholder="IT Department" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Country (C) — 2 chars</label>
                      <input value={csrForm.c} onChange={(e) => setCsr({ c: e.target.value.toUpperCase().slice(0, 2) })}
                        placeholder="US" maxLength={2} className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">State / Province (ST)</label>
                      <input value={csrForm.st} onChange={(e) => setCsr({ st: e.target.value })}
                        placeholder="California" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Locality (L)</label>
                      <input value={csrForm.l} onChange={(e) => setCsr({ l: e.target.value })}
                        placeholder="San Francisco" className="tpl-input w-full" />
                    </div>
                  </div>

                  {/* SAN table editor */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Subject Alternative Names</h4>
                    {csrForm.sanEntries.length > 0 && (
                      <table className="w-full text-sm mb-2">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-2 py-1 text-xs text-text-muted font-medium w-28">Type</th>
                            <th className="text-left px-2 py-1 text-xs text-text-muted font-medium">Content</th>
                            <th className="px-2 py-1 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {csrForm.sanEntries.map((e, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1 text-xs font-mono">{e.type}</td>
                              <td className="px-2 py-1 text-xs font-mono break-all">{e.value}</td>
                              <td className="px-2 py-1">
                                <button onClick={() => setCsr({ sanEntries: csrForm.sanEntries.filter((_, j) => j !== i) })}
                                  className="p-0.5 text-red-400 hover:text-red-600">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="flex gap-2">
                      <select value={newSanType} onChange={(e) => setNewSanType(e.target.value as SanEntry["type"])}
                        className="tpl-input w-32 flex-shrink-0">
                        <option value="DNS">DNS</option>
                        <option value="IP">IP</option>
                        <option value="email">email</option>
                        <option value="URI">URI</option>
                        <option value="otherName">otherName</option>
                      </select>
                      <input value={newSanValue} onChange={(e) => setNewSanValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newSanValue.trim()) {
                            setCsr({ sanEntries: [...csrForm.sanEntries, { type: newSanType, value: newSanValue.trim() }] });
                            setNewSanValue("");
                          }
                        }}
                        placeholder="value — press Enter to add" className="flex-1 tpl-input" />
                      <button
                        onClick={() => {
                          if (!newSanValue.trim()) return;
                          setCsr({ sanEntries: [...csrForm.sanEntries, { type: newSanType, value: newSanValue.trim() }] });
                          setNewSanValue("");
                        }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1 flex-shrink-0">
                        <Plus className="w-3 h-3" />Add
                      </button>
                    </div>
                  </div>

                  {/* Private key */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Private Key</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={csrForm.autoGenKey}
                          onChange={(e) => setCsr({ autoGenKey: e.target.checked, keyId: "" })}
                          className="rounded"
                        />
                        Automatically generate
                      </label>
                    </div>
                    {csrForm.autoGenKey ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-text-muted whitespace-nowrap">Algorithm</label>
                        <select
                          value={csrForm.autoGenKeyAlgorithm}
                          onChange={(e) => setCsr({ autoGenKeyAlgorithm: e.target.value as PkiKeyAlgorithm })}
                          className="tpl-input"
                        >
                          {(["RSA-2048", "RSA-4096", "EC-P256", "EC-P384", "EC-P521", "Ed25519"] as PkiKeyAlgorithm[]).map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                        <span className="text-xs text-text-muted">Key will be generated and named after the CSR</span>
                      </div>
                    ) : (
                      <select value={csrForm.keyId} onChange={(e) => setCsr({ keyId: e.target.value })}
                        className="w-full tpl-input">
                        <option value="">— select key —</option>
                        {store.keys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.algorithm})</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Extensions tab */}
              {csrTab === "extensions" && (
                <div className="p-4 space-y-3">
                  {/* Basic Constraints */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Basic Constraints</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={csrForm.bcCritical} onChange={(e) => setCsr({ bcCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="tpl-label">Type</label>
                        <select value={csrForm.bcType} onChange={(e) => setCsr({ bcType: e.target.value as CsrFormState["bcType"] })} className="tpl-input w-full">
                          <option value="not-defined">Not defined</option>
                          <option value="end-entity">End Entity</option>
                          <option value="ca">Certification Authority</option>
                        </select>
                      </div>
                      {csrForm.bcType === "ca" && (
                        <div>
                          <label className="tpl-label">Path length (blank = unlimited)</label>
                          <input type="number" value={csrForm.bcPathLen} onChange={(e) => setCsr({ bcPathLen: e.target.value })}
                            min={0} placeholder="unlimited" className="tpl-input w-full" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Key Identifiers */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Key Identifier</h4>
                    <div className="flex gap-5">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={csrForm.ski} onChange={(e) => setCsr({ ski: e.target.checked })} className="rounded" />
                        Subject Key Identifier
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={csrForm.aki} onChange={(e) => setCsr({ aki: e.target.checked })} className="rounded" />
                        Authority Key Identifier
                      </label>
                    </div>
                  </div>

                  {/* Validity */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Validity</h4>
                    <div className="flex items-end gap-3">
                      <div>
                        <label className="tpl-label">Days</label>
                        <input type="number" value={csrForm.validityDays} min={1}
                          onChange={(e) => setCsr({ validityDays: Number(e.target.value) })}
                          className="tpl-input w-24" />
                      </div>
                      <div className="flex gap-1 pb-0.5">
                        {([["1y", 365], ["2y", 730], ["3y", 1095], ["5y", 1825]] as [string, number][]).map(([label, days]) => (
                          <button key={label} onClick={() => setCsr({ validityDays: days })}
                            className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">{label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* SAN summary (edit in Subject tab) */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Subject Alternative Name</h4>
                      <button onClick={() => setCsrTab("subject")}
                        className="text-xs text-accent hover:underline">Edit in Subject tab →</button>
                    </div>
                    {csrForm.sanEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {csrForm.sanEntries.map((e, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-xs font-mono rounded">{e.type}:{e.value}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted italic">No SAN entries — add them in the Subject tab.</p>
                    )}
                  </div>

                  {/* CDP */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">X509v3 CRL Distribution Points</h4>
                    <input value={csrForm.crlDP} onChange={(e) => setCsr({ crlDP: e.target.value })}
                      placeholder="http://crl.example.com/root.crl" className="tpl-input w-full" />
                  </div>

                  {/* AIA */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">Authority Information Access (OCSP)</h4>
                    <input value={csrForm.ocspUrl} onChange={(e) => setCsr({ ocspUrl: e.target.value })}
                      placeholder="http://ocsp.example.com" className="tpl-input w-full" />
                  </div>
                </div>
              )}

              {/* Key Usage tab */}
              {csrTab === "keyusage" && (
                <div className="p-4 grid grid-cols-2 gap-4">
                  {/* KU */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Key Usage</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={csrForm.kuCritical} onChange={(e) => setCsr({ kuCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ["ku_ds",  "Digital Signature"],
                        ["ku_nr",  "Non Repudiation"],
                        ["ku_ke",  "Key Encipherment"],
                        ["ku_de",  "Data Encipherment"],
                        ["ku_ka",  "Key Agreement"],
                        ["ku_cs",  "Certificate Sign"],
                        ["ku_crl", "CRL Sign"],
                        ["ku_eo",  "Encipher Only"],
                        ["ku_do",  "Decipher Only"],
                      ] as [keyof CsrFormState, string][]).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={csrForm[k] as boolean}
                            onChange={(e) => setCsr({ [k]: e.target.checked })} className="rounded" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* EKU */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Extended Key Usage</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={csrForm.ekuCritical} onChange={(e) => setCsr({ ekuCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ["eku_sa",    "TLS Web Server Authentication"],
                        ["eku_ca",    "TLS Web Client Authentication"],
                        ["eku_cs",    "Code Signing"],
                        ["eku_ep",    "E-mail Protection"],
                        ["eku_ts",    "Time Stamping"],
                        ["eku_os",    "OCSP Signing"],
                        ["eku_msic",  "Microsoft Individual Code Signing"],
                        ["eku_mscc",  "Microsoft Commercial Code Signing"],
                        ["eku_mstl",  "Microsoft Trust List Signing"],
                        ["eku_mssgc", "Microsoft Server Gated Crypto"],
                        ["eku_msefs", "Microsoft Encrypted File System"],
                        ["eku_nssgc", "Netscape Server Gated Crypto"],
                      ] as [keyof CsrFormState, string][]).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={csrForm[k] as boolean}
                            onChange={(e) => setCsr({ [k]: e.target.checked })} className="rounded" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-4 pb-4 pt-2 border-t border-border flex items-center gap-3">
                <button onClick={submitCsr}
                  className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5" />
                  {csrForm.signingMode === "csr-only" ? "Create CSR" : csrForm.signingMode === "self-signed" ? "Create Self-Signed Certificate" : "Create & Sign Certificate"}
                </button>
                <button onClick={() => { setCsrForm(emptyCsrForm()); setCsrTab("source"); }}
                  className="px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary">Reset</button>
              </div>
            </div>

            <div className="border border-border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-text-primary mb-2">Import CSR (PKCS#10 PEM)</h3>
              <textarea value={importCsrPem} onChange={(e) => setImportCsrPem(e.target.value)} rows={5} className="w-full px-3 py-2 text-xs font-mono border border-border rounded" placeholder="Paste CSR PEM..." />
              <div className="mt-2">
                <button
                  onClick={async () => {
                    const name = prompt("CSR name", "Imported CSR");
                    if (!name) return;
                    await runAction({ action: "importCsr", pem: importCsrPem, name });
                    setImportCsrPem("");
                    flash("CSR imported", "success");
                    await load();
                  }}
                  className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted"
                >
                  Import
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">CN</th>
                    <th className="text-left px-3 py-2">Signed</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {store.csrs.map((c) => (
                    <React.Fragment key={c.id}>
                      <tr
                        className={`border-t border-border cursor-pointer select-none ${
                          selectedCsrId === c.id ? "bg-accent/5" : "hover:bg-gray-50"
                        }`}
                        onClick={() => setSelectedCsrId(prev => prev === c.id ? null : c.id)}
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <ChevronRight className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform ${
                              selectedCsrId === c.id ? "rotate-90" : ""
                            }`} />
                            {c.name}
                          </span>
                        </td>
                        <td className="px-3 py-2">{c.subject.CN}</td>
                        <td className="px-3 py-2">{c.signedCertId ? "Yes" : "No"}</td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button
                              onClick={() => downloadCsr(c)}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                              title="Download CSR as .csr file"
                            >
                              <Download className="w-3 h-3" />Download
                            </button>
                            <button
                              onClick={() => copyCsr(c)}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                              title="Copy PEM to clipboard"
                            >
                              {copiedCsrId === c.id
                                ? <><Check className="w-3 h-3 text-green-600" />Copied!</>
                                : <><Copy className="w-3 h-3" />Copy</>}
                            </button>
                            <button
                              onClick={async () => {
                                const caId = prompt("CA certificate ID");
                                if (!caId) return;
                                const certName = prompt("Issued certificate name", `${c.subject.CN} cert`) || `${c.subject.CN} cert`;
                                await runAction({ action: "signCsr", csrId: c.id, caId, certName, validityDays: 365 });
                                flash("CSR signed", "success");
                                await load();
                              }}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                            >
                              Sign
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this CSR?")) return;
                                await runAction({ action: "deleteCsr", csrId: c.id });
                                flash("CSR deleted", "success");
                                setSelectedCsrId(null);
                                await load();
                              }}
                              className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {selectedCsrId === c.id && (
                        <tr key={`${c.id}-pem`} className="border-t border-border bg-gray-50">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">PEM Content</span>
                              <button
                                onClick={() => copyCsr(c)}
                                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                              >
                                {copiedCsrId === c.id
                                  ? <><Check className="w-3 h-3 text-green-600" />Copied!</>
                                  : <><Copy className="w-3 h-3" />Copy</>}
                              </button>
                            </div>
                            <pre className="text-xs font-mono bg-white border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all select-all">{c.pem}</pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CRLs */}
        {tab === "crls" && (
          <div className="p-4 space-y-4">
            <div className="border border-border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-text-primary mb-2">Generate CRL</h3>
              <div className="flex gap-2">
                <select className="px-2 py-1.5 text-sm border border-border rounded" id="crl-ca-select">
                  <option value="">Select CA cert ID</option>
                  {store.certs.filter((c) => c.type === "root-ca" || c.type === "intermediate-ca").map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.subject.CN})</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    const el = document.getElementById("crl-ca-select") as HTMLSelectElement | null;
                    const caId = el?.value;
                    if (!caId) return flash("Select CA certificate", "error");
                    await runAction({ action: "generateCrl", caId, nextUpdateDays: 30 });
                    flash("CRL generated", "success");
                    await load();
                  }}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover"
                >
                  Generate
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">CA ID</th>
                    <th className="text-left px-3 py-2">This Update</th>
                    <th className="text-left px-3 py-2">Next Update</th>
                    <th className="text-left px-3 py-2">Revoked</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {store.crls.map((crl) => (
                    <tr key={crl.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{crl.caId.slice(0, 12)}…</td>
                      <td className="px-3 py-2">{new Date(crl.thisUpdate).toLocaleString()}</td>
                      <td className="px-3 py-2">{new Date(crl.nextUpdate).toLocaleString()}</td>
                      <td className="px-3 py-2">{crl.revokedCount}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => {
                            const blob = new Blob([crl.pem], { type: "application/x-pem-file" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `crl-${crl.id}.pem`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Templates */}
        {tab === "templates" && (
          <div className="p-4 space-y-4">
            {/* XCA-style template editor */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">
                  {editingTemplateId ? (
                    <span className="flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit Template: {tplForm.name}</span>
                  ) : "Create Template"}
                </h3>
                <div className="flex gap-0.5 bg-white border border-border rounded-lg p-0.5">
                  {(["subject", "extensions", "keyusage"] as TplTab[]).map((t) => (
                    <button key={t} onClick={() => setTplTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        tplTab === t ? "bg-accent text-white" : "text-text-muted hover:bg-muted"
                      }`}>
                      {t === "subject" ? "Subject" : t === "extensions" ? "Extensions" : "Key Usage"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject tab */}
              {tplTab === "subject" && (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="col-span-2">
                      <label className="tpl-label">Internal name *</label>
                      <input value={tplForm.name} onChange={(e) => setTpl({ name: e.target.value })} placeholder="e.g. TLS Server 1y" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Common Name (CN)</label>
                      <input value={tplForm.cn} onChange={(e) => setTpl({ cn: e.target.value })} placeholder="example.com" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">E-mail address</label>
                      <input value={tplForm.email} onChange={(e) => setTpl({ email: e.target.value })} placeholder="admin@example.com" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Organization (O)</label>
                      <input value={tplForm.o} onChange={(e) => setTpl({ o: e.target.value })} placeholder="ACME Corp" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Organizational Unit (OU)</label>
                      <input value={tplForm.ou} onChange={(e) => setTpl({ ou: e.target.value })} placeholder="IT Department" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Country (C) — 2 chars</label>
                      <input value={tplForm.c} onChange={(e) => setTpl({ c: e.target.value.toUpperCase().slice(0, 2) })} placeholder="US" maxLength={2} className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">State / Province (ST)</label>
                      <input value={tplForm.st} onChange={(e) => setTpl({ st: e.target.value })} placeholder="California" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Locality (L)</label>
                      <input value={tplForm.l} onChange={(e) => setTpl({ l: e.target.value })} placeholder="San Francisco" className="tpl-input w-full" />
                    </div>
                    <div>
                      <label className="tpl-label">Certificate type</label>
                      <select value={tplForm.type} onChange={(e) => setTpl({ type: e.target.value as PkiCertType })} className="tpl-input w-full">
                        {(["root-ca","intermediate-ca","tls-server","tls-client","code-signing","email","other"] as PkiCertType[]).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="tpl-label">Validity (days)</label>
                      <input type="number" value={tplForm.validityDays} onChange={(e) => setTpl({ validityDays: Number(e.target.value) })} min={1} className="tpl-input w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Extensions tab */}
              {tplTab === "extensions" && (
                <div className="p-4 space-y-3">
                  {/* Basic Constraints */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Basic Constraints</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={tplForm.bcCritical} onChange={(e) => setTpl({ bcCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="tpl-label">Type</label>
                        <select value={tplForm.bcType} onChange={(e) => setTpl({ bcType: e.target.value as TplForm["bcType"] })} className="tpl-input w-full">
                          <option value="not-defined">Not defined</option>
                          <option value="end-entity">End Entity</option>
                          <option value="ca">Certification Authority</option>
                        </select>
                      </div>
                      {tplForm.bcType === "ca" && (
                        <div>
                          <label className="tpl-label">Path length (leave blank = unlimited)</label>
                          <input type="number" value={tplForm.bcPathLen} onChange={(e) => setTpl({ bcPathLen: e.target.value })} min={0} placeholder="unlimited" className="tpl-input w-full" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Key Identifiers */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Key Identifier</h4>
                    <div className="flex gap-5">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={tplForm.ski} onChange={(e) => setTpl({ ski: e.target.checked })} className="rounded" />
                        Subject Key Identifier
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={tplForm.aki} onChange={(e) => setTpl({ aki: e.target.checked })} className="rounded" />
                        Authority Key Identifier
                      </label>
                    </div>
                  </div>

                  {/* SAN */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">X509v3 Subject Alternative Name</h4>
                    <p className="text-[11px] text-text-muted mb-1.5">One per line or comma-separated. Prefix: DNS:, IP:, email:, URI:</p>
                    <textarea value={tplForm.san} onChange={(e) => setTpl({ san: e.target.value })} rows={3}
                      className="w-full px-2 py-1.5 text-xs font-mono border border-border rounded"
                      placeholder={"DNS:example.com\nDNS:www.example.com\nIP:192.168.1.1"} />
                  </div>

                  {/* CDP */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">X509v3 CRL Distribution Points</h4>
                    <input value={tplForm.crlDP} onChange={(e) => setTpl({ crlDP: e.target.value })}
                      placeholder="http://crl.example.com/root.crl" className="tpl-input w-full" />
                  </div>

                  {/* AIA */}
                  <div className="border border-border rounded p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">Authority Information Access (OCSP)</h4>
                    <input value={tplForm.ocspUrl} onChange={(e) => setTpl({ ocspUrl: e.target.value })}
                      placeholder="http://ocsp.example.com" className="tpl-input w-full" />
                  </div>
                </div>
              )}

              {/* Key Usage tab */}
              {tplTab === "keyusage" && (
                <div className="p-4 grid grid-cols-2 gap-4">
                  {/* KU */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Key Usage</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={tplForm.kuCritical} onChange={(e) => setTpl({ kuCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ["ku_ds",  "Digital Signature"],
                        ["ku_nr",  "Non Repudiation"],
                        ["ku_ke",  "Key Encipherment"],
                        ["ku_de",  "Data Encipherment"],
                        ["ku_ka",  "Key Agreement"],
                        ["ku_cs",  "Certificate Sign"],
                        ["ku_crl", "CRL Sign"],
                        ["ku_eo",  "Encipher Only"],
                        ["ku_do",  "Decipher Only"],
                      ] as [keyof TplForm, string][]).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={tplForm[k] as boolean}
                            onChange={(e) => setTpl({ [k]: e.target.checked })} className="rounded" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* EKU */}
                  <div className="border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">X509v3 Extended Key Usage</h4>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={tplForm.ekuCritical} onChange={(e) => setTpl({ ekuCritical: e.target.checked })} className="rounded" /> Critical
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ["eku_sa",    "TLS Web Server Authentication"],
                        ["eku_ca",    "TLS Web Client Authentication"],
                        ["eku_cs",    "Code Signing"],
                        ["eku_ep",    "E-mail Protection"],
                        ["eku_ts",    "Time Stamping"],
                        ["eku_os",    "OCSP Signing"],
                        ["eku_msic",  "Microsoft Individual Code Signing"],
                        ["eku_mscc",  "Microsoft Commercial Code Signing"],
                        ["eku_mstl",  "Microsoft Trust List Signing"],
                        ["eku_mssgc", "Microsoft Server Gated Crypto"],
                        ["eku_msefs", "Microsoft Encrypted File System"],
                        ["eku_nssgc", "Netscape Server Gated Crypto"],
                      ] as [keyof TplForm, string][]).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={tplForm[k] as boolean}
                            onChange={(e) => setTpl({ [k]: e.target.checked })} className="rounded" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="px-4 pb-4 pt-1 border-t border-border flex items-center gap-3">
                {editingTemplateId ? (
                  <>
                    <button
                      onClick={async () => {
                        if (!tplForm.name.trim()) { flash("Internal name is required", "error"); return; }
                        try {
                          const { action: _action, ...payload } = tplToPayload(tplForm);
                          await runAction({ action: "updateTemplate", templateId: editingTemplateId, ...payload });
                          setTplForm(emptyTpl);
                          setTplTab("subject");
                          setEditingTemplateId(null);
                          flash("Template updated", "success");
                          await load();
                        } catch (err) {
                          flash(err instanceof Error ? err.message : "Failed to update template", "error");
                        }
                      }}
                      className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => { setTplForm(emptyTpl); setTplTab("subject"); setEditingTemplateId(null); }}
                      className="px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        if (!tplForm.name.trim()) { flash("Internal name is required", "error"); return; }
                        try {
                          await runAction(tplToPayload(tplForm));
                          setTplForm(emptyTpl);
                          setTplTab("subject");
                          flash("Template created", "success");
                          await load();
                        } catch (err) {
                          flash(err instanceof Error ? err.message : "Failed to create template", "error");
                        }
                      }}
                      className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover"
                    >
                      Create Template
                    </button>
                    <button onClick={() => { setTplForm(emptyTpl); setTplTab("subject"); }}
                      className="px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary">Reset</button>
                  </>
                )}
              </div>
            </div>

            {/* Saved templates list */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Validity</th>
                    <th className="text-left px-3 py-2">KU / EKU</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {store.templates.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{t.name}</td>
                      <td className="px-3 py-2 text-xs">{t.type}</td>
                      <td className="px-3 py-2 text-xs">{t.validityDays}d</td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {t.extensions.keyUsage?.length ? `KU:${t.extensions.keyUsage.length}` : ""}
                        {t.extensions.extKeyUsage?.length ? ` EKU:${t.extensions.extKeyUsage.length}` : ""}
                        {!t.extensions.keyUsage?.length && !t.extensions.extKeyUsage?.length ? "—" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingTemplateId(t.id);
                              setTplForm(tplToForm(t));
                              setTplTab("subject");
                            }}
                            className="px-2 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this template?")) return;
                              await runAction({ action: "deleteTemplate", templateId: t.id });
                              flash("Template deleted", "success");
                              await load();
                            }}
                            className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Certificate */}
        {tab === "import" && (
          <div className="p-4 max-w-2xl space-y-4">
            <p className="text-xs text-text-muted">Supports PEM (.pem .crt), DER (.der .cer), PKCS#12 (.p12 .pfx), PKCS#7 (.p7b). Files are auto-imported on drop.</p>

            {/* Hidden file picker */}
            <input
              ref={certFileRef}
              type="file"
              accept=".pem,.crt,.cer,.der,.p12,.pfx,.p7b,.p7c,.cert"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const { data, format } = await readCertFile(file);
                  setImportCertPem(data);
                  setImportCertFormat(format);
                  if (!importCertName) setImportCertName(file.name.replace(/\.[^.]+$/, ""));
                } catch {
                  flash("Could not read file", "error");
                }
                e.target.value = "";
              }}
            />

            <div
              ref={setCertDropZoneEl}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                certDragOver ? "border-accent bg-accent/10" : "border-border hover:border-accent hover:bg-accent/5"
              }`}
              onClick={() => certFileRef.current?.click()}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-muted">Click or drag &amp; drop a certificate file</p>
              <p className="text-xs text-text-muted mt-0.5">.pem · .crt · .cer · .der · .p12 · .pfx · .p7b</p>
            </div>

            <div className="text-xs text-text-muted font-medium text-center">— or paste PEM below —</div>

            <textarea
              value={importCertFormat === "PEM" ? importCertPem : ""}
              onChange={(e) => { setImportCertPem(e.target.value); setImportCertFormat("PEM"); }}
              rows={4}
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded"
              placeholder="-----BEGIN CERTIFICATE-----&#10;…"
            />

            <div className="grid grid-cols-3 gap-2">
              <input value={importCertName} onChange={(e) => setImportCertName(e.target.value)}
                placeholder="Certificate name *" className="px-2 py-1.5 text-sm border border-border rounded" />
              <select value={importCertFormat} onChange={(e) => setImportCertFormat(e.target.value as "PEM" | "DER" | "PKCS7" | "PKCS12")}
                className="px-2 py-1.5 text-sm border border-border rounded">
                <option value="PEM">PEM</option>
                <option value="DER">DER</option>
                <option value="PKCS7">PKCS#7</option>
                <option value="PKCS12">PKCS#12</option>
              </select>
              <div className="relative">
                <input type={importCertPassVisible ? "text" : "password"} value={importCertPassphrase}
                  onChange={(e) => setImportCertPassphrase(e.target.value)}
                  placeholder={importCertFormat === "PKCS12" ? "Passphrase (if any)" : "Passphrase (P12 only)"}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded pr-8" />
                <button type="button" onClick={() => setImportCertPassVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {importCertPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!importCertPem.trim()) { flash("No certificate data — select a file or paste PEM", "error"); return; }
                  if (!importCertName.trim()) { flash("Name is required", "error"); return; }
                  try {
                    await runAction({ action: "importCert", pem: importCertPem, format: importCertFormat,
                      name: importCertName.trim(), passphrase: importCertPassphrase || undefined });
                    setImportCertPem(""); setImportCertName(""); setImportCertPassphrase(""); setImportCertFormat("PEM");
                    flash("Certificate imported", "success");
                    await load();
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Import failed", "error");
                  }
                }}
                className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />Import
              </button>
              {importCertPem && (
                <span className="text-xs text-text-muted">
                  {importCertFormat} · {importCertPem.length > 200 ? `${(importCertPem.length / 1024).toFixed(1)} KB` : `${importCertPem.length} bytes`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* New Certificate (self-signed) */}
        {tab === "create" && (
          <div className="p-4 max-w-2xl space-y-4">
            <p className="text-xs text-text-muted">Create a new self-signed certificate using an existing private key. Typically used for root CAs.</p>
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="tpl-label">Private key *</label>
                  <select value={selfSign.keyId} onChange={(e) => setSelfSign({ ...selfSign, keyId: e.target.value })} className="tpl-input w-full">
                    <option value="">Select key…</option>
                    {store.keys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.algorithm})</option>)}
                  </select>
                </div>
                <div>
                  <label className="tpl-label">Certificate type</label>
                  <select value={selfSign.certType} onChange={(e) => setSelfSign({ ...selfSign, certType: e.target.value as PkiCertType })} className="tpl-input w-full">
                    {(["root-ca","intermediate-ca","tls-server","tls-client","code-signing","email","other"] as PkiCertType[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="tpl-label">Certificate name (internal label) *</label>
                  <input value={selfSign.name} onChange={(e) => setSelfSign({ ...selfSign, name: e.target.value })}
                    placeholder="e.g. My Root CA" className="tpl-input w-full" />
                </div>
                <div>
                  <label className="tpl-label">Common Name (CN)</label>
                  <input value={selfSign.cn} onChange={(e) => setSelfSign({ ...selfSign, cn: e.target.value })}
                    placeholder="My Root CA" className="tpl-input w-full" />
                </div>
                <div>
                  <label className="tpl-label">Validity (days)</label>
                  <input type="number" value={selfSign.validityDays} min={1}
                    onChange={(e) => setSelfSign({ ...selfSign, validityDays: Number(e.target.value) })}
                    className="tpl-input w-full" />
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <button
                  onClick={async () => {
                    if (!selfSign.keyId) { flash("Select a key", "error"); return; }
                    if (!selfSign.name) { flash("Name is required", "error"); return; }
                    try {
                      await runAction({ action: "createSelfSigned", keyId: selfSign.keyId, name: selfSign.name,
                        certType: selfSign.certType, validityDays: selfSign.validityDays,
                        subject: { CN: selfSign.cn }, extensions: {} });
                      setSelfSign({ ...selfSign, name: "", cn: "" });
                      flash("Self-signed certificate created", "success");
                      await load();
                      setTab("certs");
                    } catch (err) {
                      flash(err instanceof Error ? err.message : "Failed to create certificate", "error");
                    }
                  }}
                  className="px-4 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover flex items-center gap-1.5"
                >
                  <FilePlus className="w-3.5 h-3.5" />Create Certificate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Passphrase modal for PEM+key / PKCS12 export */}
      {certExportPassModal && pendingExport && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setCertExportPassModal(false); }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Export Passphrase</h2>
              <button onClick={() => setCertExportPassModal(false)} className="modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">Optionally protect the private key with a passphrase. Leave empty to export unencrypted.</p>
              <div className="flex items-center gap-2 mt-4 mb-2">
                <div className="relative flex-1">
                  <input
                    type={certExportPassVisible ? "text" : "password"}
                    value={certExportPassphrase}
                    onChange={(e) => setCertExportPassphrase(e.target.value)}
                    placeholder="Passphrase (optional)"
                    className="w-full px-3 py-2 text-sm border border-border rounded pr-9"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        doExport(pendingExport.type, pendingExport.id, pendingExport.format, certExportPassphrase || undefined);
                        setCertExportPassModal(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCertExportPassVisible((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {certExportPassVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setCertExportPassModal(false)} className="modal-btn-cancel">Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    doExport(pendingExport.type, pendingExport.id, pendingExport.format, certExportPassphrase || undefined);
                    setCertExportPassModal(false);
                  }}
                  className="modal-btn-primary flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-3 text-sm">
      <span className="col-span-1 text-text-muted">{label}</span>
      <span className={`col-span-4 text-text-primary break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
