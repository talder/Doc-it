<#
.SYNOPSIS
    Installs the Doc-it Provisioning Agent.

.DESCRIPTION
    Two installation modes:
      -Mode service  (default) — Windows Service via bundled NSSM.
                     Visible in services.msc, monitorable with CheckMK etc.
      -Mode task     — Scheduled Task (AtStartup, SYSTEM, auto-restart).
                     Fallback if you prefer not to use NSSM.

    Both modes:
      - Run as SYSTEM (has access to DNS/DHCP cmdlets)
      - Start automatically at boot
      - Restart on failure
      - Register HTTP URL reservation and firewall rule

.PARAMETER Mode
    Installation mode: "service" (default) or "task".

.NOTES
    Must be run as Administrator. Works with both PowerShell 5.1 and 7+.
#>

param(
    [ValidateSet("service", "task")]
    [string]$Mode = "service"
)

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ServiceName = "DocitProvisioningAgent"
$AgentDir    = $PSScriptRoot
$AgentScript = Join-Path $AgentDir "docit-agent.ps1"
$ConfigFile  = Join-Path $AgentDir "config.json"
$NssmExe     = Join-Path $AgentDir "nssm.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Doc-it Provisioning Agent Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Mode: $Mode" -ForegroundColor Gray
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

if ($Mode -eq "service" -and -not (Test-Path $NssmExe)) {
    Write-Host "ERROR: nssm.exe not found in $AgentDir" -ForegroundColor Red
    Write-Host "The bundled nssm.exe is required for service mode." -ForegroundColor Yellow
    Write-Host "Use -Mode task as an alternative." -ForegroundColor Yellow
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

# ── Clean up any previous installation ────────────────────────────────────────

# Remove existing Windows Service (NSSM or legacy sc.exe)
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Host "Removing existing service '$ServiceName'..." -ForegroundColor Yellow
    if (Test-Path $NssmExe) {
        & $NssmExe stop $ServiceName 2>$null | Out-Null
        & $NssmExe remove $ServiceName confirm 2>$null | Out-Null
    } else {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName | Out-Null
    }
    Start-Sleep -Seconds 2
}

# Remove existing scheduled task
$existingTask = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task '$ServiceName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Start-Sleep -Seconds 1
}

# Clean up compiled service wrapper from old installs
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

# ── Install: Service mode (NSSM) ───────────────────────────────────────────────

if ($Mode -eq "service") {
    Write-Host "Installing Windows Service via NSSM: $ServiceName"

    & $NssmExe install $ServiceName powershell.exe `
        "-NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`"" | Out-Null
    & $NssmExe set $ServiceName AppDirectory $AgentDir | Out-Null
    & $NssmExe set $ServiceName DisplayName "Doc-it Provisioning Agent" | Out-Null
    & $NssmExe set $ServiceName Description "Doc-it Provisioning Agent - REST API for DNS/DHCP management" | Out-Null
    & $NssmExe set $ServiceName Start SERVICE_DELAYED_AUTO_START | Out-Null
    & $NssmExe set $ServiceName ObjectName LocalSystem | Out-Null

    # Restart on failure with 60s delay
    & $NssmExe set $ServiceName AppExit Default Restart | Out-Null
    & $NssmExe set $ServiceName AppRestartDelay 60000 | Out-Null
    & $NssmExe set $ServiceName AppThrottle 5000 | Out-Null

    # Redirect stdout/stderr to agent log dir for NSSM-level logging
    $nssmLogDir = Join-Path $AgentDir "logs"
    if (-not (Test-Path $nssmLogDir)) { New-Item -ItemType Directory -Path $nssmLogDir -Force | Out-Null }
    & $NssmExe set $ServiceName AppStdout (Join-Path $nssmLogDir "nssm-stdout.log") | Out-Null
    & $NssmExe set $ServiceName AppStderr (Join-Path $nssmLogDir "nssm-stderr.log") | Out-Null
    & $NssmExe set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmExe set $ServiceName AppRotateBytes 5242880 | Out-Null

    Write-Host "Service '$ServiceName' created successfully." -ForegroundColor Green

    Write-Host "Starting service..."
    & $NssmExe start $ServiceName | Out-Null
    Start-Sleep -Seconds 3
}

# ── Install: Task mode ───────────────────────────────────────────────────────

if ($Mode -eq "task") {
    Write-Host "Creating scheduled task: $ServiceName"

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
        -TaskName $ServiceName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description "Doc-it Provisioning Agent - REST API for DNS/DHCP management" `
        -Force | Out-Null

    Write-Host "Task '$ServiceName' created successfully." -ForegroundColor Green

    Write-Host "Starting task..."
    Start-ScheduledTask -TaskName $ServiceName
    Start-Sleep -Seconds 3
}

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
    Write-Host "WARNING: Agent started but health check failed. Check logs in: $(Join-Path $AgentDir 'logs')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
if ($Mode -eq "service") {
    Write-Host "Manage with:" -ForegroundColor Cyan
    Write-Host "  Get-Service $ServiceName              # Check status" -ForegroundColor Gray
    Write-Host "  Restart-Service $ServiceName           # Restart" -ForegroundColor Gray
    Write-Host "  Stop-Service $ServiceName              # Stop" -ForegroundColor Gray
} else {
    Write-Host "Manage with:" -ForegroundColor Cyan
    Write-Host "  Get-ScheduledTask -TaskName $ServiceName     # Check status" -ForegroundColor Gray
    Write-Host "  Start-ScheduledTask -TaskName $ServiceName    # Start" -ForegroundColor Gray
    Write-Host "  Stop-ScheduledTask -TaskName $ServiceName     # Stop" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. In Doc-it Admin > Provisioning, set the endpoint URL to:" -ForegroundColor White
Write-Host "     http://$($env:COMPUTERNAME):${port}" -ForegroundColor Yellow
Write-Host "  2. Enter the token from config.json" -ForegroundColor White
Write-Host "  3. Click 'Test Connection' to verify" -ForegroundColor White
Write-Host ""
