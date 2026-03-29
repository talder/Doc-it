import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cmdb/agent-script?os=linux|macos|windows&key=SERVICE_KEY&url=BASE_URL
 *
 * Returns a platform-specific inventory collection script.
 * The script collects hostname, OS, IPs, hardware, installed software
 * and POSTs to /api/cmdb/agent-report.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const os = sp.get("os") || "linux";
  const apiKey = sp.get("key") || "YOUR_SERVICE_API_KEY";
  const baseUrl = sp.get("url") || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  let script: string;
  let filename: string;
  let contentType: string;

  if (os === "windows") {
    filename = "docit-agent.ps1";
    contentType = "text/plain; charset=utf-8";
    script = generateWindowsScript(baseUrl, apiKey);
  } else if (os === "macos") {
    filename = "docit-agent.sh";
    contentType = "text/x-shellscript; charset=utf-8";
    script = generateMacScript(baseUrl, apiKey);
  } else {
    filename = "docit-agent.sh";
    contentType = "text/x-shellscript; charset=utf-8";
    script = generateLinuxScript(baseUrl, apiKey);
  }

  return new NextResponse(script, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function generateLinuxScript(baseUrl: string, apiKey: string): string {
  return `#!/bin/bash
# Doc-it CMDB Inventory Agent — Linux
# Usage: chmod +x docit-agent.sh && ./docit-agent.sh
# Schedule: Add to crontab — 0 */6 * * * /path/to/docit-agent.sh

set -euo pipefail

API_URL="${baseUrl}/api/cmdb/agent-report"
API_KEY="${apiKey}"
AGENT_VERSION="1.0.0"

HOSTNAME=$(hostname -f 2>/dev/null || hostname)
OS_INFO=$(cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME=" | cut -d'"' -f2 || uname -s -r)
IPS=$(hostname -I 2>/dev/null | tr ' ' '\\n' | grep -v '^$' | head -10 | jq -R . | jq -s .)

# Hardware
CPU=$(lscpu 2>/dev/null | grep "^Model name:" | sed 's/^Model name:\\s*//' || uname -p)
CPU_CORES=$(nproc 2>/dev/null || echo 1)
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
RAM_MB=$((RAM_KB / 1024))

DISKS=$(lsblk -bno NAME,SIZE,SERIAL -d 2>/dev/null | awk '{printf "{\\"name\\":\\"%s\\",\\"sizeMb\\":%d,\\"serial\\":\\"%s\\"},", $1, $2/1048576, $3}' || echo "")
DISKS="[$(echo "$DISKS" | sed 's/,$//')]"

NICS=$(ip -j addr 2>/dev/null | jq '[.[] | select(.ifname != "lo") | {name: .ifname, mac: .address, ip: (.addr_info[0].local // "")}]' 2>/dev/null || echo "[]")

# Software (dpkg or rpm)
if command -v dpkg-query &>/dev/null; then
  SOFTWARE=$(dpkg-query -W -f '\${Package}\\t\${Version}\\n' 2>/dev/null | head -500 | awk -F'\\t' '{printf "{\\"name\\":\\"%s\\",\\"version\\":\\"%s\\"},", $1, $2}')
elif command -v rpm &>/dev/null; then
  SOFTWARE=$(rpm -qa --qf '%{NAME}\\t%{VERSION}\\n' 2>/dev/null | head -500 | awk -F'\\t' '{printf "{\\"name\\":\\"%s\\",\\"version\\":\\"%s\\"},", $1, $2}')
else
  SOFTWARE=""
fi
SOFTWARE="[$(echo "$SOFTWARE" | sed 's/,$//')]"

PAYLOAD=$(cat <<EOF
{
  "hostname": "$HOSTNAME",
  "os": "$OS_INFO",
  "ipAddresses": $IPS,
  "hardwareInfo": {
    "cpu": "$CPU",
    "cpuCores": $CPU_CORES,
    "ramMb": $RAM_MB,
    "disks": $DISKS,
    "nics": $NICS
  },
  "softwareInventory": $SOFTWARE,
  "collectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "agentVersion": "$AGENT_VERSION",
  "agentId": "linux-$(cat /etc/machine-id 2>/dev/null || echo $HOSTNAME)"
}
EOF
)

curl -s -X POST "$API_URL" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" && echo " ✓ Inventory reported for $HOSTNAME" || echo " ✗ Failed to report inventory"
`;
}

function generateMacScript(baseUrl: string, apiKey: string): string {
  return `#!/bin/bash
# Doc-it CMDB Inventory Agent — macOS
# Usage: chmod +x docit-agent.sh && ./docit-agent.sh

set -euo pipefail

API_URL="${baseUrl}/api/cmdb/agent-report"
API_KEY="${apiKey}"
AGENT_VERSION="1.0.0"

HOSTNAME=$(hostname -f 2>/dev/null || hostname)
OS_INFO="macOS $(sw_vers -productVersion 2>/dev/null || echo unknown)"
IPS=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -10)
IPS_JSON=$(echo "$IPS" | while read -r ip; do echo "\\"$ip\\""; done | paste -sd, - | sed 's/^/[/;s/$/]/')

CPU=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")
CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 1)
RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
RAM_MB=$((RAM_BYTES / 1048576))

SOFTWARE=$(system_profiler SPApplicationsDataType -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
apps = data.get('SPApplicationsDataType', [])[:500]
result = [{'name': a.get('_name',''), 'version': a.get('version','')} for a in apps if a.get('_name')]
print(json.dumps(result))
" 2>/dev/null || echo "[]")

PAYLOAD=$(cat <<EOF
{
  "hostname": "$HOSTNAME",
  "os": "$OS_INFO",
  "ipAddresses": $IPS_JSON,
  "hardwareInfo": {
    "cpu": "$CPU",
    "cpuCores": $CPU_CORES,
    "ramMb": $RAM_MB
  },
  "softwareInventory": $SOFTWARE,
  "collectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "agentVersion": "$AGENT_VERSION",
  "agentId": "macos-$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk '/IOPlatformUUID/{print $3}' | tr -d '"' || echo $HOSTNAME)"
}
EOF
)

curl -s -X POST "$API_URL" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" && echo " ✓ Inventory reported for $HOSTNAME" || echo " ✗ Failed to report inventory"
`;
}

function generateWindowsScript(baseUrl: string, apiKey: string): string {
  return `# Doc-it CMDB Inventory Agent — Windows (PowerShell)
# Usage: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser; .\\docit-agent.ps1
# Schedule: Use Task Scheduler to run every 6 hours

$ErrorActionPreference = "SilentlyContinue"

$ApiUrl = "${baseUrl}/api/cmdb/agent-report"
$ApiKey = "${apiKey}"
$AgentVersion = "1.0.0"

$hostname = [System.Net.Dns]::GetHostEntry("").HostName
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$ips = @((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" }).IPAddress)

$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$cpuCores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
$ramMb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1MB)

$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  @{ name = $_.Model; sizeMb = [math]::Round($_.Size / 1MB); serial = $_.SerialNumber.Trim() }
})

$nics = @(Get-NetAdapter | Where-Object Status -eq "Up" | ForEach-Object {
  $ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
  @{ name = $_.Name; mac = $_.MacAddress; ip = ($ip | Select-Object -First 1) }
})

$software = @(Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* |
  Where-Object { $_.DisplayName } | Select-Object -First 500 | ForEach-Object {
    @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher }
  })

$machineId = (Get-CimInstance Win32_ComputerSystemProduct).UUID

$payload = @{
  hostname = $hostname
  os = $os
  ipAddresses = $ips
  hardwareInfo = @{ cpu = $cpu; cpuCores = $cpuCores; ramMb = $ramMb; disks = $disks; nics = $nics }
  softwareInventory = $software
  collectedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  agentVersion = $AgentVersion
  agentId = "win-$machineId"
} | ConvertTo-Json -Depth 5

try {
  $headers = @{ "Authorization" = "Bearer $ApiKey"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri $ApiUrl -Method POST -Headers $headers -Body $payload
  Write-Host " ✓ Inventory reported for $hostname"
} catch {
  Write-Host " ✗ Failed to report inventory: $_"
}
`;
}
