/**
 * Offline bundle background job management.
 *
 * Job metadata files  : config/bundle-cache/{username}-{jobId}.json
 * Bundle ZIP files    : config/bundle-cache/{username}-{jobId}.zip
 * TTL                 : 24 hours — cleaned up on the next successful job run
 */

import fs from "fs/promises";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "config", "bundle-cache");
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export type BundleJobStatus = "running" | "done" | "error";

export interface BundleJobState {
  jobId: string;
  username: string;
  status: BundleJobStatus;
  filename?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function metaFilePath(username: string, jobId: string): string {
  return path.join(CACHE_DIR, `${username}-${jobId}.json`);
}

export function bundleFilePath(username: string, jobId: string): string {
  return path.join(CACHE_DIR, `${username}-${jobId}.zip`);
}

export function newJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function writeJobState(state: BundleJobState): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(metaFilePath(state.username, state.jobId), JSON.stringify(state, null, 2), "utf-8");
}

export async function readJobState(username: string, jobId: string): Promise<BundleJobState | null> {
  try {
    const data = await fs.readFile(metaFilePath(username, jobId), "utf-8");
    return JSON.parse(data) as BundleJobState;
  } catch {
    return null;
  }
}

export async function deleteJob(username: string, jobId: string): Promise<void> {
  try { await fs.unlink(metaFilePath(username, jobId)); } catch { /* already gone */ }
  try { await fs.unlink(bundleFilePath(username, jobId)); } catch { /* already gone */ }
}

/** Remove jobs older than 24 h. Fire-and-forget — never throws. */
export async function cleanupOldJobs(): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const state = JSON.parse(
          await fs.readFile(path.join(CACHE_DIR, file), "utf-8"),
        ) as BundleJobState;
        if (now - new Date(state.createdAt).getTime() > JOB_TTL_MS) {
          await deleteJob(state.username, state.jobId);
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* directory may not exist yet */ }
}
