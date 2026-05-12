<#
.SYNOPSIS
    Uninstalls the Doc-it Provisioning Agent.

.DESCRIPTION
    Removes the Windows Service (NSSM) and/or Scheduled Task, firewall rule,
    and HTTP URL reservation. Does NOT delete the agent files or logs.

.NOTES
    Must be run as Administrator. Works with both PowerShell 5.1 and 7+.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ServiceName = "DocitProvisioningAgent"
$AgentDir    = $PSScriptRoot
$NssmExe     = Join-Path $AgentDir "nssm.exe"
$ConfigFile  = Join-Path $AgentDir "config.json"

Write-Host ""
Write-Host "Uninstalling Doc-it Provisioning Agent..." -ForegroundColor Yellow
Write-Host ""

# Read port from config
$port = 8520
if (Test-Path $ConfigFile) {
    $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if ($cfg.port) { $port = $cfg.port }
}

# Remove Windows Service (try NSSM first, then sc.exe)
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Stopping service '$ServiceName'..."
    if (Test-Path $NssmExe) {
        & $NssmExe stop $ServiceName 2>$null | Out-Null
        Start-Sleep -Seconds 2
        Write-Host "Removing service (NSSM)..."
        & $NssmExe remove $ServiceName confirm 2>$null | Out-Null
    } else {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "Removing service..."
        sc.exe delete $ServiceName | Out-Null
    }
    Write-Host "Service removed." -ForegroundColor Green
} else {
    Write-Host "Service '$ServiceName' not found." -ForegroundColor Gray
}

# Remove Scheduled Task
$task = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Stopping task '$ServiceName'..."
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Removing task..."
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "Task removed." -ForegroundColor Green
}

# Clean up compiled service wrapper from old installs
$oldExe = Join-Path $AgentDir "docit-service.exe"
if (Test-Path $oldExe) { Remove-Item $oldExe -Force -ErrorAction SilentlyContinue }

# Remove URL reservation
$urlPrefix = "http://+:${port}/"
Write-Host "Removing URL reservation: $urlPrefix"
netsh http delete urlacl url=$urlPrefix 2>$null | Out-Null

# Remove firewall rule
$fwRuleName = "DocitProvisioningAgent-TCP-$port"
$fwRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
if ($fwRule) {
    Remove-NetFirewallRule -DisplayName $fwRuleName
    Write-Host "Firewall rule removed." -ForegroundColor Green
} else {
    Write-Host "Firewall rule not found (already removed)." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Uninstall complete." -ForegroundColor Green
Write-Host "Agent files and logs were NOT deleted. Remove them manually if needed:" -ForegroundColor Gray
Write-Host "  $AgentDir" -ForegroundColor Gray
Write-Host ""
