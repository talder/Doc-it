# Doc-it Inventory Agent — Windows
# Collects hardware and software inventory and reports to Doc-it.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File inventory-windows.ps1
#
# Schedule via Task Scheduler:
#   Action: powershell.exe
#   Arguments: -ExecutionPolicy Bypass -File "C:\doc-it-agent\inventory-windows.ps1"
#   Trigger: Daily at 06:00

# ── Configuration (edit these) ────────────────────────────────────────────────
$DocitUrl   = if ($env:DOCIT_URL)     { $env:DOCIT_URL }     else { "https://your-docit-server.example.com" }
$DocitApiKey = if ($env:DOCIT_API_KEY) { $env:DOCIT_API_KEY } else { "dk_s_your_service_key_here" }
# ──────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "SilentlyContinue"

# Hostname
$Hostname = [System.Net.Dns]::GetHostEntry("").HostName
if (-not $Hostname) { $Hostname = $env:COMPUTERNAME }

# OS
$OsInfo = Get-CimInstance Win32_OperatingSystem
$Os = "$($OsInfo.Caption) $($OsInfo.Version)"

# CPU
$Cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$CpuModel = $Cpu.Name -replace '\s+', ' '
$CpuCores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum

# RAM
$RamMb = [math]::Round($OsInfo.TotalVisibleMemorySize / 1024)

# IP addresses
$Ips = @()
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } | ForEach-Object {
    $Ips += $_.IPAddress
}

# Network interfaces
$Nics = @()
Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
    $Nics += @{
        name = $_.Name
        mac  = $_.MacAddress -replace '-', ':'
    }
}

# Disks
$Disks = @()
Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $Disks += @{
        name   = $_.Model
        sizeMb = [math]::Round($_.Size / 1MB)
        serial = ($_.SerialNumber -replace '\s', '')
    }
}

# Installed software (from registry)
$Software = @()
$Paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
foreach ($Path in $Paths) {
    Get-ItemProperty $Path 2>$null | Where-Object { $_.DisplayName } | ForEach-Object {
        $Software += @{
            name      = $_.DisplayName
            version   = $_.DisplayVersion
            publisher = $_.Publisher
        }
    }
}
# Deduplicate by name
$Software = $Software | Sort-Object { $_.name } -Unique

# Timestamp
$CollectedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Build payload
$Payload = @{
    hostname          = $Hostname
    os                = $Os
    ipAddresses       = $Ips
    collectedAt       = $CollectedAt
    hardwareInfo      = @{
        cpu      = $CpuModel
        cpuCores = $CpuCores
        ramMb    = $RamMb
        disks    = $Disks
        nics     = $Nics
    }
    softwareInventory = $Software
} | ConvertTo-Json -Depth 5 -Compress

# Send to Doc-it
try {
    $Headers = @{
        "Content-Type"  = "application/json"
        "Authorization" = "Bearer $DocitApiKey"
    }
    $Response = Invoke-RestMethod -Uri "$DocitUrl/api/assets/agent-report" -Method POST -Headers $Headers -Body $Payload
    Write-Host "[$(Get-Date)] OK: Asset $($Response.asset.id) — $($Response.asset.name)"
} catch {
    Write-Error "[$(Get-Date)] ERROR: $($_.Exception.Message)"
    exit 1
}
