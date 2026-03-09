/**
 * Encryption key rotation.
 *
 * Orchestrates a full rotation of the field-encryption key:
 *   1. Generate new key (via rotateSecretKey)
 *   2. Re-encrypt user TOTP secrets in users.json
 *   3. Re-encrypt CIFS passwords in backup.json
 *   4. Re-encrypt .tar.gz.enc backup archives
 *
 * Returns a summary of what was re-encrypted and the new key (base64)
 * so the admin can store it safely.
 */

import fs from "fs/promises";
import path from "path";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import {
  rotateSecretKey,
  decryptFieldWithKey,
  encryptFieldWithKey,
} from "./crypto";
import { getUsers, writeUsers } from "./auth";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { BackupConfig, BackupTarget } from "./types";

const BACKUP_CONFIG_FILE = "backup.json";
const BACKUPS_DIR = path.join(process.cwd(), "backups");

export interface RotationSummary {
  totpSecretsRotated: number;
  cifsPasswordsRotated: number;
  backupFilesRotated: number;
  errors: string[];
  newKeyBase64: string;
}

export async function rotateAllEncryption(): Promise<RotationSummary> {
  const summary: RotationSummary = {
    totpSecretsRotated: 0,
    cifsPasswordsRotated: 0,
    backupFilesRotated: 0,
    errors: [],
    newKeyBase64: "",
  };

  // 1. Rotate the key (writes new key to disk, returns both)
  const { oldKey, newKey } = await rotateSecretKey();
  summary.newKeyBase64 = newKey.toString("base64");

  // 2. Re-encrypt TOTP secrets in users.json
  try {
    const users = await getUsers();
    let changed = false;
    for (const user of users) {
      if (user.totpSecret && user.totpSecret.startsWith("ENC:")) {
        try {
          const plain = decryptFieldWithKey(user.totpSecret, oldKey);
          user.totpSecret = encryptFieldWithKey(plain, newKey);
          summary.totpSecretsRotated++;
          changed = true;
        } catch (err) {
          summary.errors.push(`Failed to re-encrypt TOTP for ${user.username}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    if (changed) await writeUsers(users);
  } catch (err) {
    summary.errors.push(`Failed to process users.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Re-encrypt CIFS passwords in backup.json
  try {
    const config = await readJsonConfig<BackupConfig>(BACKUP_CONFIG_FILE, {
      enabled: false,
      schedule: "manual",
      scheduleTime: "02:00",
      scheduleDayOfWeek: 1,
      retentionCount: 14,
      targets: [],
    });
    let changed = false;
    for (const target of config.targets) {
      if (target.type === "cifs" && (target as Extract<BackupTarget, { type: "cifs" }>).password) {
        const cifsTarget = target as Extract<BackupTarget, { type: "cifs" }>;
        if (cifsTarget.password && cifsTarget.password.startsWith("ENC:")) {
          try {
            const plain = decryptFieldWithKey(cifsTarget.password, oldKey);
            cifsTarget.password = encryptFieldWithKey(plain, newKey);
            summary.cifsPasswordsRotated++;
            changed = true;
          } catch (err) {
            summary.errors.push(`Failed to re-encrypt CIFS password for target ${target.label || target.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
    if (changed) await writeJsonConfig(BACKUP_CONFIG_FILE, config);
  } catch (err) {
    summary.errors.push(`Failed to process backup.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Re-encrypt .tar.gz.enc backup archive files
  try {
    await fs.mkdir(BACKUPS_DIR, { recursive: true });
    const files = await fs.readdir(BACKUPS_DIR);
    for (const file of files) {
      if (!file.endsWith(".tar.gz.enc")) continue;
      const filePath = path.join(BACKUPS_DIR, file);
      try {
        const raw = await fs.readFile(filePath);

        // Decrypt with old key
        const iv = raw.subarray(0, 16);
        const authTag = raw.subarray(raw.length - 16);
        const encrypted = raw.subarray(16, raw.length - 16);
        const decipher = createDecipheriv("aes-256-gcm", oldKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

        // Re-encrypt with new key
        const newIv = randomBytes(16);
        const cipher = createCipheriv("aes-256-gcm", newKey, newIv);
        const reEncrypted = Buffer.concat([cipher.update(decrypted), cipher.final()]);
        const newAuthTag = cipher.getAuthTag();

        // Write back: [IV][ciphertext][authTag]
        const output = Buffer.concat([newIv, reEncrypted, newAuthTag]);
        await fs.writeFile(filePath, output);
        summary.backupFilesRotated++;
      } catch (err) {
        summary.errors.push(`Failed to re-encrypt ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    summary.errors.push(`Failed to scan backups directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  return summary;
}
