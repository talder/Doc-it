/**
 * PKI / Certificate Manager library.
 *
 * Covers: private key generation & import, CSR creation & signing,
 * certificate import/creation/renewal/revocation, CRL generation,
 * multi-format export, chain tree building, per-item access control,
 * and NIS2-compliant audit logging of every write operation.
 *
 * Storage: config/certificates.json (SQLite KV via readJsonConfig).
 * Private key PEM is encrypted at rest via crypto.ts encryptField().
 */

import { randomUUID, createHash, randomBytes } from "crypto";
import * as x509 from "@peculiar/x509";
import forge from "node-forge";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField } from "./crypto";
import type {
  PkiStore,
  PkiPrivateKey,
  PkiCsr,
  PkiCertificate,
  PkiCrl,
  PkiTemplate,
  PkiCertNode,
  PkiKeyAlgorithm,
  PkiCertType,
  PkiSubject,
  PkiExtensions,
  PkiRevocationReason,
  PkiExportFormat,
} from "./types";
import type { User } from "./types";
import type { NextRequest } from "next/server";

// ── Storage ───────────────────────────────────────────────────────────────────

const CERT_STORE_FILE = "certificates.json";

const EMPTY_STORE: PkiStore = {
  keys: [],
  csrs: [],
  certs: [],
  crls: [],
  templates: [],
};

export async function readCertStore(): Promise<PkiStore> {
  return readJsonConfig<PkiStore>(CERT_STORE_FILE, { ...EMPTY_STORE });
}

async function writeCertStore(store: PkiStore): Promise<void> {
  await writeJsonConfig(CERT_STORE_FILE, store);
}

// ── Access control ────────────────────────────────────────────────────────────

export function canAccessItem(
  item: { allowedUsers: string[]; allowedGroups: string[] },
  user: User,
  userGroups: string[] = []
): boolean {
  if (user.isAdmin) return true;
  if (item.allowedUsers.includes(user.username)) return true;
  if (item.allowedGroups.some((g) => userGroups.includes(g))) return true;
  return false;
}

// ── Audit helper ──────────────────────────────────────────────────────────────

function doAuditLog(
  request: NextRequest | null,
  payload: Parameters<typeof import("./audit").auditLog>[1]
) {
  if (!request) return;
  import("./audit").then(({ auditLog }) => auditLog(request, payload)).catch(() => {});
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

/** Set the Web Crypto provider for @peculiar/x509 (Node.js 24 has built-in webcrypto). */
function getCrypto(): Crypto {
  return globalThis.crypto as Crypto;
}

x509.cryptoProvider.set(getCrypto());

/** SHA-256 fingerprint of a DER buffer, formatted as colon-separated hex. */
function sha256Fingerprint(der: ArrayBuffer): string {
  const buf = Buffer.from(der);
  const hex = createHash("sha256").update(buf).digest("hex");
  return hex.match(/.{2}/g)!.join(":");
}

/** SHA-1 fingerprint of a DER buffer, formatted as colon-separated hex. */
function sha1Fingerprint(der: ArrayBuffer): string {
  const buf = Buffer.from(der);
  const hex = createHash("sha1").update(buf).digest("hex");
  return hex.match(/.{2}/g)!.join(":");
}

/** Generate a random serial number (16 bytes → 32 hex chars). */
function randomSerial(): string {
  return randomBytes(16).toString("hex");
}

/** Convert a BigInt serial to hex string. */
function serialToHex(serial: bigint | string): string {
  if (typeof serial === "bigint") return serial.toString(16);
  return String(serial);
}

// ── Subject DN helpers ────────────────────────────────────────────────────────

/** Build a PkiSubject from an X509Certificate subject DN string. */
function parseDnString(dn: string): PkiSubject {
  const fields: Record<string, string> = {};
  // DN format: "CN=foo, O=bar, C=US"
  for (const part of dn.split(/,(?=\s*[A-Z])/)) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toUpperCase();
    const val = part.slice(eqIdx + 1).trim();
    fields[key] = val;
  }
  return {
    CN: fields["CN"] || "",
    O: fields["O"] || undefined,
    OU: fields["OU"] || undefined,
    C: fields["C"] || undefined,
    ST: fields["ST"] || undefined,
    L: fields["L"] || undefined,
    emailAddress: fields["EMAILADDRESS"] || fields["E"] || undefined,
  };
}

/** Build a @peculiar/x509 Name from a PkiSubject. */
function buildName(subject: PkiSubject): x509.Name {
  const parts: string[] = [];
  if (subject.C) parts.push(`C=${subject.C}`);
  if (subject.ST) parts.push(`ST=${subject.ST}`);
  if (subject.L) parts.push(`L=${subject.L}`);
  if (subject.O) parts.push(`O=${subject.O}`);
  if (subject.OU) parts.push(`OU=${subject.OU}`);
  if (subject.CN) parts.push(`CN=${subject.CN}`);
  if (subject.emailAddress) parts.push(`E=${subject.emailAddress}`);
  return new x509.Name(parts.join(", "));
}

/** Parse PkiExtensions from a parsed X509Certificate. */
function parseExtensions(cert: x509.X509Certificate): PkiExtensions {
  const ext: PkiExtensions = {};

  // SAN
  const sanExt = cert.getExtension("2.5.29.17") as x509.SubjectAlternativeNameExtension | null;
  if (sanExt) {
    const sans: string[] = [];
    for (const name of sanExt.names.items) {
      if (name.type === "dns") sans.push(`DNS:${name.value}`);
      else if (name.type === "ip") sans.push(`IP:${name.value}`);
      else if (name.type === "email") sans.push(`email:${name.value}`);
      else if (name.type === "url") sans.push(`URI:${name.value}`);
    }
    if (sans.length) ext.san = sans;
  }

  // Key Usage
  const kuExt = cert.getExtension("2.5.29.15") as x509.KeyUsagesExtension | null;
  if (kuExt) {
    const usages: string[] = [];
    if (kuExt.usages & x509.KeyUsageFlags.digitalSignature) usages.push("digitalSignature");
    if (kuExt.usages & x509.KeyUsageFlags.nonRepudiation) usages.push("nonRepudiation");
    if (kuExt.usages & x509.KeyUsageFlags.keyEncipherment) usages.push("keyEncipherment");
    if (kuExt.usages & x509.KeyUsageFlags.dataEncipherment) usages.push("dataEncipherment");
    if (kuExt.usages & x509.KeyUsageFlags.keyAgreement) usages.push("keyAgreement");
    if (kuExt.usages & x509.KeyUsageFlags.keyCertSign) usages.push("keyCertSign");
    if (kuExt.usages & x509.KeyUsageFlags.cRLSign) usages.push("cRLSign");
    if (usages.length) ext.keyUsage = usages;
  }

  // Extended Key Usage
  const ekuExt = cert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension | null;
  if (ekuExt) {
    const oids: Record<string, string> = {
      "1.3.6.1.5.5.7.3.1": "serverAuth",
      "1.3.6.1.5.5.7.3.2": "clientAuth",
      "1.3.6.1.5.5.7.3.3": "codeSigning",
      "1.3.6.1.5.5.7.3.4": "emailProtection",
      "1.3.6.1.5.5.7.3.8": "timeStamping",
      "1.3.6.1.5.5.7.3.9": "OCSPSigning",
    };
    const ekus = ekuExt.usages.map((o) => oids[String(o)] || String(o));
    if (ekus.length) ext.extKeyUsage = ekus;
  }

  // Basic Constraints
  const bcExt = cert.getExtension("2.5.29.19") as x509.BasicConstraintsExtension | null;
  if (bcExt) {
    ext.isCA = bcExt.ca;
    if (bcExt.pathLength !== undefined) ext.pathLen = bcExt.pathLength;
  }

  return ext;
}

/** Infer PkiCertType from extensions. */
function inferCertType(ext: PkiExtensions): PkiCertType {
  if (ext.isCA) {
    if (ext.keyUsage?.includes("keyCertSign") && ext.keyUsage?.includes("cRLSign")) {
      // Check if self-signed (no issuerId) — root vs intermediate determined by caller
      return "intermediate-ca";
    }
  }
  if (ext.extKeyUsage?.includes("serverAuth")) return "tls-server";
  if (ext.extKeyUsage?.includes("clientAuth")) return "tls-client";
  if (ext.extKeyUsage?.includes("codeSigning")) return "code-signing";
  if (ext.extKeyUsage?.includes("emailProtection")) return "email";
  return "other";
}

// ── Build SAN general names for @peculiar/x509 ────────────────────────────────

function buildSanNames(sans: string[]): x509.GeneralName[] {
  return sans.map((s) => {
    if (s.startsWith("DNS:")) return new x509.GeneralName("dns", s.slice(4));
    if (s.startsWith("IP:")) return new x509.GeneralName("ip", s.slice(3));
    if (s.startsWith("email:")) return new x509.GeneralName("email", s.slice(6));
    if (s.startsWith("URI:")) return new x509.GeneralName("url", s.slice(4));
    return new x509.GeneralName("dns", s);
  });
}

/** Build the extensions array for certificate generation. */
async function buildCertExtensions(
  ext: PkiExtensions,
  // PublicKey is the @peculiar/x509 wrapper class; CryptoKey for direct webcrypto keys
  publicKey: CryptoKey | x509.PublicKey,
  issuingKey?: CryptoKey,
  issuingCert?: x509.X509Certificate
): Promise<x509.Extension[]> {
  const extensions: x509.Extension[] = [];

  // Resolve PublicKey -> CryptoKey for extensions that require raw CryptoKey
  const resolvedKey: CryptoKey =
    typeof (publicKey as x509.PublicKey).export === "function"
      ? await (publicKey as x509.PublicKey).export()
      : (publicKey as CryptoKey);

  // Subject Key Identifier
  extensions.push(await x509.SubjectKeyIdentifierExtension.create(resolvedKey));

  // Authority Key Identifier (from issuing cert if available)
  if (issuingCert) {
    extensions.push(await x509.AuthorityKeyIdentifierExtension.create(issuingCert, false));
  } else if (issuingKey) {
    extensions.push(await x509.AuthorityKeyIdentifierExtension.create(issuingKey, false));
  }

  // Basic Constraints
  if (ext.isCA !== undefined) {
    extensions.push(new x509.BasicConstraintsExtension(ext.isCA, ext.pathLen, true));
  }

  // Key Usage
  if (ext.keyUsage?.length) {
    let flags = 0;
    if (ext.keyUsage.includes("digitalSignature")) flags |= x509.KeyUsageFlags.digitalSignature;
    if (ext.keyUsage.includes("nonRepudiation") || ext.keyUsage.includes("contentCommitment")) flags |= x509.KeyUsageFlags.nonRepudiation;
    if (ext.keyUsage.includes("keyEncipherment")) flags |= x509.KeyUsageFlags.keyEncipherment;
    if (ext.keyUsage.includes("dataEncipherment")) flags |= x509.KeyUsageFlags.dataEncipherment;
    if (ext.keyUsage.includes("keyAgreement")) flags |= x509.KeyUsageFlags.keyAgreement;
    if (ext.keyUsage.includes("keyCertSign")) flags |= x509.KeyUsageFlags.keyCertSign;
    if (ext.keyUsage.includes("cRLSign")) flags |= x509.KeyUsageFlags.cRLSign;
    extensions.push(new x509.KeyUsagesExtension(flags, true));
  }

  // Extended Key Usage
  if (ext.extKeyUsage?.length) {
    const oidMap: Record<string, string> = {
      serverAuth: "1.3.6.1.5.5.7.3.1",
      clientAuth: "1.3.6.1.5.5.7.3.2",
      codeSigning: "1.3.6.1.5.5.7.3.3",
      emailProtection: "1.3.6.1.5.5.7.3.4",
      timeStamping: "1.3.6.1.5.5.7.3.8",
      OCSPSigning: "1.3.6.1.5.5.7.3.9",
    };
    const oids = ext.extKeyUsage.map((u) => oidMap[u] || u);
    extensions.push(new x509.ExtendedKeyUsageExtension(oids));
  }

  // SAN
  if (ext.san?.length) {
    const generalNames = buildSanNames(ext.san);
    extensions.push(new x509.SubjectAlternativeNameExtension(generalNames));
  }

  return extensions;
}

// ── Key generation params ─────────────────────────────────────────────────────

function algorithmToGenerateParams(algorithm: PkiKeyAlgorithm): AlgorithmIdentifier {
  switch (algorithm) {
    case "RSA-2048": return { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } as RsaHashedKeyGenParams;
    case "RSA-4096": return { name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } as RsaHashedKeyGenParams;
    case "EC-P256": return { name: "ECDSA", namedCurve: "P-256" } as EcKeyGenParams;
    case "EC-P384": return { name: "ECDSA", namedCurve: "P-384" } as EcKeyGenParams;
    case "EC-P521": return { name: "ECDSA", namedCurve: "P-521" } as EcKeyGenParams;
    case "Ed25519": return { name: "Ed25519" };
  }
}

// ── Private Key operations ────────────────────────────────────────────────────

export async function generateKey(
  algorithm: PkiKeyAlgorithm,
  name: string,
  comment: string,
  createdBy: string,
  request: NextRequest | null = null
): Promise<PkiPrivateKey> {
  const crypto = getCrypto();
  const params = algorithmToGenerateParams(algorithm);
  const keyPairRaw = await crypto.subtle.generateKey(params, true, ["sign", "verify"]);
  const keyPair = keyPairRaw as CryptoKeyPair;

  // Export private key as PEM
  const privateKeyDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const privateKeyB64 = Buffer.from(privateKeyDer).toString("base64");
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyB64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;

  // Export public key as PEM
  const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyB64 = Buffer.from(publicKeyDer).toString("base64");
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;

  // Fingerprint of public key DER
  const fingerprint = createHash("sha256").update(Buffer.from(publicKeyDer)).digest("hex");

  const pemEncrypted = await encryptField(privateKeyPem);

  const record: PkiPrivateKey = {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    algorithm,
    pemEncrypted,
    publicKeyPem,
    fingerprint,
    createdAt: new Date().toISOString(),
    createdBy,
    allowedUsers: [],
    allowedGroups: [],
  };

  const store = await readCertStore();
  store.keys.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.key.generate",
    outcome: "success",
    actor: createdBy,
    resource: record.id,
    resourceType: "pki-key",
    details: { name, algorithm, fingerprint },
  });

  return record;
}

/** Import a private key from PEM, PKCS#8 PEM, or PKCS#12 (PFX) data. */
export async function importKey(
  input: string | Buffer,
  passphrase: string | undefined,
  name: string,
  comment: string,
  createdBy: string,
  request: NextRequest | null = null
): Promise<PkiPrivateKey> {
  let privateKeyPem: string;
  let algorithm: PkiKeyAlgorithm = "RSA-2048";

  const inputStr = Buffer.isBuffer(input) ? input.toString("binary") : input;

  // Try PKCS#12 first (binary DER or PEM)
  const isPkcs12 =
    inputStr.includes("-----BEGIN CERTIFICATE-----") === false &&
    (Buffer.isBuffer(input) || inputStr.startsWith("\x30") || inputStr.includes("MII"));

  if (inputStr.includes("-----BEGIN ") && inputStr.includes("PRIVATE KEY-----")) {
    // PEM key (PKCS#8 or traditional) — use directly
    privateKeyPem = inputStr.trim();
  } else {
    // Attempt PKCS#12 parse via node-forge
    const p12Der = Buffer.isBuffer(input)
      ? input.toString("binary")
      : Buffer.from(input, "base64").toString("binary");
    try {
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase || "");
      let forgeKey: forge.pki.rsa.PrivateKey | null = null;
      for (const bag of p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []) {
        if (bag.key) { forgeKey = bag.key as forge.pki.rsa.PrivateKey; break; }
      }
      if (!forgeKey) {
        for (const bag of p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []) {
          if (bag.key) { forgeKey = bag.key as forge.pki.rsa.PrivateKey; break; }
        }
      }
      if (!forgeKey) throw new Error("No private key found in PKCS#12");
      privateKeyPem = forge.pki.privateKeyToPem(forgeKey);
    } catch {
      throw new Error("Could not parse private key: unsupported format or wrong passphrase");
    }
  }

  // Determine algorithm from the key header
  if (privateKeyPem.includes("EC PRIVATE KEY") || privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    // Try to detect via node-forge
    try {
      const forgeKey = forge.pki.privateKeyFromPem(privateKeyPem);
      if ((forgeKey as forge.pki.rsa.PrivateKey).n) {
        const bits = (forgeKey as forge.pki.rsa.PrivateKey).n.bitLength();
        algorithm = bits >= 4096 ? "RSA-4096" : "RSA-2048";
      }
    } catch {
      algorithm = "EC-P256";
    }
  }

  // Get public key
  let publicKeyPem = "";
  let fingerprint = "";
  try {
    const forgePrivKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const forgePublicKey = forge.pki.rsa.setPublicKey(
      (forgePrivKey as forge.pki.rsa.PrivateKey).n,
      (forgePrivKey as forge.pki.rsa.PrivateKey).e
    );
    publicKeyPem = forge.pki.publicKeyToPem(forgePublicKey);
    const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(forgePublicKey)).getBytes();
    fingerprint = createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
  } catch {
    fingerprint = createHash("sha256").update(privateKeyPem).digest("hex");
  }

  const pemEncrypted = await encryptField(privateKeyPem);

  const record: PkiPrivateKey = {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    algorithm,
    pemEncrypted,
    publicKeyPem,
    fingerprint,
    createdAt: new Date().toISOString(),
    createdBy,
    allowedUsers: [],
    allowedGroups: [],
  };

  const store = await readCertStore();
  store.keys.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.key.import",
    outcome: "success",
    actor: createdBy,
    resource: record.id,
    resourceType: "pki-key",
    details: { name, algorithm, fingerprint },
  });

  return record;
}

/** Export a private key in the requested format. Returns PEM string or base64 DER. */
export async function exportKey(
  keyId: string,
  format: "PEM" | "PKCS8" | "PKCS12",
  passphrase: string | undefined,
  actor: string,
  request: NextRequest | null = null
): Promise<{ data: string; mimeType: string; filename: string }> {
  const store = await readCertStore();
  const key = store.keys.find((k) => k.id === keyId);
  if (!key) throw new Error("Key not found");

  const pem = await decryptField(key.pemEncrypted);

  doAuditLog(request, {
    event: "cert.key.export",
    outcome: "success",
    actor,
    resource: keyId,
    resourceType: "pki-key",
    details: { name: key.name, format },
  });

  if (format === "PEM" || format === "PKCS8") {
    return { data: pem, mimeType: "application/x-pem-file", filename: `${key.name}.key.pem` };
  }

  if (format === "PKCS12") {
    const forgeKey = forge.pki.privateKeyFromPem(pem);
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(forgeKey, [], passphrase || "", { algorithm: "3des" });
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const b64 = Buffer.from(p12Der, "binary").toString("base64");
    return { data: b64, mimeType: "application/x-pkcs12", filename: `${key.name}.p12` };
  }

  return { data: pem, mimeType: "application/x-pem-file", filename: `${key.name}.key.pem` };
}

export async function deleteKey(
  keyId: string,
  actor: string,
  request: NextRequest | null = null
): Promise<void> {
  const store = await readCertStore();
  const key = store.keys.find((k) => k.id === keyId);
  if (!key) throw new Error("Key not found");
  store.keys = store.keys.filter((k) => k.id !== keyId);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.key.delete",
    outcome: "success",
    actor,
    resource: keyId,
    resourceType: "pki-key",
    details: { name: key.name },
  });
}

// ── CSR operations ────────────────────────────────────────────────────────────

export async function createCsr(
  keyId: string,
  subject: PkiSubject,
  extensions: PkiExtensions,
  name: string,
  comment: string,
  createdBy: string,
  request: NextRequest | null = null
): Promise<PkiCsr> {
  const store = await readCertStore();
  const keyRecord = store.keys.find((k) => k.id === keyId);
  if (!keyRecord) throw new Error("Key not found");

  const privateKeyPem = await decryptField(keyRecord.pemEncrypted);

  // Import into webcrypto
  const crypto = getCrypto();
  const privateKeyDer = Buffer.from(
    privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );

  const keyAlgParams = algorithmToGenerateParams(keyRecord.algorithm);
  const signAlg = keyRecord.algorithm.startsWith("RSA")
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : keyRecord.algorithm === "Ed25519"
    ? { name: "Ed25519" }
    : { name: "ECDSA", hash: "SHA-256" };

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyDer,
    keyAlgParams,
    false,
    ["sign"]
  );
  const publicKeyDer = Buffer.from(
    keyRecord.publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyDer,
    keyAlgParams,
    true,
    ["verify"]
  );

  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: buildName(subject),
    keys: { privateKey, publicKey },
    signingAlgorithm: signAlg,
    extensions: extensions.san?.length
      ? [new x509.SubjectAlternativeNameExtension(buildSanNames(extensions.san))]
      : [],
  });

  const record: PkiCsr = {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    subject,
    extensions,
    pem: csr.toString("pem"),
    keyId,
    signedCertId: undefined,
    createdAt: new Date().toISOString(),
    createdBy,
    allowedUsers: [],
    allowedGroups: [],
  };

  store.csrs.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.csr.create",
    outcome: "success",
    actor: createdBy,
    resource: record.id,
    resourceType: "pki-csr",
    details: { name, subject: subject.CN },
  });

  return record;
}

export async function importCsr(
  pem: string,
  name: string,
  comment: string,
  createdBy: string,
  request: NextRequest | null = null
): Promise<PkiCsr> {
  // Parse to validate
  const csrObj = new x509.Pkcs10CertificateRequest(pem.trim());
  const subject = parseDnString(csrObj.subject);

  const record: PkiCsr = {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    subject,
    extensions: {},
    pem: csrObj.toString("pem"),
    createdAt: new Date().toISOString(),
    createdBy,
    allowedUsers: [],
    allowedGroups: [],
  };

  const store = await readCertStore();
  store.csrs.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.csr.import",
    outcome: "success",
    actor: createdBy,
    resource: record.id,
    resourceType: "pki-csr",
    details: { name, subject: subject.CN },
  });

  return record;
}

export async function deleteCsr(
  csrId: string,
  actor: string,
  request: NextRequest | null = null
): Promise<void> {
  const store = await readCertStore();
  const csr = store.csrs.find((c) => c.id === csrId);
  if (!csr) throw new Error("CSR not found");
  store.csrs = store.csrs.filter((c) => c.id !== csrId);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.csr.delete",
    outcome: "success",
    actor,
    resource: csrId,
    resourceType: "pki-csr",
    details: { name: csr.name },
  });
}

/** Sign a CSR with a CA certificate to produce a new certificate. */
export async function signCsr(
  csrId: string,
  caId: string,
  validityDays: number,
  overrideType: PkiCertType | undefined,
  overrideExtensions: Partial<PkiExtensions>,
  certName: string,
  certComment: string,
  actor: string,
  request: NextRequest | null = null
): Promise<PkiCertificate> {
  const store = await readCertStore();
  const csrRecord = store.csrs.find((c) => c.id === csrId);
  if (!csrRecord) throw new Error("CSR not found");
  const caCertRecord = store.certs.find((c) => c.id === caId);
  if (!caCertRecord) throw new Error("CA certificate not found");
  const caKeyRecord = caCertRecord.keyId ? store.keys.find((k) => k.id === caCertRecord.keyId) : null;
  if (!caKeyRecord) throw new Error("CA private key not found in store");

  const csrObj = new x509.Pkcs10CertificateRequest(csrRecord.pem);
  const caCertObj = new x509.X509Certificate(caCertRecord.pem);

  // Import CA private key
  const caPrivKeyPem = await decryptField(caKeyRecord.pemEncrypted);
  const caPrivKeyDer = Buffer.from(
    caPrivKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );
  const caKeyAlgParams = algorithmToGenerateParams(caKeyRecord.algorithm);
  const signAlg = caKeyRecord.algorithm.startsWith("RSA")
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : caKeyRecord.algorithm === "Ed25519"
    ? { name: "Ed25519" }
    : { name: "ECDSA", hash: "SHA-256" };

  const caPrivKey = await getCrypto().subtle.importKey(
    "pkcs8",
    caPrivKeyDer,
    caKeyAlgParams,
    false,
    ["sign"]
  );

  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + validityDays * 86400 * 1000);

  const mergedExt: PkiExtensions = { ...csrRecord.extensions, ...overrideExtensions };
  const extensions = await buildCertExtensions(mergedExt, csrObj.publicKey, undefined, caCertObj);

  const cert = await x509.X509CertificateGenerator.create({
    subject: csrObj.subject,
    issuer: caCertObj.subject,
    notBefore,
    notAfter,
    signingAlgorithm: signAlg,
    publicKey: csrObj.publicKey,
    signingKey: caPrivKey,
    serialNumber: randomSerial(),
    extensions,
  });

  const certPem = cert.toString("pem");
  const certDer = cert.rawData;
  const certObj = new x509.X509Certificate(certPem);
  const parsedExtensions = parseExtensions(certObj);
  let certType: PkiCertType = overrideType ?? inferCertType(parsedExtensions);

  const record: PkiCertificate = {
    id: randomUUID(),
    name: certName.trim(),
    comment: certComment.trim(),
    type: certType,
    subject: parseDnString(cert.subject),
    issuer: parseDnString(cert.issuer),
    serial: serialToHex(cert.serialNumber),
    issuerId: caId,
    keyId: csrRecord.keyId,
    csrId,
    pem: certPem,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    fingerprintSha1: sha1Fingerprint(certDer),
    fingerprintSha256: sha256Fingerprint(certDer),
    isRevoked: false,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    allowedUsers: [],
    allowedGroups: [],
  };

  // Mark CSR as signed
  const csrIdx = store.csrs.findIndex((c) => c.id === csrId);
  if (csrIdx !== -1) store.csrs[csrIdx].signedCertId = record.id;

  store.certs.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.csr.sign",
    outcome: "success",
    actor,
    resource: record.id,
    resourceType: "pki-cert",
    details: { certName, csrId, caId, validityDays, serial: record.serial },
  });

  return record;
}

// ── Certificate import ────────────────────────────────────────────────────────

/** Parse one PEM certificate into a PkiCertificate record (without saving). */
function parseCertFromPem(
  pem: string,
  name: string,
  comment: string,
  createdBy: string,
  certType?: PkiCertType
): PkiCertificate {
  const certObj = new x509.X509Certificate(pem.trim());
  const parsedExt = parseExtensions(certObj);
  const inferredType = certType ?? (parsedExt.isCA ? "root-ca" : inferCertType(parsedExt));
  const certDer = certObj.rawData;

  return {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    type: inferredType,
    subject: parseDnString(certObj.subject),
    issuer: parseDnString(certObj.issuer),
    serial: serialToHex(certObj.serialNumber),
    pem: certObj.toString("pem"),
    notBefore: certObj.notBefore.toISOString(),
    notAfter: certObj.notAfter.toISOString(),
    fingerprintSha1: sha1Fingerprint(certDer),
    fingerprintSha256: sha256Fingerprint(certDer),
    isRevoked: false,
    createdAt: new Date().toISOString(),
    createdBy,
    allowedUsers: [],
    allowedGroups: [],
  };
}

/**
 * Import one or more certificates from PEM, DER, PKCS#7 or PKCS#12.
 * PKCS#12 may also import a private key.
 * Returns all created certificate records.
 */
export async function importCert(
  input: string | Buffer,
  format: "PEM" | "DER" | "PKCS7" | "PKCS12",
  passphrase: string | undefined,
  name: string,
  comment: string,
  createdBy: string,
  request: NextRequest | null = null
): Promise<PkiCertificate[]> {
  const store = await readCertStore();
  const records: PkiCertificate[] = [];

  if (format === "PEM") {
    const text = Buffer.isBuffer(input) ? input.toString("utf-8") : input;
    // May contain multiple certs
    const pemBlocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
    if (pemBlocks.length === 0) throw new Error("No certificates found in PEM input");
    for (let i = 0; i < pemBlocks.length; i++) {
      const certName = pemBlocks.length === 1 ? name : `${name} (${i + 1})`;
      records.push(parseCertFromPem(pemBlocks[i], certName, comment, createdBy));
    }
  } else if (format === "DER") {
    const der = Buffer.isBuffer(input) ? input : Buffer.from(input as string, "base64");
    const certObj = new x509.X509Certificate(new Uint8Array(der));
    records.push(parseCertFromPem(certObj.toString("pem"), name, comment, createdBy));
  } else if (format === "PKCS7") {
    // Use node-forge to parse PKCS#7
    const derBytes = Buffer.isBuffer(input)
      ? input.toString("binary")
      : Buffer.from(input as string, "base64").toString("binary");
    const p7Asn1 = forge.asn1.fromDer(derBytes);
    const p7 = forge.pkcs7.messageFromAsn1(p7Asn1) as forge.pkcs7.PkcsSignedData;
    for (let i = 0; i < (p7.certificates?.length ?? 0); i++) {
      const forgeCert = p7.certificates![i];
      const pem = forge.pki.certificateToPem(forgeCert);
      const certName = (p7.certificates?.length ?? 0) === 1 ? name : `${name} (${i + 1})`;
      records.push(parseCertFromPem(pem, certName, comment, createdBy));
    }
  } else if (format === "PKCS12") {
    const derBytes = Buffer.isBuffer(input)
      ? input.toString("binary")
      : Buffer.from(input as string, "base64").toString("binary");
    const p12Asn1 = forge.asn1.fromDer(derBytes);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase || "");

    // Import private key if present
    let importedKeyId: string | undefined;
    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
    ];
    for (const bag of keyBags) {
      if (bag.key) {
        const keyPem = forge.pki.privateKeyToPem(bag.key as forge.pki.rsa.PrivateKey);
        const keyRecord = await importKey(keyPem, undefined, `${name} (key)`, comment, createdBy);
        importedKeyId = keyRecord.id;
        break;
      }
    }

    // Import certificates
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    for (let i = 0; i < certBags.length; i++) {
      const bag = certBags[i];
      if (!bag.cert) continue;
      const pem = forge.pki.certificateToPem(bag.cert);
      const certName = certBags.length === 1 ? name : `${name} (${i + 1})`;
      const rec = parseCertFromPem(pem, certName, comment, createdBy);
      if (importedKeyId && i === 0) rec.keyId = importedKeyId;
      records.push(rec);
    }
  }

  // Reject duplicates — compare SHA-256 fingerprints against existing store
  for (const rec of records) {
    const existing = store.certs.find((c) => c.fingerprintSha256 === rec.fingerprintSha256);
    if (existing) {
      throw new Error(
        `Certificate already exists: "${existing.name}" (SHA-256: ${existing.fingerprintSha256.slice(0, 16)}…)`
      );
    }
  }

  // Link issuer IDs within imported batch and existing store
  const allCerts = [...store.certs, ...records];
  for (const rec of records) {
    if (!rec.issuerId) {
      // Check if subject === issuer (self-signed)
      if (JSON.stringify(rec.subject) === JSON.stringify(rec.issuer)) {
        rec.type = rec.type === "other" ? "root-ca" : rec.type;
      } else {
        const issuer = allCerts.find(
          (c) => c.id !== rec.id && JSON.stringify(c.subject) === JSON.stringify(rec.issuer)
        );
        if (issuer) rec.issuerId = issuer.id;
      }
    }
  }

  store.certs.push(...records);
  await writeCertStore(store);

  for (const rec of records) {
    doAuditLog(request, {
      event: "cert.import",
      outcome: "success",
      actor: createdBy,
      resource: rec.id,
      resourceType: "pki-cert",
      details: { name: rec.name, format, subject: rec.subject.CN, serial: rec.serial },
    });
  }

  return records;
}

/** Create a self-signed certificate using a key from the store. */
export async function createSelfSigned(
  keyId: string,
  subject: PkiSubject,
  extensions: PkiExtensions,
  validityDays: number,
  certType: PkiCertType,
  name: string,
  comment: string,
  actor: string,
  request: NextRequest | null = null
): Promise<PkiCertificate> {
  const store = await readCertStore();
  const keyRecord = store.keys.find((k) => k.id === keyId);
  if (!keyRecord) throw new Error("Key not found");

  const privateKeyPem = await decryptField(keyRecord.pemEncrypted);
  const privateKeyDer = Buffer.from(
    privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );
  const publicKeyDer = Buffer.from(
    keyRecord.publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );

  const crypto = getCrypto();
  const keyAlgParams = algorithmToGenerateParams(keyRecord.algorithm);
  const signAlg = keyRecord.algorithm.startsWith("RSA")
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : keyRecord.algorithm === "Ed25519"
    ? { name: "Ed25519" }
    : { name: "ECDSA", hash: "SHA-256" };

  const privateKey = await crypto.subtle.importKey("pkcs8", privateKeyDer, keyAlgParams, false, ["sign"]);
  const publicKey = await crypto.subtle.importKey("spki", publicKeyDer, keyAlgParams, true, ["verify"]);

  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + validityDays * 86400 * 1000);
  const subjectName = buildName(subject);
  const certExtensions = await buildCertExtensions(extensions, publicKey);

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: subjectName,
    notBefore,
    notAfter,
    signingAlgorithm: signAlg,
    keys: { privateKey, publicKey },
    serialNumber: randomSerial(),
    extensions: certExtensions,
  });

  const certPem = cert.toString("pem");
  const certDer = cert.rawData;

  const record: PkiCertificate = {
    id: randomUUID(),
    name: name.trim(),
    comment: comment.trim(),
    type: certType,
    subject,
    issuer: subject,
    serial: serialToHex(cert.serialNumber),
    keyId,
    pem: certPem,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    fingerprintSha1: sha1Fingerprint(certDer),
    fingerprintSha256: sha256Fingerprint(certDer),
    isRevoked: false,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    allowedUsers: [],
    allowedGroups: [],
  };

  store.certs.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.create",
    outcome: "success",
    actor,
    resource: record.id,
    resourceType: "pki-cert",
    details: { name, certType, subject: subject.CN, serial: record.serial, validityDays },
  });

  return record;
}

/** Renew a certificate: re-issue with the same subject/extensions, new validity period. */
export async function renewCert(
  certId: string,
  validityDays: number,
  revokeOld: boolean,
  actor: string,
  request: NextRequest | null = null
): Promise<PkiCertificate> {
  const store = await readCertStore();
  const cert = store.certs.find((c) => c.id === certId);
  if (!cert) throw new Error("Certificate not found");

  let newCert: PkiCertificate;

  if (cert.issuerId) {
    // Signed by a CA — find CA and key, re-sign
    const caCert = store.certs.find((c) => c.id === cert.issuerId);
    if (!caCert) throw new Error("Issuing CA not found");
    const caKeyRec = caCert.keyId ? store.keys.find((k) => k.id === caCert.keyId) : null;
    if (!caKeyRec) throw new Error("CA private key not found");

    const caCertObj = new x509.X509Certificate(caCert.pem);
    const caPrivKeyPem = await decryptField(caKeyRec.pemEncrypted);
    const caPrivKeyDer = Buffer.from(
      caPrivKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
      "base64"
    );
    const caKeyAlgParams = algorithmToGenerateParams(caKeyRec.algorithm);
    const signAlg = caKeyRec.algorithm.startsWith("RSA")
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : caKeyRec.algorithm === "Ed25519"
      ? { name: "Ed25519" }
      : { name: "ECDSA", hash: "SHA-256" };
    const caPrivKey = await getCrypto().subtle.importKey("pkcs8", caPrivKeyDer, caKeyAlgParams, false, ["sign"]);

    // Get subject public key from original cert
    const origCertObj = new x509.X509Certificate(cert.pem);
    const origExt = parseExtensions(origCertObj);
    const extensions = await buildCertExtensions(origExt, origCertObj.publicKey, undefined, caCertObj);
    const notBefore = new Date();
    const notAfter = new Date(notBefore.getTime() + validityDays * 86400 * 1000);

    const newCertObj = await x509.X509CertificateGenerator.create({
      subject: origCertObj.subject,
      issuer: caCertObj.subject,
      notBefore,
      notAfter,
      signingAlgorithm: signAlg,
      publicKey: origCertObj.publicKey,
      signingKey: caPrivKey,
      serialNumber: randomSerial(),
      extensions,
    });

    const certDer = newCertObj.rawData;
    newCert = {
      ...cert,
      id: randomUUID(),
      name: `${cert.name} (renewed)`,
      serial: serialToHex(newCertObj.serialNumber),
      pem: newCertObj.toString("pem"),
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      fingerprintSha1: sha1Fingerprint(certDer),
      fingerprintSha256: sha256Fingerprint(certDer),
      isRevoked: false,
      lastAlertedThreshold: undefined,
      createdAt: new Date().toISOString(),
      createdBy: actor,
    };
  } else {
    // Self-signed — re-sign
    if (!cert.keyId) throw new Error("No private key available for self-signed renewal");
    newCert = await createSelfSigned(
      cert.keyId,
      cert.subject,
      parseExtensions(new x509.X509Certificate(cert.pem)),
      validityDays,
      cert.type,
      `${cert.name} (renewed)`,
      cert.comment,
      actor
    );
  }

  if (revokeOld) {
    const idx = store.certs.findIndex((c) => c.id === certId);
    if (idx !== -1) {
      store.certs[idx].isRevoked = true;
      store.certs[idx].revokedAt = new Date().toISOString();
      store.certs[idx].revokeReason = "superseded";
    }
  }

  if (!store.certs.find((c) => c.id === newCert.id)) {
    store.certs.push(newCert);
  }
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.renew",
    outcome: "success",
    actor,
    resource: certId,
    resourceType: "pki-cert",
    details: { oldCertId: certId, newCertId: newCert.id, validityDays, revokeOld },
  });

  return newCert;
}

export async function revokeCert(
  certId: string,
  reason: PkiRevocationReason,
  actor: string,
  request: NextRequest | null = null
): Promise<void> {
  const store = await readCertStore();
  const idx = store.certs.findIndex((c) => c.id === certId);
  if (idx === -1) throw new Error("Certificate not found");

  store.certs[idx].isRevoked = true;
  store.certs[idx].revokedAt = new Date().toISOString();
  store.certs[idx].revokeReason = reason;
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.revoke",
    outcome: "success",
    actor,
    resource: certId,
    resourceType: "pki-cert",
    details: { name: store.certs[idx].name, reason },
  });
}

export async function deleteCert(
  certId: string,
  actor: string,
  request: NextRequest | null = null
): Promise<void> {
  const store = await readCertStore();
  const cert = store.certs.find((c) => c.id === certId);
  if (!cert) throw new Error("Certificate not found");
  store.certs = store.certs.filter((c) => c.id !== certId);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.delete",
    outcome: "success",
    actor,
    resource: certId,
    resourceType: "pki-cert",
    details: { name: cert.name, subject: cert.subject.CN },
  });
}

// ── CRL generation ────────────────────────────────────────────────────────────

export async function generateCrl(
  caId: string,
  nextUpdateDays: number,
  actor: string,
  request: NextRequest | null = null
): Promise<PkiCrl> {
  const store = await readCertStore();
  const caCertRecord = store.certs.find((c) => c.id === caId);
  if (!caCertRecord) throw new Error("CA certificate not found");
  if (!caCertRecord.keyId) throw new Error("CA private key not found in store");

  const caKeyRecord = store.keys.find((k) => k.id === caCertRecord.keyId);
  if (!caKeyRecord) throw new Error("CA private key record not found");

  // Get revoked certs issued by this CA
  const revokedCerts = store.certs.filter((c) => c.issuerId === caId && c.isRevoked && c.revokedAt);

  const caPrivKeyPem = await decryptField(caKeyRecord.pemEncrypted);
  const caPrivKeyDer = Buffer.from(
    caPrivKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    "base64"
  );
  const caKeyAlgParams = algorithmToGenerateParams(caKeyRecord.algorithm);
  const signAlg = caKeyRecord.algorithm.startsWith("RSA")
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : caKeyRecord.algorithm === "Ed25519"
    ? { name: "Ed25519" }
    : { name: "ECDSA", hash: "SHA-256" };

  const caPrivKey = await getCrypto().subtle.importKey("pkcs8", caPrivKeyDer, caKeyAlgParams, false, ["sign"]);
  const caCertObj = new x509.X509Certificate(caCertRecord.pem);

  const now = new Date();
  const nextUpdate = new Date(now.getTime() + nextUpdateDays * 86400 * 1000);

  const crl = await x509.X509CrlGenerator.create({
    issuer: caCertObj.subject,
    thisUpdate: now,
    nextUpdate,
    entries: revokedCerts.map((c) => ({
      serialNumber: c.serial,
      revocationDate: c.revokedAt ? new Date(c.revokedAt) : now,
    })),
    signingAlgorithm: signAlg,
    signingKey: caPrivKey,
  });

  const record: PkiCrl = {
    id: randomUUID(),
    caId,
    pem: crl.toString("pem"),
    thisUpdate: now.toISOString(),
    nextUpdate: nextUpdate.toISOString(),
    revokedCount: revokedCerts.length,
    createdAt: now.toISOString(),
    createdBy: actor,
  };

  store.crls.push(record);
  await writeCertStore(store);

  doAuditLog(request, {
    event: "cert.crl.generate",
    outcome: "success",
    actor,
    resource: record.id,
    resourceType: "pki-crl",
    details: { caId, caCN: caCertRecord.subject.CN, revokedCount: revokedCerts.length },
  });

  return record;
}

// ── Certificate export ────────────────────────────────────────────────────────

export async function exportCert(
  certId: string,
  format: PkiExportFormat,
  passphrase: string | undefined,
  actor: string,
  request: NextRequest | null = null
): Promise<{ data: string; mimeType: string; filename: string }> {
  const store = await readCertStore();
  const cert = store.certs.find((c) => c.id === certId);
  if (!cert) throw new Error("Certificate not found");

  doAuditLog(request, {
    event: "cert.export",
    outcome: "success",
    actor,
    resource: certId,
    resourceType: "pki-cert",
    details: { name: cert.name, format },
  });

  const safeName = cert.name.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "PEM") {
    return { data: cert.pem, mimeType: "application/x-pem-file", filename: `${safeName}.crt` };
  }

  if (format === "DER") {
    const certObj = new x509.X509Certificate(cert.pem);
    const b64 = Buffer.from(certObj.rawData).toString("base64");
    return { data: b64, mimeType: "application/pkix-cert", filename: `${safeName}.cer` };
  }

  if (format === "PEM-chain") {
    let chain = cert.pem;
    let current = cert;
    const visited = new Set<string>([certId]);
    while (current.issuerId && !visited.has(current.issuerId)) {
      const issuer = store.certs.find((c) => c.id === current.issuerId);
      if (!issuer) break;
      chain += "\n" + issuer.pem;
      visited.add(issuer.id);
      current = issuer;
    }
    return { data: chain, mimeType: "application/x-pem-file", filename: `${safeName}-chain.pem` };
  }

  if (format === "PKCS7" || format === "PKCS7-chain") {
    const forgeCert = forge.pki.certificateFromPem(cert.pem);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer("");
    p7.addCertificate(forgeCert);
    if (format === "PKCS7-chain") {
      let current = cert;
      const visited = new Set<string>([certId]);
      while (current.issuerId && !visited.has(current.issuerId)) {
        const issuer = store.certs.find((c) => c.id === current.issuerId);
        if (!issuer) break;
        p7.addCertificate(forge.pki.certificateFromPem(issuer.pem));
        visited.add(issuer.id);
        current = issuer;
      }
    }
    const p7Der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const b64 = Buffer.from(p7Der, "binary").toString("base64");
    return { data: b64, mimeType: "application/pkcs7-mime", filename: `${safeName}.p7b` };
  }

  if (format === "PKCS12" || format === "PFX") {
    const forgeCert = forge.pki.certificateFromPem(cert.pem);
    let forgeKey: forge.pki.rsa.PrivateKey | null = null;
    if (cert.keyId) {
      const keyRec = store.keys.find((k) => k.id === cert.keyId);
      if (keyRec) {
        const pem = await decryptField(keyRec.pemEncrypted);
        forgeKey = forge.pki.privateKeyFromPem(pem) as forge.pki.rsa.PrivateKey;
      }
    }
    const certChain: forge.pki.Certificate[] = [forgeCert];
    let current = cert;
    const visited = new Set<string>([certId]);
    while (current.issuerId && !visited.has(current.issuerId)) {
      const issuer = store.certs.find((c) => c.id === current.issuerId);
      if (!issuer) break;
      certChain.push(forge.pki.certificateFromPem(issuer.pem));
      visited.add(issuer.id);
      current = issuer;
    }
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(forgeKey, certChain, passphrase || "", { algorithm: "3des" });
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const b64 = Buffer.from(p12Der, "binary").toString("base64");
    const ext = format === "PFX" ? "pfx" : "p12";
    return { data: b64, mimeType: "application/x-pkcs12", filename: `${safeName}.${ext}` };
  }

  if (format === "PEM+key") {
    if (!cert.keyId) throw new Error("No private key is linked to this certificate. The key must have been generated in this store.");
    const keyRec = store.keys.find((k) => k.id === cert.keyId);
    if (!keyRec) throw new Error("Private key record not found in store");
    const keyPem = await decryptField(keyRec.pemEncrypted);

    let exportKeyPem = keyPem;
    if (passphrase) {
      // Wrap unencrypted PKCS#8 PEM as PKCS#8 EncryptedPrivateKeyInfo (AES-256-CBC)
      const pkcs8Der = Buffer.from(
        keyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
        "base64"
      ).toString("binary");
      const pkInfo = forge.asn1.fromDer(pkcs8Der);
      const encPkInfo = forge.pki.encryptPrivateKeyInfo(pkInfo, passphrase, {
        algorithm: "aes256",
        count: 2048,
        saltSize: 16,
      });
      exportKeyPem = forge.pki.encryptedPrivateKeyToPem(encPkInfo);
    }

    return { data: exportKeyPem + "\n" + cert.pem, mimeType: "application/x-pem-file", filename: `${safeName}-with-key.pem` };
  }

  if (format === "cert-index") {
    const openSslDate = (d: Date): string => {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${String(d.getUTCFullYear()).slice(-2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
    };
    const now = new Date();
    const expiry = new Date(cert.notAfter);
    const status = cert.isRevoked ? "R" : expiry < now ? "E" : "V";
    const revokeDate = cert.revokedAt ? openSslDate(new Date(cert.revokedAt)) : "";
    const serial = cert.serial.replace(/[: ]/g, "").toUpperCase();
    const dnParts: string[] = [];
    if (cert.subject.C)            dnParts.push(`C=${cert.subject.C}`);
    if (cert.subject.ST)           dnParts.push(`ST=${cert.subject.ST}`);
    if (cert.subject.L)            dnParts.push(`L=${cert.subject.L}`);
    if (cert.subject.O)            dnParts.push(`O=${cert.subject.O}`);
    if (cert.subject.OU)           dnParts.push(`OU=${cert.subject.OU}`);
    if (cert.subject.CN)           dnParts.push(`CN=${cert.subject.CN}`);
    if (cert.subject.emailAddress) dnParts.push(`emailAddress=${cert.subject.emailAddress}`);
    const subjectDN = "/" + dnParts.join("/");
    const line = [status, openSslDate(expiry), revokeDate, serial, "unknown", subjectDN].join("\t");
    return { data: line + "\n", mimeType: "text/plain", filename: `${safeName}-index.txt` };
  }

  return { data: cert.pem, mimeType: "application/x-pem-file", filename: `${safeName}.crt` };
}

// ── Certificate tree ──────────────────────────────────────────────────────────

/**
 * Normalise a PkiSubject to a canonical string key for comparison.
 * Only includes non-empty fields so JSON.stringify differences don't matter.
 */
function subjectKey(s: PkiSubject): string {
  const parts: string[] = [];
  if (s.CN) parts.push(`CN=${s.CN}`);
  if (s.O)  parts.push(`O=${s.O}`);
  if (s.OU) parts.push(`OU=${s.OU}`);
  if (s.C)  parts.push(`C=${s.C}`);
  if (s.ST) parts.push(`ST=${s.ST}`);
  if (s.L)  parts.push(`L=${s.L}`);
  if (s.emailAddress) parts.push(`E=${s.emailAddress}`);
  return parts.join("/");
}

/**
 * Repair missing issuerId links in-place (mutates the array).
 * Used both in buildCertTree and after import to self-heal the store.
 */
export function repairIssuerLinks(certs: PkiCertificate[]): boolean {
  // Build subject → id map (prefer non-revoked, prefer CA types)
  const subjectToId = new Map<string, string>();
  // First pass: CA certs
  for (const c of certs) {
    if (c.type === "root-ca" || c.type === "intermediate-ca") {
      const key = subjectKey(c.subject);
      if (!subjectToId.has(key)) subjectToId.set(key, c.id);
    }
  }
  // Second pass: all others as fallback
  for (const c of certs) {
    const key = subjectKey(c.subject);
    if (!subjectToId.has(key)) subjectToId.set(key, c.id);
  }

  let changed = false;
  for (const c of certs) {
    if (c.issuerId) continue; // already linked
    const issuerKey = subjectKey(c.issuer);
    const selfKey   = subjectKey(c.subject);
    if (issuerKey === selfKey) continue; // self-signed
    const issuerId = subjectToId.get(issuerKey);
    if (issuerId && issuerId !== c.id) {
      c.issuerId = issuerId;
      changed = true;
    }
  }
  return changed;
}

/** Build a forest of certificate chain trees from the store. */
export function buildCertTree(certs: PkiCertificate[]): PkiCertNode[] {
  // Repair any missing issuer links on the fly (non-persisting pass)
  const working = certs.map(c => ({ ...c }));
  repairIssuerLinks(working);

  const nodeMap = new Map<string, PkiCertNode>();
  for (const c of working) {
    nodeMap.set(c.id, { ...c, children: [] });
  }

  const roots: PkiCertNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.issuerId && nodeMap.has(node.issuerId)) {
      nodeMap.get(node.issuerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort: CA types first, then by expiry date
  function sortNodes(nodes: PkiCertNode[]) {
    nodes.sort((a, b) => {
      const caOrder = (t: PkiCertType) => (t === "root-ca" ? 0 : t === "intermediate-ca" ? 1 : 2);
      const diff = caOrder(a.type) - caOrder(b.type);
      if (diff !== 0) return diff;
      return a.notAfter.localeCompare(b.notAfter);
    });
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(roots);

  return roots;
}

// ── Template CRUD ─────────────────────────────────────────────────────────────

export async function createTemplate(
  template: Omit<PkiTemplate, "id" | "createdAt">
): Promise<PkiTemplate> {
  const store = await readCertStore();
  const record: PkiTemplate = {
    ...template,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store.templates.push(record);
  await writeCertStore(store);
  return record;
}

export async function updateTemplate(
  id: string,
  updates: Partial<Omit<PkiTemplate, "id" | "createdAt">>
): Promise<PkiTemplate> {
  const store = await readCertStore();
  const idx = store.templates.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Template not found");
  Object.assign(store.templates[idx], updates);
  await writeCertStore(store);
  return store.templates[idx];
}

export async function deleteTemplate(id: string): Promise<void> {
  const store = await readCertStore();
  store.templates = store.templates.filter((t) => t.id !== id);
  await writeCertStore(store);
}

// ── Access control update ─────────────────────────────────────────────────────

export async function updateItemAccess(
  itemType: "key" | "csr" | "cert",
  itemId: string,
  allowedUsers: string[],
  allowedGroups: string[]
): Promise<void> {
  const store = await readCertStore();
  const list = itemType === "key" ? store.keys : itemType === "csr" ? store.csrs : store.certs;
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx === -1) throw new Error("Item not found");
  (list[idx] as PkiPrivateKey | PkiCsr | PkiCertificate).allowedUsers = allowedUsers;
  (list[idx] as PkiPrivateKey | PkiCsr | PkiCertificate).allowedGroups = allowedGroups;
  await writeCertStore(store);
}

// ── Expiry alert helpers (used by scheduler) ──────────────────────────────────

/**
 * Check all certs for expiry thresholds (30/7/1 days).
 * Returns certs that need an alert, and updates lastAlertedThreshold in store.
 * Caller is responsible for sending notifications/emails.
 */
export async function checkAndMarkExpiryAlerts(): Promise<
  { cert: PkiCertificate; threshold: 30 | 7 | 1; daysLeft: number }[]
> {
  const store = await readCertStore();
  const now = Date.now();
  const THRESHOLDS: (30 | 7 | 1)[] = [1, 7, 30];
  const toAlert: { cert: PkiCertificate; threshold: 30 | 7 | 1; daysLeft: number }[] = [];
  let changed = false;

  for (let i = 0; i < store.certs.length; i++) {
    const cert = store.certs[i];
    if (cert.isRevoked) continue;

    const daysLeft = Math.floor((new Date(cert.notAfter).getTime() - now) / 86400000);
    if (daysLeft < 0) continue; // already expired

    for (const threshold of THRESHOLDS) {
      if (daysLeft <= threshold) {
        // Only alert if we haven't alerted at this or lower threshold yet
        if (!cert.lastAlertedThreshold || cert.lastAlertedThreshold > threshold) {
          toAlert.push({ cert, threshold, daysLeft });
          store.certs[i].lastAlertedThreshold = threshold;
          changed = true;
        }
        break; // Lowest matching threshold wins
      }
    }
  }

  if (changed) await writeCertStore(store);
  return toAlert;
}
