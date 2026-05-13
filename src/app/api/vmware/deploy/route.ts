import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isVmwareAllowed, readVmwareConfig,
  getVmDeployTemplate, cloneVmFromTemplate, pollTaskUntilDone, deleteVm,
  logDeployHistory, updateDeployHistoryStatus, getDeployHistory,
} from "@/lib/vmware";
import { writeInfraAudit } from "@/lib/provisioning";
import { sendRawSyslog } from "@/lib/audit";

/** GET /api/vmware/deploy — deployment history */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ entries: getDeployHistory() });
}

/** POST /api/vmware/deploy — start a VM deployment */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted)
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });

  const body = await request.json();
  const { deployTemplateId, vmName, ip, subnetMask, gateway, dns } = body;

  if (!deployTemplateId || !vmName || !ip || !subnetMask || !gateway)
    return NextResponse.json({ error: "deployTemplateId, vmName, ip, subnetMask, and gateway are required" }, { status: 400 });

  const template = getVmDeployTemplate(deployTemplateId);
  if (!template)
    return NextResponse.json({ error: "Deploy template not found" }, { status: 404 });

  // Log history as pending
  const historyId = logDeployHistory(
    user.username, vmName, template.name, ip, "running", "", { templateId: template.id },
  );

  try {
    // Start clone task
    const { taskMoRef } = await cloneVmFromTemplate(config, {
      templateId: template.vcenterTemplateId,
      vmName,
      customizationSpecName: template.customizationSpec,
      ip,
      subnetMask,
      gateway,
      dns: dns ?? [],
      datastoreId: body.datastoreId || template.defaultDatastoreId || undefined,
      clusterId: body.clusterId || template.defaultClusterId || undefined,
      resourcePoolId: body.resourcePoolId || template.defaultResourcePoolId || undefined,
      folderId: body.folderId || template.defaultFolderId || undefined,
      networkId: body.networkId || template.defaultNetworkId || undefined,
      cpuCount: body.cpuCount ?? template.defaultCpuCount,
      memoryMiB: body.memoryMiB ?? template.defaultMemoryMiB,
    });

    // Poll task to completion (blocks up to 10 min)
    const result = await pollTaskUntilDone(config, taskMoRef);

    if (result.state === "success") {
      updateDeployHistoryStatus(historyId, "success", { taskMoRef, vmMoRef: result.result });
      writeInfraAudit({
        user: user.username, tab: "vmware-deploy", action: "deploy-vm",
        target: vmName, status: "success",
        details: { template: template.name, ip, taskMoRef, vmMoRef: result.result },
        auditEvent: "provisioning.vm.deployed",
      });
      sendRawSyslog(JSON.stringify({
        event: "vmware.deploy", vmName, ip, template: template.name,
        user: user.username, status: "success",
      }), "vmware.deploy").catch(() => {});

      return NextResponse.json({ success: true, historyId, taskMoRef, vmMoRef: result.result });
    } else {
      // Deployment failed — rollback (delete partially-created VM if exists)
      if (result.result) {
        try { await deleteVm(config, result.result); } catch { /* best-effort */ }
      }
      updateDeployHistoryStatus(historyId, "failed", { taskMoRef, error: result.error });
      writeInfraAudit({
        user: user.username, tab: "vmware-deploy", action: "deploy-vm",
        target: vmName, status: "failure",
        details: { template: template.name, ip, error: result.error },
        auditEvent: "provisioning.vm.deployed",
      });

      return NextResponse.json({ success: false, historyId, error: result.error }, { status: 500 });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    updateDeployHistoryStatus(historyId, "failed", { error: errMsg });
    writeInfraAudit({
      user: user.username, tab: "vmware-deploy", action: "deploy-vm",
      target: vmName, status: "failure",
      details: { template: template.name, ip, error: errMsg },
      auditEvent: "provisioning.vm.deployed",
    });
    return NextResponse.json({ success: false, historyId, error: errMsg }, { status: 500 });
  }
}
