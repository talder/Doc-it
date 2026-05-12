<#
.SYNOPSIS
    Uninstalls the Doc-it Provisioning Agent.

.DESCRIPTION
    Removes the Scheduled Task (and any legacy Windows Service), firewall rule,
    and HTTP URL reservation. Does NOT delete the agent files or logs.

.NOTES
    Must be run as Administrator. Works with both PowerShell 5.1 and 7+.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$TaskName   = "DocitProvisioningAgent"
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

# Stop and remove Scheduled Task
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Stopping task '$TaskName'..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Removing task..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task removed." -ForegroundColor Green
} else {
    Write-Host "Task '$TaskName' not found." -ForegroundColor Gray
}

# Also remove legacy Windows Service if it exists
$svc = Get-Service -Name $TaskName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Removing legacy Windows Service '$TaskName'..."
    Stop-Service -Name $TaskName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $TaskName | Out-Null
    Write-Host "Legacy service removed." -ForegroundColor Green
}

# Clean up compiled service wrapper from previous installs
$oldExe = Join-Path $PSScriptRoot "docit-service.exe"
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
Write-Host "  $PSScriptRoot" -ForegroundColor Gray
Write-Host ""
