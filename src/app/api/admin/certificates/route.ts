import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readCertStore,
  buildCertTree,
  repairIssuerLinks,
  generateKey,
  importKey,
  exportKey,
  deleteKey,
  createCsr,
  importCsr,
  deleteCsr,
  signCsr,
  importCert,
  createSelfSigned,
  revokeCert,
  renewCert,
  deleteCert,
  generateCrl,
  exportCert,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  updateItemAccess,
} from "@/lib/certificates";
import { writeJsonConfig } from "@/lib/config";
import type { PkiKeyAlgorithm, PkiCertType, PkiExportFormat, PkiRevocationReason } from "@/lib/types";

/** GET /api/admin/certificates — returns the full PKI store (keys without private PEM). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await readCertStore();

  // Self-heal: persist any newly resolved issuer links (e.g. certs imported out-of-order)
  if (repairIssuerLinks(store.certs)) {
    await writeJsonConfig("certificates.json", store);
  }

  // Strip encrypted private keys before returning
  const safeKeys = store.keys.map(({ pemEncrypted: _p, ...rest }) => rest);
  const tree = buildCertTree(store.certs);

  return NextResponse.json({ ...store, keys: safeKeys, tree });
}

/** POST /api/admin/certificates — action-based dispatcher. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;

  try {
    switch (action) {
      // ── Key actions ────────────────────────────────────────────────
      case "generateKey": {
        const { algorithm, name, comment = "" } = body;
        if (!algorithm || !name) return NextResponse.json({ error: "algorithm and name are required" }, { status: 400 });
        const key = await generateKey(algorithm as PkiKeyAlgorithm, String(name), String(comment), user.username, request);
        const { pemEncrypted: _p, ...safeKey } = key;
        return NextResponse.json({ key: safeKey });
      }

      case "importKey": {
        const { pem, passphrase, name, comment = "" } = body;
        if (!pem || !name) return NextResponse.json({ error: "pem and name are required" }, { status: 400 });
        const key = await importKey(String(pem), passphrase ? String(passphrase) : undefined, String(name), String(comment), user.username, request);
        const { pemEncrypted: _p, ...safeKey } = key;
        return NextResponse.json({ key: safeKey });
      }

      case "exportKey": {
        const { keyId, format, passphrase } = body;
        if (!keyId || !format) return NextResponse.json({ error: "keyId and format are required" }, { status: 400 });
        const result = await exportKey(String(keyId), format as "PEM" | "PKCS8" | "PKCS12", passphrase ? String(passphrase) : undefined, user.username, request);
        return NextResponse.json(result);
      }

      case "deleteKey": {
        const { keyId } = body;
        if (!keyId) return NextResponse.json({ error: "keyId is required" }, { status: 400 });
        await deleteKey(String(keyId), user.username, request);
        return NextResponse.json({ ok: true });
      }

      // ── CSR actions ────────────────────────────────────────────────
      case "createCsr": {
        const { keyId, subject, extensions = {}, name, comment = "" } = body;
        if (!keyId || !subject || !name) return NextResponse.json({ error: "keyId, subject and name are required" }, { status: 400 });
        const csr = await createCsr(String(keyId), subject as never, extensions as never, String(name), String(comment), user.username, request);
        return NextResponse.json({ csr });
      }

      case "importCsr": {
        const { pem, name, comment = "" } = body;
        if (!pem || !name) return NextResponse.json({ error: "pem and name are required" }, { status: 400 });
        const csr = await importCsr(String(pem), String(name), String(comment), user.username, request);
        return NextResponse.json({ csr });
      }

      case "deleteCsr": {
        const { csrId } = body;
        if (!csrId) return NextResponse.json({ error: "csrId is required" }, { status: 400 });
        await deleteCsr(String(csrId), user.username, request);
        return NextResponse.json({ ok: true });
      }

      case "signCsr": {
        const { csrId, caId, validityDays = 365, overrideType, overrideExtensions = {}, certName, certComment = "" } = body;
        if (!csrId || !caId || !certName) return NextResponse.json({ error: "csrId, caId and certName are required" }, { status: 400 });
        const cert = await signCsr(String(csrId), String(caId), Number(validityDays), overrideType as PkiCertType | undefined, overrideExtensions as never, String(certName), String(certComment), user.username, request);
        return NextResponse.json({ cert });
      }

      // ── Certificate actions ─────────────────────────────────────────
      case "importCert": {
        const { pem, format = "PEM", passphrase, name, comment = "" } = body;
        if (!pem || !name) return NextResponse.json({ error: "pem and name are required" }, { status: 400 });
        const certs = await importCert(String(pem), format as "PEM" | "DER" | "PKCS7" | "PKCS12", passphrase ? String(passphrase) : undefined, String(name), String(comment), user.username, request);
        return NextResponse.json({ certs });
      }

      case "createSelfSigned": {
        const { keyId, subject, extensions = {}, validityDays = 365, certType = "other", name, comment = "" } = body;
        if (!keyId || !subject || !name) return NextResponse.json({ error: "keyId, subject and name are required" }, { status: 400 });
        const cert = await createSelfSigned(String(keyId), subject as never, extensions as never, Number(validityDays), certType as PkiCertType, String(name), String(comment), user.username, request);
        return NextResponse.json({ cert });
      }

      case "revokeCert": {
        const { certId, reason = "unspecified" } = body;
        if (!certId) return NextResponse.json({ error: "certId is required" }, { status: 400 });
        await revokeCert(String(certId), reason as PkiRevocationReason, user.username, request);
        return NextResponse.json({ ok: true });
      }

      case "renewCert": {
        const { certId, validityDays = 365, revokeOld = false } = body;
        if (!certId) return NextResponse.json({ error: "certId is required" }, { status: 400 });
        const cert = await renewCert(String(certId), Number(validityDays), Boolean(revokeOld), user.username, request);
        return NextResponse.json({ cert });
      }

      case "deleteCert": {
        const { certId } = body;
        if (!certId) return NextResponse.json({ error: "certId is required" }, { status: 400 });
        await deleteCert(String(certId), user.username, request);
        return NextResponse.json({ ok: true });
      }

      case "exportCert": {
        const { certId, format = "PEM", passphrase } = body;
        if (!certId) return NextResponse.json({ error: "certId is required" }, { status: 400 });
        const result = await exportCert(String(certId), format as PkiExportFormat, passphrase ? String(passphrase) : undefined, user.username, request);
        return NextResponse.json(result);
      }

      case "generateCrl": {
        const { caId, nextUpdateDays = 30 } = body;
        if (!caId) return NextResponse.json({ error: "caId is required" }, { status: 400 });
        const crl = await generateCrl(String(caId), Number(nextUpdateDays), user.username, request);
        return NextResponse.json({ crl });
      }

      // ── Template actions ────────────────────────────────────────────
      case "createTemplate": {
        const { name, type, subject = {}, extensions = {}, validityDays = 365 } = body;
        if (!name || !type) return NextResponse.json({ error: "name and type are required" }, { status: 400 });
        const template = await createTemplate({ name: String(name), type: type as PkiCertType, subject: subject as never, extensions: extensions as never, validityDays: Number(validityDays) });
        return NextResponse.json({ template });
      }

      case "updateTemplate": {
        const { templateId, ...updates } = body;
        if (!templateId) return NextResponse.json({ error: "templateId is required" }, { status: 400 });
        delete updates.action;
        const template = await updateTemplate(String(templateId), updates as never);
        return NextResponse.json({ template });
      }

      case "deleteTemplate": {
        const { templateId } = body;
        if (!templateId) return NextResponse.json({ error: "templateId is required" }, { status: 400 });
        await deleteTemplate(String(templateId));
        return NextResponse.json({ ok: true });
      }

      // ── Access control ──────────────────────────────────────────────
      case "updateAccess": {
        const { itemType, itemId, allowedUsers = [], allowedGroups = [] } = body;
        if (!itemType || !itemId) return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
        await updateItemAccess(itemType as "key" | "csr" | "cert", String(itemId), allowedUsers as string[], allowedGroups as string[]);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
