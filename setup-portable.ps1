# Setup portable Sharkord Desktop: download Node.js into this directory and install deps.
# Run once. After this, use run.ps1 or run.bat (no global Node/npm needed).
# Requires: PowerShell 5+ and internet.

$ErrorActionPreference = "Stop"
$DesktopDir = $PSScriptRoot
$NodeDir   = Join-Path $DesktopDir "node"
$NodeZip   = Join-Path $DesktopDir "node.zip"

# Node.js 20 LTS Windows x64 (includes full npm in node_modules; Node 22 zip omits it)
$NodeVersion = "v20.18.0"
$NodeZipUrl  = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"

Write-Host "Sharkord Desktop - Portable setup" -ForegroundColor Cyan
Write-Host "Directory: $DesktopDir"
Write-Host ""

if (Test-Path $NodeDir) {
    Write-Host "Node directory already exists: $NodeDir" -ForegroundColor Yellow
    $overwrite = Read-Host "Re-download and replace? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Skipping Node download."
    } else {
        Write-Host "Close Sharkord Desktop and any other apps using Node, then we'll remove the old node folder."
        try {
            Remove-Item -Recurse -Force $NodeDir -ErrorAction Stop
        } catch {
            Write-Host "Could not remove node folder: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Close Sharkord Desktop (and any terminals in this folder), then run this script again." -ForegroundColor Yellow
            exit 1
        }
    }
}

if (-not (Test-Path $NodeDir)) {
    Write-Host "Downloading Node.js $NodeVersion (Windows x64)..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NodeZipUrl -OutFile $NodeZip -UseBasicParsing
    } catch {
        Write-Host "Download failed: $_" -ForegroundColor Red
        exit 1
    }
    Write-Host "Extracting to node\..."
    Expand-Archive -Path $NodeZip -DestinationPath $DesktopDir -Force
    $ExtractedDir = Join-Path $DesktopDir "node-$NodeVersion-win-x64"
    if (Test-Path $ExtractedDir) {
        Rename-Item -Path $ExtractedDir -NewName "node"
    }
    Remove-Item -Force $NodeZip -ErrorAction SilentlyContinue
    Write-Host "Node.js is ready in node\" -ForegroundColor Green
}

$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd  = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $NodeExe)) {
    Write-Host "Expected node.exe not found at $NodeExe" -ForegroundColor Red
    exit 1
}

$env:PATH = "$NodeDir;$NodeDir\node_modules\npm\bin;$env:PATH"
Set-Location $DesktopDir

Write-Host "Installing npm dependencies..."
& $NpmCmd install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building TypeScript..."
& $NpmCmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Portable setup complete." -ForegroundColor Green
Write-Host "Run the app with: .\run.ps1  or  run.bat"
Write-Host "You can copy this entire folder elsewhere; no global Node required."
