/**
 * Field-level AES-256-GCM encryption utility.
 *
 * Used to encrypt sensitive user fields (e.g. TOTP secrets) at rest.
 * Key is separate from the audit-log key so they can be rotated independently.
 *
 * Format: ENC:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 * Transparent decryption: if the value does not start with "ENC:" it is
 * returned as-is for backward compatibility.
 */

import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";

const SECRET_KEY_FILE = "secret-key.json";

let _keyPromise: Promise<Buffer> | null = null;

async function getSecretKey(): Promise<Buffer> {
  if (!_keyPromise) {
    _keyPromise = _loadOrGenerateKey().catch((err) => {
      _keyPromise = null;
      throw err;
    });
  }
  return _keyPromise;
}

async function _loadOrGenerateKey(): Promise<Buffer> {
  // Allow injecting key via environment for HSM / vault integration
  const envKey = process.env.SECRET_FIELD_KEY;
  if (envKey) {
    return pbkdf2Sync(envKey, "doc-it-secret-v1", 100_000, 32, "sha256");
  }

  const stored = await readJsonConfig<{ key?: string }>(SECRET_KEY_FILE, {});
  if (stored.key) {
    return Buffer.from(stored.key, "base64");
  }

  const newKey = randomBytes(32);
  await writeJsonConfig(SECRET_KEY_FILE, { key: newKey.toString("base64") });
  return newKey;
}

/** Expose the secret key for backup encryption (returns base64-encoded 32-byte key). */
export async function getSecretKeyBase64(): Promise<string> {
  const key = await getSecretKey();
  return key.toString("base64");
}

/** SHA-256 fingerprint (first 16 hex chars) of the current key — safe to display. */
export async function getKeyFingerprint(): Promise<string> {
  const key = await getSecretKey();
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Rotate the secret key: generate a new random 32-byte key, persist it,
 * and return both old and new keys so callers can re-encrypt data.
 * NOTE: only works for file-based keys (not SECRET_FIELD_KEY env var).
 */
export async function rotateSecretKey(): Promise<{ oldKey: Buffer; newKey: Buffer }> {
  if (process.env.SECRET_FIELD_KEY) {
    throw new Error("Cannot rotate key when SECRET_FIELD_KEY env var is set. Update the env var manually.");
  }
  const oldKey = await getSecretKey();
  const newKey = randomBytes(32);
  await writeJsonConfig(SECRET_KEY_FILE, { key: newKey.toString("base64") });
  _keyPromise = Promise.resolve(newKey);
  return { oldKey, newKey };
}

/** Decrypt a value with an explicit key (used during key rotation). */
export function decryptFieldWithKey(value: string, key: Buffer): string {
  if (!value.startsWith("ENC:")) return value;
  const rest = value.slice(4);
  const first = rest.indexOf(":");
  const second = rest.indexOf(":", first + 1);
  if (first === -1 || second === -1) return value;
  const iv = Buffer.from(rest.slice(0, first), "base64");
  const authTag = Buffer.from(rest.slice(first + 1, second), "base64");
  const ciphertext = Buffer.from(rest.slice(second + 1), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

/** Encrypt a value with an explicit key (used during key rotation). */
export function encryptFieldWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `ENC:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Encrypt a plaintext string. Returns `ENC:<iv>:<authTag>:<ciphertext>`. */
export async function encryptField(plain: string): Promise<string> {
  const key = await getSecretKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `ENC:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a field. Transparent: plaintext values (no ENC: prefix) are
 * returned unchanged for backward compatibility.
 */
export async function decryptField(value: string): Promise<string> {
  if (!value.startsWith("ENC:")) return value;
  const rest = value.slice(4);
  const first = rest.indexOf(":");
  const second = rest.indexOf(":", first + 1);
  if (first === -1 || second === -1) return value;
  const iv = Buffer.from(rest.slice(0, first), "base64");
  const authTag = Buffer.from(rest.slice(first + 1, second), "base64");
  const ciphertext = Buffer.from(rest.slice(second + 1), "base64");
  const key = await getSecretKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
  } catch {
    console.warn("decryptField: decryption failed — key mismatch or corrupted data");
    return "";
  }
}
