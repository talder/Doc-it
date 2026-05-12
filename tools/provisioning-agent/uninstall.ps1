<#
.SYNOPSIS
    Uninstalls the Doc-it Provisioning Agent.

.DESCRIPTION
    Removes the scheduled task, firewall rule, and HTTP URL reservation.
    Does NOT delete the agent files or logs.

.NOTES
    Must be run as Administrator.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$TaskName  = "DocitProvisioningAgent"
$ConfigFile = Join-Path $PSScriptRoot "config.json"

Write-Host ""
Write-Host "Uninstalling Doc-it Provisioning Agent..." -ForegroundColor Yellow
Write-Host ""

# Read port from config
$port = 8520
if (Test-Path $ConfigFile) {
    $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if ($cfg.port) { $port = $cfg.port }
}

# Stop and remove task
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping task '$TaskName'..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Removing task..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task removed." -ForegroundColor Green
} else {
    Write-Host "Task '$TaskName' not found (already removed)." -ForegroundColor Gray
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
