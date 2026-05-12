# Doc-it Provisioning Agent

A lightweight service that runs on your **Windows DNS server** and **Windows DHCP server**.
It allows Doc-it to create DNS records and DHCP reservations when provisioning new devices.

The same agent is installed on both servers — you just set the **mode** to `dns` or `dhcp` in the config.

## Requirements

- **Windows Server 2016 or later**
- **PowerShell 5.1** (pre-installed on all modern Windows Server)
- The server must already have the DNS or DHCP role installed
- Administrator access to install

No additional software or modules need to be installed.

---

## Quick Install (5 minutes)

### Step 1 — Copy the files

Copy the entire `provisioning-agent` folder to the server. A good location is:

```
C:\DocitAgent\
```

The folder should contain:
```
C:\DocitAgent\
  ├── docit-agent.ps1    ← the agent
  ├── config.json        ← settings (you edit this)
  ├── install.ps1        ← installer
  ├── uninstall.ps1      ← uninstaller
  └── README.md          ← this file
```

### Step 2 — Edit config.json

Open `config.json` in Notepad and change these values:

```json
{
  "port": 8520,
  "token": "paste-your-secret-token-here",
  "mode": "dns"
}
```

| Setting | What to set | Example |
|---------|-------------|---------|
| `port` | Leave as `8520` unless that port is already in use | `8520` |
| `token` | A secret password. Must be the same here and in Doc-it. Generate one (see below) or make up a long random string. | `aB3x9Kp2mQ7...` |
| `mode` | Set to `"dns"` on the DNS server, `"dhcp"` on the DHCP server | `"dns"` or `"dhcp"` |

**How to generate a secure token:**

Open PowerShell and run:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```
This gives you a random 40-character string. Use the **same token** on both servers and in Doc-it.

### Step 3 — Run the installer

1. Open **PowerShell as Administrator** (right-click → "Run as Administrator")
2. Navigate to the folder:
   ```powershell
   cd C:\DocitAgent
   ```
3. Run:
   ```powershell
   .\install.ps1
   ```

The installer will:
- Register the agent as a scheduled task (starts automatically on boot)
- Open the firewall port
- Start the agent immediately
- Show you a confirmation with the endpoint URL

### Step 4 — Configure Doc-it

In Doc-it, go to **Admin → Provisioning** and enter:

- **DNS Endpoint**: `http://YOUR-DNS-SERVER:8520`
- **DNS Token**: *(the token from config.json)*
- **DHCP Endpoint**: `http://YOUR-DHCP-SERVER:8520`
- **DHCP Token**: *(the token from config.json)*

Click **Test Connection** for each to verify.

---

## Repeat on the other server

Install the agent on both servers:
- DNS server with `"mode": "dns"`
- DHCP server with `"mode": "dhcp"`

Use the **same token** on both for simplicity (or different tokens if you prefer).

---

## Troubleshooting

### Check if the agent is running

Open a browser on the server and go to:
```
http://localhost:8520/api/health
```

You should see something like:
```json
{"status":"ok","mode":"dns","dns":true,"dhcp":false}
```

### Check the logs

Logs are in the `logs` subfolder:
```
C:\DocitAgent\logs\agent-2025-05-12.log
```

### Restart the agent

```powershell
# In PowerShell as Administrator:
Stop-ScheduledTask -TaskName "DocitProvisioningAgent"
Start-ScheduledTask -TaskName "DocitProvisioningAgent"
```

### The agent won't start

1. Make sure you're running PowerShell **as Administrator**
2. Check that the port isn't in use: `netstat -an | findstr 8520`
3. Check Task Scheduler → find "DocitProvisioningAgent" → see "Last Run Result"
4. Check the logs folder for error messages

### DNS/DHCP commands fail

The agent uses the built-in Windows Server cmdlets. Make sure:
- **DNS server**: The DNS Server role is installed (`Get-Module -ListAvailable DnsServer`)
- **DHCP server**: The DHCP Server role is installed (`Get-Module -ListAvailable DhcpServer`)

---

## Uninstall

1. Open **PowerShell as Administrator**
2. Run:
   ```powershell
   cd C:\DocitAgent
   .\uninstall.ps1
   ```

This removes the scheduled task and firewall rule. The files are left in place — delete the folder manually if you want.

---

## API Reference

All endpoints (except `/api/health`) require a `Authorization: Bearer <token>` header.

### Health Check
```
GET /api/health
```
No authentication required. Returns agent status.

### DNS Endpoints

**Check if a DNS record exists:**
```
GET /dns/records?name=PRINTER01&zone=example.local
```

**Create an A record:**
```
POST /dns/records
{ "name": "PRINTER01", "zone": "example.local", "ipAddress": "172.24.152.50" }
```

**Delete an A record (rollback):**
```
DELETE /dns/records/PRINTER01?zone=example.local
```

**List DNS zones:**
```
GET /dns/zones
```

### DHCP Endpoints

**Check if a reservation exists:**
```
GET /dhcp/reservations?ip=172.24.152.50&mac=AA:BB:CC:DD:EE:FF
```

**Create a reservation:**
```
POST /dhcp/reservations
{
  "scope": "172.24.152.0",
  "ipAddress": "172.24.152.50",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "hostName": "PRINTER01.example.local",
  "description": "Floor 2 printer"
}
```

**Delete a reservation (rollback):**
```
DELETE /dhcp/reservations/172.24.152.50
```

**List DHCP scopes:**
```
GET /dhcp/scopes
```

---

## Security Notes

- The agent listens on **HTTP** (not HTTPS). This is acceptable for internal infrastructure servers on a trusted network. If you need HTTPS, place a reverse proxy (IIS/nginx) in front of it.
- The Bearer token prevents unauthorized access. Keep it secret.
- The agent runs as **SYSTEM**, which has the necessary permissions for DNS/DHCP management.
- The firewall rule only allows connections from the **Domain** and **Private** network profiles (not Public).
