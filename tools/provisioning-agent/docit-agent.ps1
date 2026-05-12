<#
.SYNOPSIS
    Doc-it Provisioning Agent — lightweight REST API for DNS and DHCP management.

.DESCRIPTION
    Runs as a Windows service (via Task Scheduler) on your DNS and/or DHCP server.
    Exposes a REST API that the Doc-it provisioning module calls to create/check/delete
    DNS records and DHCP reservations.

    Uses native Windows Server cmdlets:
      - DnsServer module  (Add/Get/Remove-DnsServerResourceRecord*)
      - DhcpServer module (Add/Get/Remove-DhcpServerv4Reservation, Get-DhcpServerv4Scope)

    No external dependencies — only PowerShell 5.1+ and the appropriate RSAT feature.

.NOTES
    See README.md for installation instructions.
#>

param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Load config ───────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$Port       = if ($Config.port)  { $Config.port }  else { 8520 }
$Token      = if ($Config.token) { $Config.token } else { Write-Error "Config: 'token' is required"; exit 1 }
$Mode       = if ($Config.mode)  { $Config.mode }  else { "both" }  # "dns", "dhcp", or "both"
$LogDir     = if ($Config.logDir) { $Config.logDir } else { Join-Path $PSScriptRoot "logs" }
$LogDays    = if ($Config.logRetentionDays) { $Config.logRetentionDays } else { 30 }
$DnsFlushTargets = if ($Config.dnsFlushTargets) { @($Config.dnsFlushTargets) } else { @() }

$Version    = "1.0.0"
$Prefix     = "http://+:${Port}/"

# Validate mode
if ($Mode -notin @("dns", "dhcp", "both")) {
    Write-Error "Config: 'mode' must be 'dns', 'dhcp', or 'both'. Got: $Mode"
    exit 1
}

# ── Logging ───────────────────────────────────────────────────────────────────

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log {
    param([string]$Level, [string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts [$Level] $Message"
    Write-Host $line
    $logFile = Join-Path $LogDir "agent-$(Get-Date -Format 'yyyy-MM-dd').log"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Cleanup-OldLogs {
    try {
        $cutoff = (Get-Date).AddDays(-$LogDays)
        Get-ChildItem -Path $LogDir -Filter "agent-*.log" |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            Remove-Item -Force
    } catch { }
}

# ── Module checks ─────────────────────────────────────────────────────────────

$DnsAvailable  = $false
$DhcpAvailable = $false

if ($Mode -in @("dns", "both")) {
    if (Get-Module -ListAvailable -Name DnsServer) {
        Import-Module DnsServer -ErrorAction SilentlyContinue
        $DnsAvailable = $true
        Write-Log "INFO" "DnsServer module loaded."
    } else {
        Write-Log "WARN" "DnsServer module not found. DNS endpoints will return 503."
    }
}

if ($Mode -in @("dhcp", "both")) {
    if (Get-Module -ListAvailable -Name DhcpServer) {
        Import-Module DhcpServer -ErrorAction SilentlyContinue
        $DhcpAvailable = $true
        Write-Log "INFO" "DhcpServer module loaded."
    } else {
        Write-Log "WARN" "DhcpServer module not found. DHCP endpoints will return 503."
    }
}

# ── Helper: send JSON response ────────────────────────────────────────────────

function Send-Json {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [object]$Body
    )
    $json = $Body | ConvertTo-Json -Depth 10 -Compress
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.ContentLength64 = $buffer.Length
    $Response.OutputStream.Write($buffer, 0, $buffer.Length)
    $Response.OutputStream.Close()
}

function Read-RequestBody {
    param([System.Net.HttpListenerRequest]$Request)
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    if ($body) { return $body | ConvertFrom-Json } else { return $null }
}

# ── Normalize MAC address to AA-BB-CC-DD-EE-FF (Windows DHCP format) ─────────

function Normalize-Mac {
    param([string]$Mac)
    $clean = $Mac -replace '[^0-9A-Fa-f]', ''
    if ($clean.Length -ne 12) { return $Mac }
    $parts = for ($i = 0; $i -lt 12; $i += 2) { $clean.Substring($i, 2).ToUpper() }
    return ($parts -join '-')
}

# ── DNS Handlers ──────────────────────────────────────────────────────────────

function Handle-DnsGetRecords {
    param($Response, $Query)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }

    $name = $Query["name"]
    $zone = $Query["zone"]
    if (-not $name -or -not $zone) {
        Send-Json $Response 400 @{ error = "Query parameters 'name' and 'zone' are required" }; return
    }

    try {
        $records = @(Get-DnsServerResourceRecord -ZoneName $zone -Name $name -RRType A -ErrorAction SilentlyContinue)
        $results = @($records | ForEach-Object {
            @{
                name      = $_.HostName
                type      = "A"
                ipAddress = $_.RecordData.IPv4Address.IPAddressToString
                ttl       = $_.TimeToLive.TotalSeconds
            }
        })
        Send-Json $Response 200 @{ count = $results.Count; records = $results }
    } catch {
        # Record not found is not an error
        Send-Json $Response 200 @{ count = 0; records = @() }
    }
}

function Get-ReverseZoneName {
    param([string]$Ip)
    # Convert 172.24.152.50 -> "152.24.172.in-addr.arpa" (class C reverse zone)
    $octets = $Ip.Split('.')
    $reverseZone = "$($octets[2]).$($octets[1]).$($octets[0]).in-addr.arpa"
    # Check if this reverse zone exists; if not, try class B (/16)
    try {
        $z = Get-DnsServerZone -Name $reverseZone -ErrorAction SilentlyContinue
        if ($z) { return $reverseZone }
    } catch { }
    $reverseZoneB = "$($octets[1]).$($octets[0]).in-addr.arpa"
    try {
        $z = Get-DnsServerZone -Name $reverseZoneB -ErrorAction SilentlyContinue
        if ($z) { return $reverseZoneB }
    } catch { }
    return $null
}

function Get-PtrName {
    param([string]$Ip, [string]$ReverseZone)
    # For zone "152.24.172.in-addr.arpa" and IP 172.24.152.50, PTR name is "50"
    # For zone "24.172.in-addr.arpa" and IP 172.24.152.50, PTR name is "50.152"
    $octets = $Ip.Split('.')
    $zoneParts = ($ReverseZone -replace '\.in-addr\.arpa$', '').Split('.')
    # Number of octets the zone covers
    $covered = $zoneParts.Count
    # Remaining octets (reversed) form the PTR record name
    $remaining = $octets[($covered)..3]
    [array]::Reverse($remaining)
    return ($remaining -join '.')
}

function Handle-DnsCreateRecord {
    param($Response, $Body)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }

    $type = if ($Body.type) { $Body.type } else { "A" }
    $name = $Body.name
    $zone = $Body.zone

    # Handle PTR records
    if ($type -eq "PTR") {
        $target = $Body.target
        if (-not $name -or -not $zone -or -not $target) {
            Send-Json $Response 400 @{ error = "Fields 'name', 'zone', and 'target' are required for PTR" }; return
        }
        try {
            Add-DnsServerResourceRecordPtr -ZoneName $zone -Name $name -PtrDomainName $target -ErrorAction Stop
            Write-Log "INFO" "DNS: Created PTR record $name.$zone -> $target"
            Send-Json $Response 201 @{ success = $true; name = $name; zone = $zone; type = "PTR"; target = $target }
        } catch {
            Write-Log "ERROR" "DNS: Failed to create PTR record: $_"
            Send-Json $Response 500 @{ error = $_.Exception.Message }
        }
        return
    }

    $ip   = $Body.ipAddress
    $createPtr = if ($Body.PSObject.Properties.Match('createPtr').Count -gt 0) { $Body.createPtr } else { $true }
    if (-not $name -or -not $zone -or -not $ip) {
        Send-Json $Response 400 @{ error = "Fields 'name', 'zone', and 'ipAddress' are required" }; return
    }

    try {
        # Check if record already exists
        $existing = @(Get-DnsServerResourceRecord -ZoneName $zone -Name $name -RRType A -ErrorAction SilentlyContinue)
        if ($existing.Count -gt 0) {
            Send-Json $Response 409 @{ error = "DNS record '$name' already exists in zone '$zone'" }; return
        }

        Add-DnsServerResourceRecordA -ZoneName $zone -Name $name -IPv4Address $ip -ErrorAction Stop
        Write-Log "INFO" "DNS: Created A record $name.$zone -> $ip"

        # Automatically create PTR record in the reverse zone
        $ptrCreated = $false
        $ptrDetail  = ""
        if ($createPtr) {
            $reverseZone = Get-ReverseZoneName $ip
            if ($reverseZone) {
                $ptrName = Get-PtrName $ip $reverseZone
                $fqdn    = "$name.$zone"
                try {
                    Add-DnsServerResourceRecordPtr -ZoneName $reverseZone -Name $ptrName -PtrDomainName $fqdn -ErrorAction Stop
                    $ptrCreated = $true
                    $ptrDetail  = "$ptrName.$reverseZone -> $fqdn"
                    Write-Log "INFO" "DNS: Created PTR record $ptrDetail"
                } catch {
                    $ptrDetail = "PTR creation failed: $($_.Exception.Message)"
                    Write-Log "WARN" "DNS: $ptrDetail"
                }
            } else {
                $ptrDetail = "No reverse zone found for $ip"
                Write-Log "WARN" "DNS: $ptrDetail"
            }
        }

        Send-Json $Response 201 @{
            success    = $true
            name       = $name
            zone       = $zone
            ipAddress  = $ip
            ptrCreated = $ptrCreated
            ptrDetail  = $ptrDetail
        }
    } catch {
        Write-Log "ERROR" "DNS: Failed to create record: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DnsDeleteRecord {
    param($Response, $Name, $Query)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }

    $zone = $Query["zone"]
    if (-not $Name -or -not $zone) {
        Send-Json $Response 400 @{ error = "Record name in URL and 'zone' query parameter are required" }; return
    }

    try {
        $records = @(Get-DnsServerResourceRecord -ZoneName $zone -Name $Name -RRType A -ErrorAction SilentlyContinue)
        if ($records.Count -eq 0) {
            Send-Json $Response 404 @{ error = "DNS record '$Name' not found in zone '$zone'" }; return
        }

        # Collect IPs before deleting (for PTR cleanup)
        $ips = @($records | ForEach-Object { $_.RecordData.IPv4Address.IPAddressToString })

        foreach ($rec in $records) {
            Remove-DnsServerResourceRecord -ZoneName $zone -InputObject $rec -Force -ErrorAction Stop
        }
        Write-Log "INFO" "DNS: Deleted A record(s) for $Name in zone $zone"

        # Also remove matching PTR records (best-effort)
        $ptrDeleted = 0
        foreach ($ip in $ips) {
            try {
                $reverseZone = Get-ReverseZoneName $ip
                if ($reverseZone) {
                    $ptrName = Get-PtrName $ip $reverseZone
                    $ptrRec = @(Get-DnsServerResourceRecord -ZoneName $reverseZone -Name $ptrName -RRType PTR -ErrorAction SilentlyContinue)
                    foreach ($p in $ptrRec) {
                        Remove-DnsServerResourceRecord -ZoneName $reverseZone -InputObject $p -Force -ErrorAction SilentlyContinue
                        $ptrDeleted++
                    }
                    if ($ptrDeleted -gt 0) { Write-Log "INFO" "DNS: Deleted $ptrDeleted PTR record(s) for $ip" }
                }
            } catch { Write-Log "WARN" "DNS: PTR cleanup failed for $ip : $_" }
        }

        Send-Json $Response 200 @{ success = $true; deleted = $records.Count; ptrDeleted = $ptrDeleted }
    } catch {
        Write-Log "ERROR" "DNS: Failed to delete record: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DnsGetZones {
    param($Response)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }

    try {
        $zones = @(Get-DnsServerZone -ErrorAction SilentlyContinue |
            Where-Object { $_.ZoneType -in @("Primary", "Secondary") } |
            ForEach-Object {
                @{ name = $_.ZoneName; type = $_.ZoneType.ToString(); isReverse = [bool]$_.IsReverseLookupZone }
            })
        Send-Json $Response 200 @{ zones = $zones }
    } catch {
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DnsFlushCache {
    param($Response, $Body = $null)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }

    # Flush this server's local DNS cache only
    try {
        Clear-DnsServerCache -Force -ErrorAction Stop
        $result = @{ host = $env:COMPUTERNAME; success = $true; detail = "Local cache cleared" }
        Write-Log "INFO" "DNS: Flushed local DNS server cache"
    } catch {
        $result = @{ host = $env:COMPUTERNAME; success = $false; detail = $_.Exception.Message }
        Write-Log "ERROR" "DNS: Failed to flush local cache: $_"
    }

    Send-Json $Response 200 @{ results = @($result) }
}

# ── Extended DNS Handlers ─────────────────────────────────────────────────────

function Handle-DnsGetZoneRecords {
    param($Response, $Zone, $Query)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }
    if (-not $Zone) { Send-Json $Response 400 @{ error = "Zone name is required" }; return }

    $typeFilter = $Query["type"]
    $nameFilter = $Query["name"]

    try {
        $allRecords = @(Get-DnsServerResourceRecord -ZoneName $Zone -ErrorAction SilentlyContinue)
        if ($typeFilter) { $allRecords = @($allRecords | Where-Object { $_.RecordType -eq $typeFilter }) }
        if ($nameFilter) { $allRecords = @($allRecords | Where-Object { $_.HostName -like "*$nameFilter*" }) }

        $results = @($allRecords | ForEach-Object {
            $rd = $_.RecordData
            $data = switch ($_.RecordType) {
                "A"     { $rd.IPv4Address.IPAddressToString }
                "AAAA"  { $rd.IPv6Address.IPAddressToString }
                "CNAME" { $rd.HostNameAlias }
                "MX"    { "$($rd.Preference) $($rd.MailExchange)" }
                "TXT"   { ($rd.DescriptiveText -join ' ') }
                "SRV"   { "$($rd.Priority) $($rd.Weight) $($rd.Port) $($rd.DomainName)" }
                "NS"    { $rd.NameServer }
                "SOA"   { "$($rd.PrimaryServer) $($rd.ResponsiblePerson)" }
                "PTR"   { $rd.PtrDomainName }
                default { $rd.ToString() }
            }
            @{
                name = $_.HostName
                type = $_.RecordType.ToString()
                data = $data
                ttl  = $_.TimeToLive.TotalSeconds
            }
        })
        Send-Json $Response 200 @{ count = $results.Count; records = $results }
    } catch {
        Write-Log "ERROR" "DNS: Failed to list zone records: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DnsGetZoneStats {
    param($Response, $Zone)
    if (-not $DnsAvailable) { Send-Json $Response 503 @{ error = "DnsServer module not available" }; return }
    if (-not $Zone) { Send-Json $Response 400 @{ error = "Zone name is required" }; return }

    try {
        $allRecords = @(Get-DnsServerResourceRecord -ZoneName $Zone -ErrorAction SilentlyContinue)
        $byType = @{}
        foreach ($rec in $allRecords) {
            $t = $rec.RecordType.ToString()
            if ($byType.ContainsKey($t)) { $byType[$t]++ } else { $byType[$t] = 1 }
        }
        Send-Json $Response 200 @{ total = $allRecords.Count; byType = $byType }
    } catch {
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

# ── Extended DHCP Handlers ────────────────────────────────────────────────────

function Handle-DhcpGetScopeReservations {
    param($Response, $ScopeId)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }
    try {
        $reservations = @(Get-DhcpServerv4Reservation -ScopeId $ScopeId -ErrorAction SilentlyContinue | ForEach-Object {
            @{ ipAddress = $_.IPAddress.IPAddressToString; macAddress = $_.ClientId; name = $_.Name; description = $_.Description; scopeId = $_.ScopeId.IPAddressToString }
        })
        Send-Json $Response 200 @{ reservations = $reservations }
    } catch { Send-Json $Response 500 @{ error = $_.Exception.Message } }
}

function Handle-DhcpGetScopeLeases {
    param($Response, $ScopeId)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }
    try {
        $leases = @(Get-DhcpServerv4Lease -ScopeId $ScopeId -ErrorAction SilentlyContinue | ForEach-Object {
            @{
                ipAddress    = $_.IPAddress.IPAddressToString
                macAddress   = $_.ClientId
                hostName     = $_.HostName
                leaseStart   = if ($_.LeaseExpiryTime) { $_.LeaseExpiryTime.AddDays(-$_.LeaseExpiryTime.Day).ToString("o") } else { $null }
                leaseExpiry  = if ($_.LeaseExpiryTime) { $_.LeaseExpiryTime.ToString("o") } else { $null }
                addressState = $_.AddressState.ToString()
            }
        })
        Send-Json $Response 200 @{ leases = $leases }
    } catch { Send-Json $Response 500 @{ error = $_.Exception.Message } }
}

function Handle-DhcpGetScopeStats {
    param($Response, $ScopeId)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }
    try {
        $stats = Get-DhcpServerv4ScopeStatistics -ScopeId $ScopeId -ErrorAction Stop
        Send-Json $Response 200 @{
            total       = $stats.AddressesFree + $stats.AddressesInUse
            used        = $stats.AddressesInUse
            free        = $stats.AddressesFree
            percentUsed = $stats.PercentageInUse
        }
    } catch { Send-Json $Response 500 @{ error = $_.Exception.Message } }
}

function Handle-DhcpGetScopeOptions {
    param($Response, $ScopeId)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }
    try {
        $opts = @(Get-DhcpServerv4OptionValue -ScopeId $ScopeId -ErrorAction SilentlyContinue | ForEach-Object {
            @{ optionId = $_.OptionId; name = $_.Name; value = ($_.Value -join ', ') }
        })
        Send-Json $Response 200 @{ options = $opts }
    } catch { Send-Json $Response 500 @{ error = $_.Exception.Message } }
}

function Handle-DhcpGetScopeExclusions {
    param($Response, $ScopeId)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }
    try {
        $excl = @(Get-DhcpServerv4ExclusionRange -ScopeId $ScopeId -ErrorAction SilentlyContinue | ForEach-Object {
            @{ startRange = $_.StartRange.IPAddressToString; endRange = $_.EndRange.IPAddressToString }
        })
        Send-Json $Response 200 @{ exclusions = $excl }
    } catch { Send-Json $Response 500 @{ error = $_.Exception.Message } }
}

# ── DHCP Handlers ─────────────────────────────────────────────────────────────

function Handle-DhcpGetReservations {
    param($Response, $Query)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }

    $ip  = $Query["ip"]
    $mac = $Query["mac"]

    try {
        $reservations = @()

        if ($ip) {
            # -IPAddress alone looks up across all scopes (separate parameter set from -ScopeId)
            try {
                $res = Get-DhcpServerv4Reservation -IPAddress $ip -ErrorAction SilentlyContinue
                if ($res) { $reservations += @($res) }
            } catch { }
        }

        if ($mac -and $reservations.Count -eq 0) {
            $normalizedMac = Normalize-Mac $mac
            $scopes = @(Get-DhcpServerv4Scope -ErrorAction SilentlyContinue)
            foreach ($scope in $scopes) {
                try {
                    $all = @(Get-DhcpServerv4Reservation -ScopeId $scope.ScopeId -ErrorAction SilentlyContinue)
                    $matched = $all | Where-Object { (Normalize-Mac $_.ClientId) -eq $normalizedMac }
                    if ($matched) { $reservations += @($matched) }
                } catch { }
            }
        }

        $results = @($reservations | ForEach-Object {
            @{
                ipAddress   = $_.IPAddress.IPAddressToString
                scopeId     = $_.ScopeId.IPAddressToString
                macAddress  = $_.ClientId
                name        = $_.Name
                description = $_.Description
            }
        })

        Send-Json $Response 200 @{ count = $results.Count; reservations = $results }
    } catch {
        Write-Log "ERROR" "DHCP: Failed to query reservations: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DhcpCreateReservation {
    param($Response, $Body)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }

    $scope = $Body.scope
    $ip    = $Body.ipAddress
    $mac   = $Body.macAddress
    $host_ = $Body.hostName
    $desc  = if ($Body.description) { $Body.description } else { "" }

    if (-not $scope -or -not $ip -or -not $mac) {
        Send-Json $Response 400 @{ error = "Fields 'scope', 'ipAddress', and 'macAddress' are required" }; return
    }

    $normalizedMac = Normalize-Mac $mac

    try {
        # Check if reservation already exists
        try {
            $existing = Get-DhcpServerv4Reservation -IPAddress $ip -ErrorAction SilentlyContinue
            if ($existing) {
                Send-Json $Response 409 @{ error = "DHCP reservation already exists for IP $ip" }; return
            }
        } catch { }

        $params = @{
            ScopeId     = $scope
            IPAddress   = $ip
            ClientId    = $normalizedMac
            Description = $desc
        }
        if ($host_) { $params.Name = $host_ }

        Add-DhcpServerv4Reservation @params -ErrorAction Stop
        Write-Log "INFO" "DHCP: Created reservation $ip ($normalizedMac) in scope $scope"
        Send-Json $Response 201 @{ success = $true; ipAddress = $ip; scope = $scope; macAddress = $normalizedMac }
    } catch {
        Write-Log "ERROR" "DHCP: Failed to create reservation: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DhcpUpdateReservation {
    param($Response, $Ip, $Body)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }

    if (-not $Ip) {
        Write-Log "WARN" "DHCP Update: No IP in URL"
        Send-Json $Response 400 @{ error = "IP address is required in URL" }; return
    }

    Write-Log "INFO" "DHCP Update: IP=$Ip Body=$($Body | ConvertTo-Json -Compress -Depth 3)"

    $scope = $Body.scope
    $desc  = $Body.description

    Write-Log "INFO" "DHCP Update: scope=$scope description='$desc' (type=$($desc.GetType().Name))"

    if ($null -eq $desc) {
        Write-Log "WARN" "DHCP Update: description is null, returning 400"
        Send-Json $Response 400 @{ error = "'description' field is required" }; return
    }

    try {
        # Get-DhcpServerv4Reservation: -ScopeId and -IPAddress are separate parameter sets
        # Use -IPAddress alone to look up by IP (works across all scopes)
        $res = Get-DhcpServerv4Reservation -IPAddress $Ip -ErrorAction SilentlyContinue
        if (-not $res) {
            Write-Log "WARN" "DHCP Update: No reservation found for IP $Ip"
            Send-Json $Response 404 @{ error = "No DHCP reservation found for IP $Ip" }; return
        }

        $beforeDesc = $res.Description
        $foundScope = $res.ScopeId.IPAddressToString
        Write-Log "INFO" "DHCP Update: Found in scope $foundScope, current description='$beforeDesc'"

        Write-Log "INFO" "DHCP Update: Calling Set-DhcpServerv4Reservation -IPAddress $Ip -Description '$desc'"
        Set-DhcpServerv4Reservation -IPAddress $Ip -Description $desc -ErrorAction Stop

        # Verify the update actually took effect
        $after = Get-DhcpServerv4Reservation -IPAddress $Ip -ErrorAction SilentlyContinue
        $afterDesc = if ($after) { $after.Description } else { "(lookup failed)" }
        Write-Log "INFO" "DHCP Update: Done. Before='$beforeDesc' After='$afterDesc'"

        Send-Json $Response 200 @{ success = $true; ipAddress = $Ip; description = $desc; previousDescription = $beforeDesc; verifiedDescription = $afterDesc }
    } catch {
        Write-Log "ERROR" "DHCP Update: Failed for IP $Ip : $($_.Exception.Message)"
        Write-Log "ERROR" "DHCP Update: Full error: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DhcpDeleteReservation {
    param($Response, $Ip, $Query)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }

    if (-not $Ip) {
        Send-Json $Response 400 @{ error = "IP address is required in URL" }; return
    }

    $scope = $Query["scope"]

    try {
        if ($scope) {
            # Direct delete from known scope
            Remove-DhcpServerv4Reservation -ScopeId $scope -IPAddress $Ip -ErrorAction Stop
        } else {
            # Look up reservation by IP (separate parameter set from -ScopeId)
            $res = Get-DhcpServerv4Reservation -IPAddress $Ip -ErrorAction SilentlyContinue
            if (-not $res) {
                Send-Json $Response 404 @{ error = "No DHCP reservation found for IP $Ip" }; return
            }
            Remove-DhcpServerv4Reservation -ScopeId $res.ScopeId -IPAddress $Ip -ErrorAction Stop
        }
        Write-Log "INFO" "DHCP: Deleted reservation for $Ip"
        Send-Json $Response 200 @{ success = $true }
    } catch {
        Write-Log "ERROR" "DHCP: Failed to delete reservation: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

function Handle-DhcpGetScopes {
    param($Response)
    if (-not $DhcpAvailable) { Send-Json $Response 503 @{ error = "DhcpServer module not available" }; return }

    try {
        $scopes = @(Get-DhcpServerv4Scope -ErrorAction SilentlyContinue | ForEach-Object {
            @{
                scopeId     = $_.ScopeId.IPAddressToString
                name        = $_.Name
                description = $_.Description
                startRange  = $_.StartRange.IPAddressToString
                endRange    = $_.EndRange.IPAddressToString
                subnetMask  = $_.SubnetMask.IPAddressToString
                state       = $_.State.ToString()
            }
        })
        Send-Json $Response 200 @{ scopes = $scopes }
    } catch {
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

# ── Log Reader Handler ─────────────────────────────────────────────────────────

function Handle-GetLogs {
    param($Response, $Query)
    $maxLines = if ($Query["lines"]) { [int]$Query["lines"] } else { 200 }
    $levelFilter = $Query["level"]  # e.g. "ERROR", "WARN"

    try {
        # Read today's and yesterday's log files
        $logFiles = @(
            Join-Path $LogDir "agent-$(Get-Date -Format 'yyyy-MM-dd').log"
            Join-Path $LogDir "agent-$((Get-Date).AddDays(-1).ToString('yyyy-MM-dd')).log"
        ) | Where-Object { Test-Path $_ }

        $allLines = @()
        foreach ($f in $logFiles) {
            $allLines += @(Get-Content $f -Encoding UTF8 -ErrorAction SilentlyContinue)
        }

        # Parse lines: "2026-05-12 15:15:50 [INFO] message"
        $entries = @($allLines | ForEach-Object {
            if ($_ -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$') {
                @{ timestamp = $Matches[1]; level = $Matches[2]; message = $Matches[3] }
            }
        } | Where-Object { $_ -ne $null })

        # Apply level filter
        if ($levelFilter) {
            $entries = @($entries | Where-Object { $_.level -eq $levelFilter.ToUpper() })
        }

        # Return last N entries (most recent last)
        if ($entries.Count -gt $maxLines) {
            $entries = $entries[($entries.Count - $maxLines)..($entries.Count - 1)]
        }

        Send-Json $Response 200 @{
            count   = $entries.Count
            host    = $env:COMPUTERNAME
            entries = $entries
        }
    } catch {
        Write-Log "ERROR" "Failed to read logs: $_"
        Send-Json $Response 500 @{ error = $_.Exception.Message }
    }
}

# ── HTTP Listener ─────────────────────────────────────────────────────────────

Write-Log "INFO" "Doc-it Provisioning Agent v$Version starting..."
Write-Log "INFO" "Mode: $Mode | Port: $Port | DNS available: $DnsAvailable | DHCP available: $DhcpAvailable"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)

try {
    $listener.Start()
} catch {
    Write-Log "ERROR" "Failed to start HTTP listener on port $Port. Run as Administrator or use 'netsh http add urlacl url=$Prefix user=Everyone'"
    exit 1
}

Write-Log "INFO" "Listening on port $Port. Press Ctrl+C to stop."

# Cleanup old logs on startup
Cleanup-OldLogs

# ── Request loop ──────────────────────────────────────────────────────────────

try {
    while ($listener.IsListening) {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response

        $method   = $request.HttpMethod
        $path     = $request.Url.AbsolutePath.TrimEnd('/')
        $query    = $request.QueryString

        # Add CORS headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Authorization, Content-Type")

        # Handle CORS preflight
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.OutputStream.Close()
            continue
        }

        # ── Auth check (skip for /api/health) ────────────────────────────────
        if ($path -ne "/api/health") {
            $authHeader = $request.Headers["Authorization"]
            if (-not $authHeader -or $authHeader -ne "Bearer $Token") {
                Write-Log "WARN" "Unauthorized request from $($request.RemoteEndPoint) to $path"
                Send-Json $response 401 @{ error = "Unauthorized" }
                continue
            }
        }

        Write-Log "INFO" "$method $path from $($request.RemoteEndPoint)"

        try {
            # ── Route: Health ─────────────────────────────────────────────────
            if ($path -eq "/api/health") {
                Send-Json $response 200 @{
                    status  = "ok"
                    version = $Version
                    mode    = $Mode
                    host    = $env:COMPUTERNAME
                    dns     = $DnsAvailable
                    dhcp    = $DhcpAvailable
                    time    = (Get-Date -Format "o")
                }
            }

            # ── Route: Logs ──────────────────────────────────────────────────
            elseif ($path -eq "/api/logs") {
                Handle-GetLogs $response $query
            }

            # ── Route: Status ─────────────────────────────────────────────────
            elseif ($path -eq "/api/status") {
                Send-Json $response 200 @{
                    version  = $Version
                    mode     = $Mode
                    hostname = $env:COMPUTERNAME
                    dns      = $DnsAvailable
                    dhcp     = $DhcpAvailable
                    uptime   = [math]::Round(([datetime]::Now - (Get-Process -Id $PID).StartTime).TotalMinutes, 1)
                }
            }

            # ── DNS Routes ────────────────────────────────────────────────────
            elseif ($path -eq "/dns/records" -and $method -eq "GET") {
                Handle-DnsGetRecords $response $query
            }
            elseif ($path -eq "/dns/records" -and $method -eq "POST") {
                $body = Read-RequestBody $request
                Handle-DnsCreateRecord $response $body
            }
            elseif ($path -match "^/dns/records/(.+)$" -and $method -eq "DELETE") {
                $recordName = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DnsDeleteRecord $response $recordName $query
            }
            elseif ($path -eq "/dns/zones" -and $method -eq "GET") {
                Handle-DnsGetZones $response
            }
            elseif ($path -match "^/dns/zones/([^/]+)/records$" -and $method -eq "GET") {
                $zoneName = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DnsGetZoneRecords $response $zoneName $query
            }
            elseif ($path -match "^/dns/zones/([^/]+)/stats$" -and $method -eq "GET") {
                $zoneName = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DnsGetZoneStats $response $zoneName
            }
            elseif ($path -eq "/dns/flush-cache" -and $method -eq "POST") {
                $body = Read-RequestBody $request
                Handle-DnsFlushCache $response $body
            }

            # ── DHCP Routes
            elseif ($path -eq "/dhcp/reservations" -and $method -eq "GET") {
                Handle-DhcpGetReservations $response $query
            }
            elseif ($path -eq "/dhcp/reservations" -and $method -eq "POST") {
                $body = Read-RequestBody $request
                Handle-DhcpCreateReservation $response $body
            }
            elseif ($path -match "^/dhcp/reservations/(.+)$" -and $method -eq "PATCH") {
                $resIp = [System.Uri]::UnescapeDataString($Matches[1])
                $body = Read-RequestBody $request
                Handle-DhcpUpdateReservation $response $resIp $body
            }
            elseif ($path -match "^/dhcp/reservations/(.+)$" -and $method -eq "DELETE") {
                $resIp = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpDeleteReservation $response $resIp $query
            }
            elseif ($path -eq "/dhcp/scopes" -and $method -eq "GET") {
                Handle-DhcpGetScopes $response
            }
            elseif ($path -match "^/dhcp/scopes/([^/]+)/reservations$" -and $method -eq "GET") {
                $scopeId = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpGetScopeReservations $response $scopeId
            }
            elseif ($path -match "^/dhcp/scopes/([^/]+)/leases$" -and $method -eq "GET") {
                $scopeId = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpGetScopeLeases $response $scopeId
            }
            elseif ($path -match "^/dhcp/scopes/([^/]+)/stats$" -and $method -eq "GET") {
                $scopeId = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpGetScopeStats $response $scopeId
            }
            elseif ($path -match "^/dhcp/scopes/([^/]+)/options$" -and $method -eq "GET") {
                $scopeId = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpGetScopeOptions $response $scopeId
            }
            elseif ($path -match "^/dhcp/scopes/([^/]+)/exclusions$" -and $method -eq "GET") {
                $scopeId = [System.Uri]::UnescapeDataString($Matches[1])
                Handle-DhcpGetScopeExclusions $response $scopeId
            }

            # ── 404 ──────────────────────────────────────────────────────────
            else {
                Send-Json $response 404 @{ error = "Not found: $method $path" }
            }
        } catch {
            Write-Log "ERROR" "Unhandled error on $method $path : $_"
            try { Send-Json $response 500 @{ error = "Internal server error" } } catch { }
        }
    }
} finally {
    $listener.Stop()
    Write-Log "INFO" "Agent stopped."
}
