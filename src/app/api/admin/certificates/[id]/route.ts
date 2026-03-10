import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readCertStore, deleteKey, deleteCsr, deleteCert } from "@/lib/certificates";
import { decryptField } from "@/lib/crypto";
import { auditLog } from "@/lib/audit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/certificates/[id]
 * Returns a single PKI item (key/csr/cert/crl) by ID.
 * For private keys, returns decrypted PEM only when ?includePrivateKey=1.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const includePrivateKey = request.nextUrl.searchParams.get("includePrivateKey") === "1";

  const store = await readCertStore();

  // Search across all collections
  const key = store.keys.find((k) => k.id === id);
  if (key) {
    const { pemEncrypted, ...safeKey } = key;
    if (includePrivateKey) {
      auditLog(request, { event: "cert.key.export", outcome: "success", actor: user.username, resource: id, resourceType: "pki-key", details: { format: "PEM", via: "direct-access" } });
      const pem = await decryptField(pemEncrypted);
      return NextResponse.json({ type: "key", item: { ...safeKey, pem } });
    }
    return NextResponse.json({ type: "key", item: safeKey });
  }

  const csr = store.csrs.find((c) => c.id === id);
  if (csr) return NextResponse.json({ type: "csr", item: csr });

  const cert = store.certs.find((c) => c.id === id);
  if (cert) return NextResponse.json({ type: "cert", item: cert });

  const crl = store.crls.find((c) => c.id === id);
  if (crl) return NextResponse.json({ type: "crl", item: crl });

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * DELETE /api/admin/certificates/[id]?itemType=key|csr|cert
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const itemType = request.nextUrl.searchParams.get("itemType") || "cert";

  try {
    if (itemType === "key") await deleteKey(id, user.username, request);
    else if (itemType === "csr") await deleteCsr(id, user.username, request);
    else await deleteCert(id, user.username, request);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
