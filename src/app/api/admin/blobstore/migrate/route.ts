import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { migrateAttachmentsAggressive, type MigrationStats } from "@/lib/blobstore";
import crypto from "crypto";

// In-memory job registry — fine for an admin one-shot operation
interface MigrationJob {
  id: string;
  status: "running" | "done" | "error";
  stats: MigrationStats | null;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const jobs = new Map<string, MigrationJob>();

// ── POST: start an async migration job ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin)
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  // Prevent concurrent migrations
  for (const job of jobs.values()) {
    if (job.status === "running")
      return NextResponse.json({ error: "A migration is already running", jobId: job.id }, { status: 409 });
  }

  const jobId = crypto.randomUUID();
  const job: MigrationJob = {
    id: jobId,
    status: "running",
    stats: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  // Fire-and-forget — runs in background
  void (async () => {
    try {
      const stats = await migrateAttachmentsAggressive((msg) => {
        // Append progress to messages list so GET can stream them
        if (job.stats) job.stats.messages.push(msg);
      });
      job.stats = stats;
      job.status = "done";
      job.completedAt = new Date().toISOString();
    } catch (err) {
      job.status = "error";
      job.error = String(err);
      job.completedAt = new Date().toISOString();
    }
  })();

  return NextResponse.json({ jobId, status: "running" });
}

// ── GET: poll migration job status ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin)
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    // Return summary of all jobs
    const list = [...jobs.values()].map(({ id, status, startedAt, completedAt, stats }) => ({
      id, status, startedAt, completedAt,
      processed: stats?.processed ?? 0,
      duplicates: stats?.duplicates ?? 0,
      bytesSaved: stats?.bytesSaved ?? 0,
      errors: stats?.errors ?? 0,
    }));
    return NextResponse.json({ jobs: list });
  }

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt ?? null,
    error: job.error ?? null,
    stats: job.stats,
  });
}
