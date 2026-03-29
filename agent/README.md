# Doc-it Inventory Agent

Lightweight scripts that collect hardware and software inventory from client machines and report it to your Doc-it server.

## Prerequisites

- A **Doc-it service API key** (`dk_s_*`) with at least writer permissions. Create one in **Admin → Service Keys**.
- Network access from the client to your Doc-it server (HTTPS recommended).

## Configuration

Both scripts read two environment variables (or you can edit the values at the top of the script):

| Variable | Description |
|---|---|
| `DOCIT_URL` | Your Doc-it server URL, e.g. `https://docit.example.com` |
| `DOCIT_API_KEY` | Service API key, e.g. `dk_s_abc123...` |

## Linux

### Install

```bash
# Copy the script to the machine
sudo mkdir -p /opt/doc-it-agent
sudo cp inventory-linux.sh /opt/doc-it-agent/
sudo chmod +x /opt/doc-it-agent/inventory-linux.sh

# Edit the configuration at the top of the script
sudo nano /opt/doc-it-agent/inventory-linux.sh
```

### Run manually

```bash
/opt/doc-it-agent/inventory-linux.sh
```

### Schedule (cron)

```bash
sudo crontab -e
# Add this line to run daily at 06:00:
0 6 * * * /opt/doc-it-agent/inventory-linux.sh >> /var/log/docit-agent.log 2>&1
```

### Dependencies

The script uses standard tools available on most Linux distributions:
- `hostname`, `lscpu`, `nproc`, `free`, `ip`, `lsblk`, `curl`
- `python3` (for JSON formatting)
- `dpkg-query` (Debian/Ubuntu) or `rpm` (RHEL/CentOS)

## Windows

### Install

1. Copy `inventory-windows.ps1` to `C:\doc-it-agent\`
2. Edit the configuration variables at the top of the script

### Run manually

```powershell
powershell -ExecutionPolicy Bypass -File "C:\doc-it-agent\inventory-windows.ps1"
```

### Schedule (Task Scheduler)

1. Open **Task Scheduler** → **Create Basic Task**
2. Name: `Doc-it Inventory Agent`
3. Trigger: **Daily** at `06:00`
4. Action: **Start a program**
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\doc-it-agent\inventory-windows.ps1"`
5. Check "Run whether user is logged on or not"
6. Check "Run with highest privileges"

### GPO deployment

To deploy via Group Policy:

1. Place the script on a network share accessible to target machines
2. Create a GPO → Computer Configuration → Preferences → Scheduled Tasks
3. Configure as above, pointing to the network share path

### Dependencies

- PowerShell 5.1+ (built into Windows 10/11 and Server 2016+)
- Uses WMI/CIM cmdlets (`Get-CimInstance`, `Get-NetAdapter`, `Get-NetIPAddress`)

## Data Collected

| Category | Fields |
|---|---|
| System | Hostname, OS name/version, architecture |
| CPU | Model, core count |
| Memory | Total RAM (MB) |
| Disks | Model, capacity, serial number |
| Network | Interface name, MAC address, IP address |
| Software | Package name, version, publisher (Windows only) |

## How It Works

1. The script collects system information using native OS tools
2. Builds a JSON payload with all collected data
3. Sends an HTTPS POST to `/api/assets/agent-report` with the service API key
4. Doc-it matches the hostname to an existing asset (or creates a new one)
5. Updates the asset's OS, IP addresses, hardware info, and software inventory
6. Logs an "inventory-update" entry in the asset's history

## Security

- The agent only needs a service API key — no admin credentials
- Communication is over HTTPS (configure your Doc-it server with TLS)
- The scripts are read-only on the client — they don't modify any system settings
- All inventory data is stored in Doc-it's asset registry
