<#
.SYNOPSIS
    Installs the Doc-it Provisioning Agent as a Scheduled Task.

.DESCRIPTION
    Creates a Scheduled Task "DocitProvisioningAgent" that:
      - Starts automatically at system boot
      - Runs as SYSTEM (has access to DNS/DHCP cmdlets)
      - Runs whether or not a user is logged on
      - Restarts automatically if the process exits
      - Registers the HTTP URL reservation so no manual netsh is needed

.NOTES
    Must be run as Administrator. Works with both PowerShell 5.1 and 7+.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$TaskName    = "DocitProvisioningAgent"
$AgentDir    = $PSScriptRoot
$AgentScript = Join-Path $AgentDir "docit-agent.ps1"
$ConfigFile  = Join-Path $AgentDir "config.json"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Doc-it Provisioning Agent Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Preflight checks ─────────────────────────────────────────────────────────

if (-not (Test-Path $AgentScript)) {
    Write-Host "ERROR: docit-agent.ps1 not found in $AgentDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ConfigFile)) {
    Write-Host "ERROR: config.json not found in $AgentDir" -ForegroundColor Red
    Write-Host "Copy config.json.example to config.json and edit it first." -ForegroundColor Yellow
    exit 1
}

# Read config to get port
$cfg  = Get-Content $ConfigFile -Raw | ConvertFrom-Json
$port = if ($cfg.port) { $cfg.port } else { 8520 }

if ($cfg.token -eq "CHANGE-ME-generate-a-strong-random-token") {
    Write-Host "ERROR: You must change the 'token' in config.json before installing." -ForegroundColor Red
    Write-Host ""
    Write-Host "Generate a token with this PowerShell command:" -ForegroundColor Yellow
    Write-Host '  $b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)' -ForegroundColor Gray
    Write-Host "Or simply make up a long random string (32+ characters)." -ForegroundColor Yellow
    exit 1
}

# ── Remove existing task or legacy service ───────────────────────────────────────

# Remove legacy Windows Service if it exists (upgrade path)
$existingSvc = Get-Service -Name $TaskName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Host "Removing legacy Windows Service '$TaskName'..." -ForegroundColor Yellow
    Stop-Service -Name $TaskName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $TaskName | Out-Null
    Start-Sleep -Seconds 1
}

# Remove existing scheduled task if present
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task '$TaskName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 1
}

# Clean up compiled service wrapper from previous installs
$oldExe = Join-Path $AgentDir "docit-service.exe"
if (Test-Path $oldExe) { Remove-Item $oldExe -Force -ErrorAction SilentlyContinue }

# ── Register HTTP URL reservation ───────────────────────────────────────────────

$urlPrefix = "http://+:${port}/"
Write-Host "Registering URL reservation: $urlPrefix"
netsh http delete urlacl url=$urlPrefix 2>$null | Out-Null
netsh http add urlacl url=$urlPrefix user="NT AUTHORITY\SYSTEM" | Out-Null

# ── Open firewall port ──────────────────────────────────────────────────────

$fwRuleName = "DocitProvisioningAgent-TCP-$port"
$existingRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    Write-Host "Creating firewall rule: Allow TCP $port inbound"
    New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Domain,Private | Out-Null
} else {
    Write-Host "Firewall rule already exists: $fwRuleName"
}

# ── Create Scheduled Task ─────────────────────────────────────────────────────

Write-Host "Creating scheduled task: $TaskName"

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentScript`"" `
    -WorkingDirectory $AgentDir

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal `
    -UserId "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 999 `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Doc-it Provisioning Agent - REST API for DNS/DHCP management" `
    -Force | Out-Null

Write-Host "Task '$TaskName' created successfully." -ForegroundColor Green

# ── Start the task ──────────────────────────────────────────────────────────

Write-Host "Starting task..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

# ── Verify ────────────────────────────────────────────────────────────────

try {
    $health = Invoke-RestMethod -Uri "http://localhost:${port}/api/health" -TimeoutSec 5
    Write-Host ""
    Write-Host "Agent is running!" -ForegroundColor Green
    Write-Host "  Host:    $($health.host)" -ForegroundColor Gray
    Write-Host "  Mode:    $($health.mode)" -ForegroundColor Gray
    Write-Host "  DNS:     $($health.dns)" -ForegroundColor Gray
    Write-Host "  DHCP:    $($health.dhcp)" -ForegroundColor Gray
    Write-Host "  Version: $($health.version)" -ForegroundColor Gray
} catch {
    Write-Host "WARNING: Task started but health check failed. Check logs in: $(Join-Path $AgentDir 'logs')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "Manage with:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName $TaskName     # Check status" -ForegroundColor Gray
Write-Host "  Start-ScheduledTask -TaskName $TaskName    # Start" -ForegroundColor Gray
Write-Host "  Stop-ScheduledTask -TaskName $TaskName     # Stop" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. In Doc-it Admin > Provisioning, set the endpoint URL to:" -ForegroundColor White
Write-Host "     http://$($env:COMPUTERNAME):${port}" -ForegroundColor Yellow
Write-Host "  2. Enter the token from config.json" -ForegroundColor White
Write-Host "  3. Click 'Test Connection' to verify" -ForegroundColor White
Write-Host ""
