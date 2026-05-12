<#
.SYNOPSIS
    Uninstalls the Doc-it Provisioning Agent.

.DESCRIPTION
    Removes the Windows Service (and any legacy scheduled task), firewall rule,
    and HTTP URL reservation. Does NOT delete the agent files or logs.

.NOTES
    Must be run as Administrator.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ServiceName = "DocitProvisioningAgent"
$ConfigFile  = Join-Path $PSScriptRoot "config.json"

Write-Host ""
Write-Host "Uninstalling Doc-it Provisioning Agent..." -ForegroundColor Yellow
Write-Host ""

# Read port from config
$port = 8520
if (Test-Path $ConfigFile) {
    $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if ($cfg.port) { $port = $cfg.port }
}

# Stop and remove Windows Service
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Stopping service '$ServiceName'..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Removing service..."
    sc.exe delete $ServiceName | Out-Null
    Write-Host "Service removed." -ForegroundColor Green
} else {
    Write-Host "Service '$ServiceName' not found." -ForegroundColor Gray
}

# Also remove legacy scheduled task if it exists
$legacyTask = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
if ($legacyTask) {
    Write-Host "Removing legacy scheduled task '$ServiceName'..."
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "Legacy task removed." -ForegroundColor Green
}

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
Write-Host "  $PSScriptRoot" -ForegroundColor Gray
Write-Host ""
