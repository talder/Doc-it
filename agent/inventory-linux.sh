#!/usr/bin/env bash
# Doc-it Inventory Agent — Linux
# Collects hardware and software inventory and reports to Doc-it.
#
# Usage:
#   chmod +x inventory-linux.sh
#   ./inventory-linux.sh
#
# Schedule via cron:
#   0 6 * * * /opt/doc-it-agent/inventory-linux.sh >> /var/log/docit-agent.log 2>&1

set -euo pipefail

# ── Configuration (edit these) ────────────────────────────────────────────────
DOCIT_URL="${DOCIT_URL:-https://your-docit-server.example.com}"
DOCIT_API_KEY="${DOCIT_API_KEY:-dk_s_your_service_key_here}"
# ──────────────────────────────────────────────────────────────────────────────

HOSTNAME=$(hostname -f 2>/dev/null || hostname)
OS=$(cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME=" | cut -d= -f2 | tr -d '"' || uname -s)
ARCH=$(uname -m)
COLLECTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# CPU
CPU_MODEL=$(lscpu 2>/dev/null | grep "Model name" | sed 's/Model name:\s*//' | head -1 || echo "")
CPU_CORES=$(nproc 2>/dev/null || echo 0)

# RAM (MB)
RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo 0)

# IP addresses
IP_JSON=$(ip -4 -j addr show 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
ips = []
for iface in data:
    for addr in iface.get('addr_info', []):
        ip = addr.get('local', '')
        if ip and ip != '127.0.0.1':
            ips.append(ip)
print(json.dumps(ips))
" 2>/dev/null || echo "[]")

# Network interfaces
NICS_JSON=$(ip -j link show 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
nics = []
for iface in data:
    name = iface.get('ifname', '')
    mac = iface.get('address', '')
    if name and name != 'lo':
        nics.append({'name': name, 'mac': mac})
print(json.dumps(nics))
" 2>/dev/null || echo "[]")

# Disks
DISKS_JSON=$(lsblk -Jb -o NAME,SIZE,SERIAL,TYPE 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
disks = []
for dev in data.get('blockdevices', []):
    if dev.get('type') == 'disk':
        disks.append({
            'name': dev.get('name', ''),
            'sizeMb': int(dev.get('size', 0)) // (1024*1024),
            'serial': dev.get('serial', '')
        })
print(json.dumps(disks))
" 2>/dev/null || echo "[]")

# Installed software (dpkg or rpm)
if command -v dpkg-query &>/dev/null; then
  SOFTWARE_JSON=$(dpkg-query -W -f='{"name":"${Package}","version":"${Version}"},\n' 2>/dev/null | sed '$ s/,$//' | awk 'BEGIN{print "["} {print} END{print "]"}' | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))" 2>/dev/null || echo "[]")
elif command -v rpm &>/dev/null; then
  SOFTWARE_JSON=$(rpm -qa --queryformat '{"name":"%{NAME}","version":"%{VERSION}-%{RELEASE}"},\n' 2>/dev/null | sed '$ s/,$//' | awk 'BEGIN{print "["} {print} END{print "]"}' | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))" 2>/dev/null || echo "[]")
else
  SOFTWARE_JSON="[]"
fi

# Build JSON payload
PAYLOAD=$(cat <<EOF
{
  "hostname": "${HOSTNAME}",
  "os": "${OS} (${ARCH})",
  "ipAddresses": ${IP_JSON},
  "collectedAt": "${COLLECTED_AT}",
  "hardwareInfo": {
    "cpu": "${CPU_MODEL}",
    "cpuCores": ${CPU_CORES},
    "ramMb": ${RAM_MB},
    "disks": ${DISKS_JSON},
    "nics": ${NICS_JSON}
  },
  "softwareInventory": ${SOFTWARE_JSON}
}
EOF
)

# Send to Doc-it
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${DOCIT_URL}/api/assets/agent-report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DOCIT_API_KEY}" \
  -d "${PAYLOAD}" 2>&1)

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [ "${HTTP_CODE}" = "200" ]; then
  echo "[$(date)] OK: ${BODY}"
else
  echo "[$(date)] ERROR (HTTP ${HTTP_CODE}): ${BODY}" >&2
  exit 1
fi
