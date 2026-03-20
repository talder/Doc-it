import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { generateOfflineBundle } from "@/lib/offline-bundle";
import { auditLog } from "@/lib/audit";
import {
  newJobId,
  writeJobState,
  readJobState,
  bundleFilePath,
  cleanupOldJobs,
} from "@/lib/bundle-jobs";
import { readNotifications, writeNotifications } from "@/lib/notifications";
import type { AppNotification } from "@/lib/notifications";
import type { User } from "@/lib/types";

// ── Background worker ─────────────────────────────────────────────────────────

async function runBundleJob(user: User, passphrase: string, jobId: string): Promise<void> {
  try {
    const { buffer, filename } = await generateOfflineBundle(user, passphrase);

    // Persist the ZIP to disk
    await fs.writeFile(bundleFilePath(user.username, jobId), buffer);

    // Mark job done
    await writeJobState({
      jobId,
      username: user.username,
      status: "done",
      filename,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // In-app notification: bundle ready
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "bundle_ready",
      message: "Your offline bundle is ready to download.",
      from: "system",
      spaceSlug: "",
      docName: "",
      category: "",
      createdAt: new Date().toISOString(),
      read: false,
      meta: { jobId, filename },
    };
    const notifs = await readNotifications(user.username);
    notifs.unshift(notif);
    if (notifs.length > 50) notifs.length = 50;
    await writeNotifications(user.username, notifs);

    // Purge old jobs while we're here
    cleanupOldJobs().catch(() => {});
  } catch (err) {
    console.error("[offline-bundle] background job failed:", err);
    await writeJobState({
      jobId,
      username: user.username,
      status: "error",
      error: String(err),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    // Failure notification
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "bundle_ready",
      message: "Offline bundle generation failed. Please try again.",
      from: "system",
      spaceSlug: "",
      docName: "",
      category: "",
      createdAt: new Date().toISOString(),
      read: false,
      meta: { jobId, error: "1" },
    };
    const notifs = await readNotifications(user.username);
    notifs.unshift(notif);
    if (notifs.length > 50) notifs.length = 50;
    await writeNotifications(user.username, notifs);
  }
}

// ── POST /api/offline-bundle  — queue a background job ────────────────────────

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let passphrase: string;
  try {
    const body = await request.json();
    passphrase = body?.passphrase ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!passphrase || passphrase.length < 12) {
    return NextResponse.json({ error: "Passphrase must be at least 12 characters" }, { status: 400 });
  }

  const jobId = newJobId();
  await writeJobState({ jobId, username: user.username, status: "running", createdAt: new Date().toISOString() });

  auditLog(request, {
    event: "offline.bundle.requested",
    outcome: "success",
    actor: user.username,
    details: { jobId },
  });

  // Start generation in background — does not block the HTTP response
  void runBundleJob(user, passphrase, jobId);

  return NextResponse.json({ jobId });
}

// ── GET /api/offline-bundle?jobId=  — poll job status ─────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const state = await readJobState(user.username, jobId);
  if (!state) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    status: state.status,
    filename: state.filename ?? null,
    error: state.error ?? null,
    completedAt: state.completedAt ?? null,
  });
}
