# ==============================================================
#  doc-it — Windows Installer  (Windows 10 / 11)
#  Repo: https://github.com/talder/doc-it
#
#  Usage (from project root in PowerShell):
#    powershell -ExecutionPolicy Bypass -File install-windows.ps1 [OPTIONS]
#
#  Options:
#    -Upgrade         Pull latest from GitHub & reinstall deps
#    -Force           Override Node.js version conflict
#    -NoSsl           Disable SSL verification (corporate proxy)
#    -Service         Install as Windows Service (delayed auto-start)
#    -Check           Preflight checks only — do not install
#    -Dir <path>      Override install directory (default: C:\doc-it)
#    -Branch <name>   Git branch to install (default: main, use 'dev' for development)
#    -Help            Show this help
# ==============================================================
param(
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$NoSsl,
  [switch]$Service,
  [switch]$Check,
  [string]$Dir = "C:\doc-it",
  [string]$Branch = "main",
  [switch]$Help
)

$RequiredNode  = 24
$Repo          = "https://github.com/talder/doc-it.git"
$ServiceName   = "doc-it"
$LogDir        = "$Dir\logs"
$ErrorActionPreference = "Stop"

if ($Help) {
  Get-Content $MyInvocation.MyCommand.Path | Where-Object { $_ -match '^#' } |
    ForEach-Object { $_ -replace '^# ?','' } | Select-Object -First 20
  exit 0
}

# ── Helpers ────────────────────────────────────────────────────
function Write-Info  { param($m) Write-Host "[doc-it] $m"        -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "[doc-it] ! $m"      -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "[doc-it] x $m"      -ForegroundColor Red; exit 1 }
function Write-Ok    { param($m) Write-Host "  + $m"             -ForegroundColor Green }
function Write-Bad   { param($m) Write-Host "  x $m"             -ForegroundColor Red;    $script:ChecksOk = $false }
function Write-Note  { param($m) Write-Host "  ! $m"             -ForegroundColor Yellow }

function Get-NodeMajor {
  try { return [int]((node --version 2>$null).TrimStart('v').Split('.')[0]) }
  catch { return 0 }
}

function Test-Url {
  param([string]$Url)
  try {
    $opts = @{ Uri = $Url; Method = 'Head'; TimeoutSec = 10; UseBasicParsing = $true }
    if ($NoSsl) { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } }
    $r = Invoke-WebRequest @opts -ErrorAction SilentlyContinue
    return ($r.StatusCode -lt 400)
  } catch { return $false }
}

function Refresh-Path {
  $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('PATH','User')
}

# ── Banner ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  doc-it  Windows Installer" -ForegroundColor Cyan
Write-Host "  Node.js $RequiredNode+  |  https://github.com/talder/doc-it" -ForegroundColor Cyan
Write-Host ""
if ($NoSsl)  { Write-Warn "SSL verification DISABLED (-NoSsl)" }
if ($Force)  { Write-Warn "Node.js conflict override ENABLED (-Force)" }
if ($Upgrade){ Write-Info "Mode: UPGRADE existing installation" }
if ($Branch -ne "main") { Write-Warn "Branch: $Branch" }
Write-Host ""

# ── Preflight checks ───────────────────────────────────────────
$ChecksOk = $true
Write-Host "  Preflight Checks" -ForegroundColor White
Write-Host "  ──────────────────────────────────────────────────────"

# Windows version
$os = (Get-CimInstance Win32_OperatingSystem)
Write-Ok "$($os.Caption)  [$($env:PROCESSOR_ARCHITECTURE)]"

# Admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { Write-Ok "Running as Administrator" }
else          { Write-Bad "Not running as Administrator — re-run PowerShell as Administrator" }

# git
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) { Write-Ok "git $((git --version) -replace 'git version ','')" }
else      { Write-Note "git not found — will install via winget" }

# Node.js
$currentNode = Get-NodeMajor
if ($currentNode -ge $RequiredNode) {
  Write-Ok "Node.js $(node --version)  (>= v$RequiredNode required)"
} elseif ($currentNode -gt 0) {
  if ($Force) {
    Write-Note "Node.js v$currentNode.x installed — will upgrade to v$RequiredNode (-Force active)"
  } else {
    Write-Bad "Node.js v$currentNode.x installed but v$RequiredNode+ required"
    Write-Host ""
    Write-Host "  Another Node.js version is already installed." -ForegroundColor Yellow
    Write-Host "  To replace it, re-run with -Force:" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Force" -ForegroundColor White
    Write-Host ""
  }
} else {
  Write-Note "Node.js not installed — will install v$RequiredNode"
}

# Network: github.com
if (Test-Url "https://github.com") {
  Write-Ok "Network: github.com reachable"
} else {
  # Retry without SSL
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  if (Test-Url "https://github.com") {
    Write-Note "github.com reachable only without SSL — try -NoSsl if behind a proxy"
  } else {
    Write-Bad "Cannot reach github.com — check internet connection"
  }
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
}

# GitHub repo reachability via git
$gitSslEnv = if ($NoSsl) { $env:GIT_SSL_NO_VERIFY = "true" } else { $env:GIT_SSL_NO_VERIFY = "" }
$repoCheck = git ls-remote --exit-code $Repo HEAD 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Ok "GitHub repo reachable: github.com/talder/doc-it"
} else {
  Write-Bad "GitHub repo unreachable: $Repo"
}

# npm registry
if (Test-Url "https://registry.npmjs.org") {
  Write-Ok "npm registry reachable"
} else {
  Write-Bad "npm registry unreachable — check connection or use -NoSsl"
}

# winget
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) { Write-Ok "winget available" }
else         { Write-Note "winget not found — will download Node.js MSI directly" }

# Disk space (500 MB)
$drive    = Split-Path -Qualifier $Dir
$diskInfo = Get-PSDrive ($drive.TrimEnd(':')) -ErrorAction SilentlyContinue
if ($diskInfo) {
  $freeMB = [math]::Round($diskInfo.Free / 1MB)
  if ($freeMB -ge 500) { Write-Ok "Disk space: $freeMB MB free on $drive" }
  else                  { Write-Bad "Disk space: only $freeMB MB free on $drive (500 MB needed)" }
}

# Install dir status
if (Test-Path "$Dir\.git") {
  Write-Note "Install dir $Dir already exists (git repo)"
} elseif (Test-Path $Dir) {
  Write-Note "Install dir $Dir exists but is NOT a git repo"
} else {
  Write-Ok "Install dir $Dir will be created"
}

Write-Host "  ──────────────────────────────────────────────────────"
if ($ChecksOk) { Write-Host "  All checks passed." -ForegroundColor Green }
else           { Write-Host "  Some checks failed — see above." -ForegroundColor Red }
Write-Host ""

if ($Check) { exit $(if ($ChecksOk) { 0 } else { 1 }) }
if (-not $ChecksOk) { Write-Fail "Fix the issues above then re-run." }

# ── 1. git ─────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Info "Installing git via winget..."
  winget install --id Git.Git --exact --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}

# ── 2. Node.js ─────────────────────────────────────────────────
$currentNode = Get-NodeMajor
if ($currentNode -lt $RequiredNode) {
  Write-Info "Installing Node.js $RequiredNode..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
  } else {
    Write-Info "Downloading Node.js MSI installer..."
    $arch    = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $msiUrl  = "https://nodejs.org/dist/latest-v$RequiredNode.x/node-v$RequiredNode.0.0-$arch.msi"
    $msiPath = "$env:TEMP\node-installer.msi"
    $wc = New-Object System.Net.WebClient
    if ($NoSsl) { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } }
    $wc.DownloadFile($msiUrl, $msiPath)
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$msiPath`" /qn ADDLOCAL=ALL"
    Remove-Item $msiPath -Force
    Refresh-Path
  }
}
$currentNode = Get-NodeMajor
if ($currentNode -lt $RequiredNode) { Write-Fail "Node.js $RequiredNode+ still not found. Close and reopen PowerShell, then re-run." }
Write-Info "Node.js $(node --version)  |  npm $(npm --version)"

# ── 3. Clone or upgrade ────────────────────────────────────────
if ($NoSsl) { $env:GIT_SSL_NO_VERIFY = "true" }

if ($Upgrade) {
  if (-not (Test-Path "$Dir\.git")) { Write-Fail "-Upgrade: $Dir is not a git repo. Run without -Upgrade to install first." }
  Write-Info "Stopping service before upgrade..."
  try { Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue } catch {}

  # ── Pre-upgrade data snapshot ──────────────────────────────────
  Write-Info "Creating pre-upgrade data snapshot..."
  $snapTs  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ss")
  $snapDir = "$Dir\snapshots\${snapTs}_pre-upgrade"
  New-Item -ItemType Directory -Path $snapDir -Force | Out-Null
  foreach ($src in @("config","docs","logs","archive","history")) {
    $srcPath = "$Dir\$src"
    if (Test-Path $srcPath) {
      Copy-Item -Path $srcPath -Destination "$snapDir\$src" -Recurse -Force
    }
  }
  Write-Ok "Snapshot saved to snapshots\${snapTs}_pre-upgrade"
  # Keep only 5 most recent snapshots
  $allSnaps = Get-ChildItem -Path "$Dir\snapshots" -Directory | Sort-Object Name
  if ($allSnaps.Count -gt 5) {
    $allSnaps | Select-Object -First ($allSnaps.Count - 5) | ForEach-Object {
      Remove-Item $_.FullName -Recurse -Force
    }
  }

  Write-Info "Pulling latest from GitHub ($Branch)..."
  git -C $Dir fetch origin $Branch
  git -C $Dir checkout $Branch 2>$null
  git -C $Dir reset --hard "origin/$Branch"
} else {
  if ((Test-Path $Dir) -and (Test-Path "$Dir\package.json")) {
    Write-Fail "$Dir already contains an installation. Use -Upgrade to update, or -Dir to choose another path."
  }
  Write-Info "Cloning https://github.com/talder/doc-it ($Branch) -> $Dir ..."
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  git clone -b $Branch $Repo $Dir
}

# ── 4. Dependencies & build ────────────────────────────────────
Set-Location $Dir
Write-Info "Installing npm dependencies..."
$npmArgs = if ($NoSsl) { @("install","--strict-ssl=false") } else { @("install") }
& npm @npmArgs
Write-Info "Patching known vulnerabilities..."
try { & npm audit fix 2>$null } catch {}
Write-Info "Building production bundle..."
npm run build

# ── 5. Service (NSSM / Windows Service) ────────────────────────
if ($Service) {
  Write-Info "Setting up Windows Service: $ServiceName ..."

  # Install NSSM if not present
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if (-not $nssm) {
    Write-Info "Installing NSSM via winget..."
    winget install --id NSSM.NSSM --exact --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
    $nssm = Get-Command nssm -ErrorAction SilentlyContinue
    if (-not $nssm) { Write-Fail "NSSM installation failed. Install manually from https://nssm.cc" }
  }

  $nodePath = (Get-Command node).Source
  $nextCmd  = "$Dir\node_modules\.bin\next.cmd"

  # Remove existing service if present
  & nssm stop  $ServiceName 2>$null
  & nssm remove $ServiceName confirm 2>$null

  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

  & nssm install      $ServiceName $nodePath
  & nssm set          $ServiceName AppParameters "$nextCmd start -p 3000"
  & nssm set          $ServiceName AppDirectory  $Dir
  & nssm set          $ServiceName DisplayName   "doc-it Documentation Platform"
  & nssm set          $ServiceName Description   "Self-hosted documentation platform"
  & nssm set          $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=3000"
  & nssm set          $ServiceName AppStdout     "$LogDir\service.log"
  & nssm set          $ServiceName AppStderr     "$LogDir\service.log"
  & nssm set          $ServiceName AppRotateFiles 1
  & nssm set          $ServiceName AppRotateBytes 10485760

  # Delayed auto-start prevents race with network/disk at boot
  & sc.exe config     $ServiceName start= delayed-auto | Out-Null
  & sc.exe failure    $ServiceName reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null

  Start-Service $ServiceName
  Write-Info "Service '$ServiceName' installed with delayed auto-start."
}

# ── Done ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  $(if ($Upgrade) { 'Upgrade' } else { 'Installation' }) complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Directory   : $Dir"
Write-Host "  Node.js     : $(node --version)"
Write-Host "  npm         : $(npm --version)"
Write-Host ""
if ($Service) {
  Write-Host "  Service     : $ServiceName  (delayed auto-start at boot)"
  Write-Host "  Logs        : $LogDir\service.log"
  Write-Host "  Start       : Start-Service $ServiceName"
  Write-Host "  Stop        : Stop-Service  $ServiceName"
  Write-Host "  Status      : Get-Service   $ServiceName"
} else {
  Write-Host "  Start dev   : cd $Dir ; npm run dev"
  Write-Host "  Start prod  : cd $Dir ; npm start"
}
Write-Host ""
Write-Host "  Open        : http://localhost:3000"
Write-Host "  First run   : /setup  (create admin account)"
Write-Host ""
Write-Host "  Upgrade     : powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path) -Upgrade"
Write-Host ""
