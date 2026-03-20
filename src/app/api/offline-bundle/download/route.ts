import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { readJobState, bundleFilePath, deleteJob } from "@/lib/bundle-jobs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const state = await readJobState(user.username, jobId);
  if (!state || state.username !== user.username) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (state.status !== "done") {
    return NextResponse.json({ error: "Bundle not ready yet" }, { status: 409 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(bundleFilePath(user.username, jobId));
  } catch {
    return NextResponse.json({ error: "Bundle file missing" }, { status: 404 });
  }

  auditLog(request, {
    event: "offline.bundle.download",
    outcome: "success",
    actor: user.username,
    details: { filename: state.filename ?? jobId },
  });

  // Delete the cached files after the response is built
  void deleteJob(user.username, jobId);

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${state.filename ?? "doc-it-offline.zip"}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    },
  });
}
