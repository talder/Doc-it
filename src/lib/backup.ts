/**
 * Backup subsystem.
 *
 * Creates tar.gz archives of the application data directories, writes them
 * to a local backups/ directory, then optionally copies them to additional
 * targets:
 *   - Local path  — covers pre-mounted NFS shares too (admin mounts externally)
 *   - CIFS / SMB  — uses smbclient CLI to PUT the file directly without mounting
 *   - SFTP        — uses ssh2 to PUT the file via SFTP (password or private key)
 *
 * Archival relies on the system `tar` command (available on all supported
 * platforms: Linux, macOS, and Windows 10+).
 */

import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, createWriteStream } from "fs";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { pipeline } from "stream/promises";
import { readJsonConfig, writeJsonConfig } from "./config";
import { encryptField, decryptField, getSecretKeyBase64 } from "./crypto";
import type { BackupConfig, BackupEntry, BackupResult, BackupTarget, BackupSftpTarget } from "./types";

const execFileAsync = promisify(execFile);

const BACKUP_CONFIG_FILE = "backup.json";
const BACKUP_STATE_FILE  = "backup-state.json";
const BACKUPS_DIR        = path.join(process.cwd(), "backups");

// Directories to include in the archive
const BACKUP_SOURCES = ["config", "docs", "logs", "archive", "history"];

// ── Config ─────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  schedule: "manual",
  scheduleTime: "02:00",
  scheduleDayOfWeek: 1,
  retentionCount: 14,
  targets: [],
};

export async function getBackupConfig(): Promise<BackupConfig> {
  const stored = await readJsonConfig<Partial<BackupConfig>>(BACKUP_CONFIG_FILE, {});
  const merged: BackupConfig = { ...DEFAULT_CONFIG, ...stored, targets: stored.targets ?? [] };

  // Decrypt CIFS + SFTP credentials
  const decryptedTargets = await Promise.all(
    merged.targets.map(async (t) => {
      if (t.type === "cifs" && t.password && t.password.startsWith("ENC:")) {
        try { return { ...t, password: await decryptField(t.password) }; } catch { return t; }
      }
      if (t.type === "sftp") {
        let updated = { ...t };
        if (updated.password?.startsWith("ENC:")) {
          try { updated = { ...updated, password: await decryptField(updated.password) }; } catch {}
        }
        if (updated.privateKey?.startsWith("ENC:")) {
          try { updated = { ...updated, privateKey: await decryptField(updated.privateKey) }; } catch {}
        }
        return updated;
      }
      return t;
    })
  );
  return { ...merged, targets: decryptedTargets };
}

export async function saveBackupConfig(config: BackupConfig): Promise<void> {
  // Encrypt CIFS + SFTP credentials before persisting
  const encryptedTargets = await Promise.all(
    config.targets.map(async (t) => {
      if (t.type === "cifs" && t.password && !t.password.startsWith("ENC:")) {
        try { return { ...t, password: await encryptField(t.password) }; } catch { return t; }
      }
      if (t.type === "sftp") {
        let updated = { ...t };
        if (updated.password && !updated.password.startsWith("ENC:")) {
          try { updated = { ...updated, password: await encryptField(updated.password) }; } catch {}
        }
        if (updated.privateKey && !updated.privateKey.startsWith("ENC:")) {
          try { updated = { ...updated, privateKey: await encryptField(updated.privateKey) }; } catch {}
        }
        return updated;
      }
      return t;
    })
  );
  await writeJsonConfig(BACKUP_CONFIG_FILE, { ...config, targets: encryptedTargets });
}

// ── Backup state (last-run tracking) ──────────────────────────────────────────

interface BackupState { lastRunAt?: string; }

export async function getBackupState(): Promise<BackupState> {
  return readJsonConfig<BackupState>(BACKUP_STATE_FILE, {});
}

export async function saveBackupState(state: BackupState): Promise<void> {
  await writeJsonConfig(BACKUP_STATE_FILE, state);
}

// ── List ───────────────────────────────────────────────────────────────────────

export async function listBackups(): Promise<BackupEntry[]> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const files = await fs.readdir(BACKUPS_DIR);
  const entries: BackupEntry[] = [];
  for (const file of files) {
    if (!file.match(/^docit-backup-.*\.tar\.gz(\.enc)?$/)) continue;
    const stat = await fs.stat(path.join(BACKUPS_DIR, file)).catch(() => null);
    if (!stat) continue;
    entries.push({ filename: file, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() });
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Run backup ─────────────────────────────────────────────────────────────────

export async function runBackup(config?: BackupConfig): Promise<BackupResult> {
  const cfg = config ?? await getBackupConfig();
  await fs.mkdir(BACKUPS_DIR, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19); // YYYY-MM-DDTHH-mm-ss
  const filename = `docit-backup-${ts}.tar.gz.enc`;
  const destPath = path.join(BACKUPS_DIR, filename);

  // Collect existing sources
  const cwd = process.cwd();
  const sources: string[] = [];
  for (const src of BACKUP_SOURCES) {
    try {
      await fs.access(path.join(cwd, src));
      sources.push(src);
    } catch { /* skip missing dirs */ }
  }

  if (sources.length === 0) {
    return { success: false, error: "No source directories found", targetResults: [] };
  }

  // Create archive
  const tarPath = path.join(BACKUPS_DIR, `docit-backup-${ts}.tar.gz`);
  try {
    await execFileAsync("tar", ["-czf", tarPath, ...sources], { cwd });
  } catch (err) {
    return {
      success: false,
      error: `tar failed: ${err instanceof Error ? err.message : String(err)}`,
      targetResults: [],
    };
  }

  // Encrypt the archive with AES-256-GCM (NIS2: backup encryption at rest)
  try {
    const keyB64 = await getSecretKeyBase64();
    const key = Buffer.from(keyB64, "base64");
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const readStream = createReadStream(tarPath);
    const writeStream = createWriteStream(destPath);

    // File format: 16-byte IV | encrypted data | (authTag appended after)
    writeStream.write(iv);
    await pipeline(readStream, cipher, writeStream);

    // Append the 16-byte auth tag at the end of the file
    const authTag = cipher.getAuthTag();
    await fs.appendFile(destPath, authTag);

    // Remove the unencrypted archive
    await fs.unlink(tarPath).catch(() => {});
  } catch (err) {
    // Clean up on failure
    await fs.unlink(tarPath).catch(() => {});
    await fs.unlink(destPath).catch(() => {});
    return {
      success: false,
      error: `Encryption failed: ${err instanceof Error ? err.message : String(err)}`,
      targetResults: [],
    };
  }

  // Copy to targets
  const targetResults: BackupResult["targetResults"] = [];

  for (const target of cfg.targets) {
    const label = target.label || target.type;
    try {
      if (target.type === "local") {
        await fs.mkdir(target.path, { recursive: true });
        await fs.copyFile(destPath, path.join(target.path, filename));
        targetResults.push({ label, success: true });
      } else if (target.type === "cifs") {
        await copyCifs(destPath, filename, target);
        targetResults.push({ label, success: true });
      } else if (target.type === "sftp") {
        await copySftp(destPath, filename, target);
        targetResults.push({ label, success: true });
      }
    } catch (err) {
      targetResults.push({ label, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Retention cleanup
  if (cfg.retentionCount > 0) {
    try {
      const all = await listBackups();
      const toDelete = all.slice(cfg.retentionCount);
      for (const entry of toDelete) {
        await fs.unlink(path.join(BACKUPS_DIR, entry.filename)).catch(() => {});
      }
    } catch { /* best-effort */ }
  }

  // Update last-run state
  await saveBackupState({ lastRunAt: now.toISOString() });

  return { success: true, filename, targetResults };
}

// ── SFTP copy via ssh2 ────────────────────────────────────────────────────────

async function copySftp(
  localPath: string,
  remoteFilename: string,
  target: BackupSftpTarget
): Promise<void> {
  const { Client } = await import("ssh2");
  return new Promise<void>((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        const remotePath = (target.remotePath ?? "").replace(/\/$/, "") + "/" + remoteFilename;
        sftp.fastPut(localPath, remotePath, (err2) => {
          conn.end();
          if (err2) reject(err2); else resolve();
        });
      });
    });

    conn.on("error", reject);

    const connectCfg: Parameters<typeof conn.connect>[0] = {
      host: target.host,
      port: target.port ?? 22,
      username: target.username,
    };
    if (target.privateKey) {
      connectCfg.privateKey = target.privateKey;
    } else if (target.password) {
      connectCfg.password = target.password;
    }
    conn.connect(connectCfg);
  });
}

// ── CIFS copy via smbclient ────────────────────────────────────────────────────

async function copyCifs(
  localPath: string,
  remoteFilename: string,
  target: Extract<BackupTarget, { type: "cifs" }>
): Promise<void> {
  const remoteDest = (target.remotePath ?? "").replace(/\/$/, "") + "/" + remoteFilename;
  const shareUNC   = `//${target.host}/${target.share}`;
  const password   = target.password ?? "";
  const userArg    = `${target.username}%${password}`;
  const command    = `put ${localPath} ${remoteDest}`;

  // smbclient //<host>/<share> -U user%pass -c "put <local> <remote>"
  await execFileAsync("smbclient", [shareUNC, "-U", userArg, "-c", command]);
}

// ── Restore ────────────────────────────────────────────────────────────────────

export async function restoreBackup(filename: string): Promise<{ success: boolean; error?: string }> {
  // Sanitise filename
  if (!filename.match(/^docit-backup-[A-Za-z0-9\-]+\.tar\.gz(\.enc)?$/)) {
    return { success: false, error: "Invalid backup filename" };
  }

  const filePath = path.join(BACKUPS_DIR, filename);
  try {
    await fs.access(filePath);
  } catch {
    return { success: false, error: "Backup file not found" };
  }

  const cwd = process.cwd();
  const isEncrypted = filename.endsWith(".enc");

  if (!isEncrypted) {
    // Legacy unencrypted backup — extract directly
    try {
      await execFileAsync("tar", ["-xzf", filePath], { cwd });
      return { success: true };
    } catch (err) {
      return { success: false, error: `tar extract failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Decrypt .tar.gz.enc → temp .tar.gz, then extract
  const tempTar = path.join(BACKUPS_DIR, `restore-temp-${Date.now()}.tar.gz`);
  try {
    const keyB64 = await getSecretKeyBase64();
    const key = Buffer.from(keyB64, "base64");
    const raw = await fs.readFile(filePath);

    // File format: [16-byte IV] [ciphertext] [16-byte authTag]
    const iv = raw.subarray(0, 16);
    const authTag = raw.subarray(raw.length - 16);
    const encrypted = raw.subarray(16, raw.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    await fs.writeFile(tempTar, decrypted);
  } catch (err) {
    await fs.unlink(tempTar).catch(() => {});
    return { success: false, error: `Decryption failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Extract
  try {
    await execFileAsync("tar", ["-xzf", tempTar], { cwd });
  } catch (err) {
    return { success: false, error: `tar extract failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await fs.unlink(tempTar).catch(() => {});
  }

  return { success: true };
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteBackup(filename: string): Promise<boolean> {
  // Sanitise: only allow backup filenames, no path traversal
  if (!filename.match(/^docit-backup-[A-Za-z0-9\-]+\.tar\.gz(\.enc)?$/)) return false;
  try {
    await fs.unlink(path.join(BACKUPS_DIR, filename));
    return true;
  } catch {
    return false;
  }
}
