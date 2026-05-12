<#
.SYNOPSIS
    Installs the Doc-it Provisioning Agent as a Windows Service.

.DESCRIPTION
    Creates a Windows Service "DocitProvisioningAgent" that:
      - Starts automatically at system boot
      - Runs as SYSTEM (has access to DNS/DHCP cmdlets)
      - Restarts on failure (every 60 seconds)
      - Registers the HTTP URL reservation so no manual netsh is needed

.NOTES
    Must be run as Administrator.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ServiceName = "DocitProvisioningAgent"
$ServiceDisplay = "Doc-it Provisioning Agent"
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

# ── Remove existing service or legacy task ────────────────────────────────────

# Remove legacy scheduled task if it exists (upgrade path)
$legacyTask = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
if ($legacyTask) {
    Write-Host "Removing legacy scheduled task '$ServiceName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Start-Sleep -Seconds 1
}

# Remove existing service if present
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Host "Stopping existing service '$ServiceName'..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Removing existing service..."
    sc.exe delete $ServiceName | Out-Null
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

# ── Create Windows Service ────────────────────────────────────────────────────

$binPath = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentScript`""

Write-Host "Creating Windows Service: $ServiceName"
sc.exe create $ServiceName `
    binPath= $binPath `
    start= delayed-auto `
    DisplayName= $ServiceDisplay `
    obj= "LocalSystem" | Out-Null

# Set description
sc.exe description $ServiceName "Doc-it Provisioning Agent - REST API for DNS/DHCP management" | Out-Null

# Configure failure recovery: restart after 60s on 1st, 2nd, 3rd failure
sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null

Write-Host "Service '$ServiceName' created successfully." -ForegroundColor Green

# ── Start the service ─────────────────────────────────────────────────────────

Write-Host "Starting service..."
Start-Service -Name $ServiceName
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
    Write-Host "WARNING: Service started but health check failed. Check logs in: $(Join-Path $AgentDir 'logs')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "Manage with:" -ForegroundColor Cyan
Write-Host "  Get-Service $ServiceName          # Check status" -ForegroundColor Gray
Write-Host "  Restart-Service $ServiceName       # Restart" -ForegroundColor Gray
Write-Host "  Stop-Service $ServiceName          # Stop" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. In Doc-it Admin > Provisioning, set the endpoint URL to:" -ForegroundColor White
Write-Host "     http://$($env:COMPUTERNAME):${port}" -ForegroundColor Yellow
Write-Host "  2. Enter the token from config.json" -ForegroundColor White
Write-Host "  3. Click 'Test Connection' to verify" -ForegroundColor White
Write-Host ""
