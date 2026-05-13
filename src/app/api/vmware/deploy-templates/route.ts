import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listVmDeployTemplates, createVmDeployTemplate } from "@/lib/vmware";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Any authenticated user can list deploy templates (needed by deploy wizard)
  return NextResponse.json({ templates: listVmDeployTemplates() });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  if (!body.name || !body.vcenterTemplateId)
    return NextResponse.json({ error: "name and vcenterTemplateId are required" }, { status: 400 });

  const template = createVmDeployTemplate(body);
  return NextResponse.json({ template }, { status: 201 });
}
