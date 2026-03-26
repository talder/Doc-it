/**
 * Snapshot subsystem.
 *
 * Creates lightweight, unencrypted snapshots of the application data
 * directories for fast rollback (e.g. before upgrades).  Unlike the
 * backup system (encrypted archives for off-site storage), snapshots
 * are local-only and optimised for speed.
 *
 * On Linux, `cp -al` is used to create hard-link copies (fast,
 * space-efficient on the same filesystem).  On macOS and Windows the
 * fallback is a regular recursive copy.
 */

import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { SnapshotEntry } from "./types";

const execFileAsync = promisify(execFile);

const SNAPSHOTS_DIR = path.join(process.cwd(), "snapshots");

/** Directories included in every snapshot */
const SNAPSHOT_SOURCES = ["config", "docs", "logs", "archive", "history"];

// ── Create ──────────────────────────────────────────────────────────────────────

export async function createSnapshot(label?: string): Promise<SnapshotEntry> {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeName = (label || "manual").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const id = `${ts}_${safeName}`;
  const dest = path.join(SNAPSHOTS_DIR, id);

  await fs.mkdir(dest, { recursive: true });

  const cwd = process.cwd();
  for (const src of SNAPSHOT_SOURCES) {
    const srcPath = path.join(cwd, src);
    try {
      await fs.access(srcPath);
    } catch {
      continue; // skip missing dirs
    }
    const dstPath = path.join(dest, src);
    await copyDir(srcPath, dstPath);
  }

  const size = await dirSize(dest);

  return {
    id,
    label: label || "manual",
    createdAt: now.toISOString(),
    sizeBytes: size,
  };
}

// ── List ────────────────────────────────────────────────────────────────────────

export async function listSnapshots(): Promise<SnapshotEntry[]> {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  const entries = await fs.readdir(SNAPSHOTS_DIR, { withFileTypes: true });
  const snapshots: SnapshotEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stat = await fs.stat(path.join(SNAPSHOTS_DIR, entry.name)).catch(() => null);
    if (!stat) continue;

    // Extract label from id: "2026-03-26T08-50-00_pre-upgrade" → "pre-upgrade"
    const underscoreIdx = entry.name.indexOf("_");
    const label = underscoreIdx >= 0 ? entry.name.slice(underscoreIdx + 1) : entry.name;

    snapshots.push({
      id: entry.name,
      label,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: 0, // size is expensive to compute on list; computed on demand
    });
  }

  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Restore ─────────────────────────────────────────────────────────────────────

export async function restoreSnapshot(
  id: string
): Promise<{ success: boolean; error?: string }> {
  // Sanitise
  if (!/^[\w-]+$/.test(id)) {
    return { success: false, error: "Invalid snapshot ID" };
  }

  const snapDir = path.join(SNAPSHOTS_DIR, id);
  try {
    await fs.access(snapDir);
  } catch {
    return { success: false, error: "Snapshot not found" };
  }

  // Safety net: auto-create a "pre-restore" snapshot first
  try {
    await createSnapshot("pre-restore");
  } catch {
    // best-effort — don't block restore if this fails
  }

  const cwd = process.cwd();
  for (const src of SNAPSHOT_SOURCES) {
    const snapSrc = path.join(snapDir, src);
    const liveDst = path.join(cwd, src);

    try {
      await fs.access(snapSrc);
    } catch {
      continue; // this dir wasn't in the snapshot
    }

    // Remove current live dir and replace with snapshot copy
    await fs.rm(liveDst, { recursive: true, force: true });
    await copyDir(snapSrc, liveDst);
  }

  return { success: true };
}

// ── Delete ──────────────────────────────────────────────────────────────────────

export async function deleteSnapshot(id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false;
  const snapDir = path.join(SNAPSHOTS_DIR, id);
  try {
    await fs.rm(snapDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Prune ───────────────────────────────────────────────────────────────────────

export async function pruneSnapshots(keepCount = 5): Promise<number> {
  const all = await listSnapshots();
  const toDelete = all.slice(keepCount);
  let deleted = 0;
  for (const snap of toDelete) {
    if (await deleteSnapshot(snap.id)) deleted++;
  }
  return deleted;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Copy a directory tree.  Uses `cp -al` on Linux for hard-link copies
 * (near-instant, no extra disk usage until files diverge).  Falls back
 * to a regular recursive copy on macOS / Windows.
 */
async function copyDir(src: string, dst: string): Promise<void> {
  if (process.platform === "linux") {
    try {
      await execFileAsync("cp", ["-al", src, dst]);
      return;
    } catch {
      // fall through to generic copy
    }
  }

  // Generic recursive copy (macOS, Windows, or Linux fallback)
  await fs.cp(src, dst, { recursive: true });
}

/** Recursively compute directory size in bytes. */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) total += stat.size;
      }
    }
  } catch { /* ignore */ }
  return total;
}
