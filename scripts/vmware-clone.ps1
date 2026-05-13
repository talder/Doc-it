#!/usr/bin/env pwsh
# ──────────────────────────────────────────────────────────────────────────────
# vmware-clone.ps1 — Clone a VM from template using VMware PowerCLI
#
# Called by doc-it Node.js backend. Reads JSON config from stdin,
# outputs a single JSON result line to stdout.
#
# Required: PowerShell 7+, VMware.PowerCLI module
# ──────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$WarningPreference     = 'SilentlyContinue'
$ProgressPreference    = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Result([hashtable]$r) {
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Depth 5 -Compress))
}

try {
    # ── Read parameters from stdin ───────────────────────────────────────────
    $raw = [System.Console]::In.ReadToEnd()
    $p   = $raw | ConvertFrom-Json

    # ── Suppress CEIP & SSL warnings ────────────────────────────────────────
    $null = Set-PowerCLIConfiguration -Scope User -ParticipateInCEIP $false -Confirm:$false 2>$null
    if ($p.ignoreSslErrors) {
        $null = Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Scope Session -Confirm:$false 2>$null
    }

    # ── Connect to vCenter ──────────────────────────────────────────────────
    $server = ([uri]$p.vcenterUrl).Host
    if (-not $server) { $server = $p.vcenterUrl -replace 'https?://' -replace '/.*' }
    $viConn = Connect-VIServer -Server $server -User $p.username -Password $p.password -ErrorAction Stop

    try {
        # ── Resolve template by MoRef (e.g. "vm-123") ──────────────────────
        $templateVM = Get-Template -Server $viConn | Where-Object {
            $_.ExtensionData.MoRef.Value -eq $p.templateId
        } | Select-Object -First 1
        if (-not $templateVM) {
            throw "Template with MoRef '$($p.templateId)' not found in vCenter"
        }

        # ── Prepare customization spec (temp copy with IP override) ─────────
        $custSpec = $null
        if ($p.customizationSpec) {
            $origSpec = Get-OSCustomizationSpec -Name $p.customizationSpec -Server $viConn -ErrorAction Stop
            $tempName = "docit-$($p.vmName)-$(Get-Date -Format 'yyyyMMddHHmmss')"
            $custSpec = New-OSCustomizationSpec -OSCustomizationSpec $origSpec `
                -Name $tempName -Type NonPersistent -Server $viConn

            if ($p.ip) {
                $nicMapping = Get-OSCustomizationNicMapping -OSCustomizationSpec $custSpec -Server $viConn
                $nicParams = @{
                    OSCustomizationNicMapping = $nicMapping
                    IpMode         = 'UseStaticIP'
                    IpAddress      = $p.ip
                    SubnetMask     = $p.subnetMask
                    DefaultGateway = $p.gateway
                }
                $dnsServers = @($p.dns | Where-Object { $_ })
                if ($dnsServers.Count -gt 0) { $nicParams.Dns = $dnsServers }
                $null = Set-OSCustomizationNicMapping @nicParams
            }
        }

        # ── Build New-VM parameters ─────────────────────────────────────────
        $vmParams = @{
            Template = $templateVM
            Name     = $p.vmName
            Server   = $viConn
            Confirm  = $false
        }
        if ($custSpec) { $vmParams.OSCustomizationSpec = $custSpec }

        # Resolve datastore by MoRef
        if ($p.datastoreId) {
            $ds = Get-Datastore -Server $viConn | Where-Object {
                $_.ExtensionData.MoRef.Value -eq $p.datastoreId
            } | Select-Object -First 1
            if ($ds) { $vmParams.Datastore = $ds }
        }

        # Resolve resource pool by MoRef, or fall back to cluster
        if ($p.resourcePoolId) {
            $rp = Get-ResourcePool -Server $viConn | Where-Object {
                $_.ExtensionData.MoRef.Value -eq $p.resourcePoolId
            } | Select-Object -First 1
            if ($rp) { $vmParams.ResourcePool = $rp }
        } elseif ($p.clusterId) {
            $cluster = Get-Cluster -Server $viConn | Where-Object {
                $_.ExtensionData.MoRef.Value -eq $p.clusterId
            } | Select-Object -First 1
            if ($cluster) {
                # Use the cluster's root resource pool
                $vmParams.ResourcePool = Get-ResourcePool -Location $cluster -Server $viConn |
                    Select-Object -First 1
            }
        }

        # Resolve folder by MoRef
        if ($p.folderId) {
            $folder = Get-Folder -Server $viConn -Type VM | Where-Object {
                $_.ExtensionData.MoRef.Value -eq $p.folderId
            } | Select-Object -First 1
            if ($folder) { $vmParams.Location = $folder }
        }

        # ── Clone VM (synchronous — waits for task) ─────────────────────────
        $newVM = New-VM @vmParams

        # ── CPU / Memory overrides ──────────────────────────────────────────
        $needsReconfig = ($p.cpuCount -and [int]$p.cpuCount -gt 0) -or
                         ($p.memoryMiB -and [int]$p.memoryMiB -gt 0)
        if ($needsReconfig) {
            # VM should be powered off after clone; ensure it
            if ($newVM.PowerState -ne 'PoweredOff') {
                $null = Stop-VM -VM $newVM -Confirm:$false
                Start-Sleep -Seconds 3
            }
            $setParams = @{ VM = $newVM; Confirm = $false }
            if ($p.cpuCount   -and [int]$p.cpuCount   -gt 0) { $setParams.NumCpu   = [int]$p.cpuCount }
            if ($p.memoryMiB  -and [int]$p.memoryMiB  -gt 0) { $setParams.MemoryMB = [int]$p.memoryMiB }
            $null = Set-VM @setParams
        }

        # ── Power on ────────────────────────────────────────────────────────
        $vm = Get-VM -Id $newVM.Id -Server $viConn
        if ($vm.PowerState -ne 'PoweredOn') {
            $null = Start-VM -VM $vm -Server $viConn -Confirm:$false
        }

        # ── Cleanup temp customization spec ─────────────────────────────────
        if ($custSpec) {
            $null = Remove-OSCustomizationSpec -OSCustomizationSpec $custSpec -Confirm:$false -ErrorAction SilentlyContinue
        }

        # ── Output result ───────────────────────────────────────────────────
        $finalVM = Get-VM -Id $newVM.Id -Server $viConn
        Write-Result @{
            success    = $true
            vmName     = $finalVM.Name
            vmMoRef    = $finalVM.ExtensionData.MoRef.Value
            powerState = $finalVM.PowerState.ToString()
        }

    } finally {
        Disconnect-VIServer -Server $viConn -Confirm:$false -ErrorAction SilentlyContinue
    }

} catch {
    Write-Result @{
        success = $false
        error   = $_.Exception.Message
    }
}
