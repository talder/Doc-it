<#
.SYNOPSIS
    Installs the Doc-it Provisioning Agent as a Windows Scheduled Task.

.DESCRIPTION
    Creates a scheduled task "DocitProvisioningAgent" that:
      - Starts automatically at system boot
      - Runs as SYSTEM (has access to DNS/DHCP cmdlets)
      - Restarts on failure (every 60 seconds, up to 3 times)
      - Registers the HTTP URL reservation so no manual netsh is needed

.NOTES
    Must be run as Administrator.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$TaskName   = "DocitProvisioningAgent"
$AgentDir   = $PSScriptRoot
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
    Write-Host '  [System.Convert]::ToBase64String([byte[]]::new(32) | % { [System.Security.Cryptography.RandomNumberGenerator]::Fill($_); $_ })' -ForegroundColor Gray
    Write-Host "Or simply make up a long random string (32+ characters)." -ForegroundColor Yellow
    exit 1
}

# ── Remove existing task if present ───────────────────────────────────────────

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task '$TaskName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 1
}

# ── Register HTTP URL reservation ─────────────────────────────────────────────

$urlPrefix = "http://+:${port}/"
Write-Host "Registering URL reservation: $urlPrefix"
netsh http delete urlacl url=$urlPrefix 2>$null | Out-Null
netsh http add urlacl url=$urlPrefix user="NT AUTHORITY\SYSTEM" | Out-Null

# ── Open firewall port ────────────────────────────────────────────────────────

$fwRuleName = "DocitProvisioningAgent-TCP-$port"
$existingRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    Write-Host "Creating firewall rule: Allow TCP $port inbound"
    New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Domain,Private | Out-Null
} else {
    Write-Host "Firewall rule already exists: $fwRuleName"
}

# ── Create scheduled task ─────────────────────────────────────────────────────

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentScript`"" `
    -WorkingDirectory $AgentDir

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 9999)

$principal = New-ScheduledTaskPrincipal `
    -UserId "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Doc-it Provisioning Agent - REST API for DNS/DHCP management" | Out-Null

Write-Host ""
Write-Host "Task '$TaskName' registered successfully." -ForegroundColor Green

# ── Start the task now ────────────────────────────────────────────────────────

Write-Host "Starting agent..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

# ── Verify ────────────────────────────────────────────────────────────────────

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
    Write-Host "WARNING: Agent started but health check failed. Check logs in: $(Join-Path $AgentDir 'logs')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. In Doc-it Admin > Provisioning, set the endpoint URL to:" -ForegroundColor White
Write-Host "     http://$($env:COMPUTERNAME):${port}" -ForegroundColor Yellow
Write-Host "  2. Enter the token from config.json" -ForegroundColor White
Write-Host "  3. Click 'Test Connection' to verify" -ForegroundColor White
Write-Host ""
