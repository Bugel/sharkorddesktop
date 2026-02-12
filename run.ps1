# Run Sharkord Desktop. Uses Node in this directory if present; otherwise system Node.
$ErrorActionPreference = "Stop"
$DesktopDir = $PSScriptRoot
$NodeDir    = Join-Path $DesktopDir "node"
$NodeExe    = Join-Path $NodeDir "node.exe"
$NpmCmd     = Join-Path $NodeDir "npm.cmd"

if (Test-Path $NodeExe) {
    $env:PATH = "$NodeDir;$NodeDir\node_modules\npm\bin;$env:PATH"
    $Npm = "npm"
} else {
    $Npm = "npm"
    $found = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Host "Node/npm not found. Either:" -ForegroundColor Red
        Write-Host "  1. Run .\setup-portable.ps1 in this folder (downloads Node here), or"
        Write-Host "  2. Install Node.js from https://nodejs.org and try again."
        exit 1
    }
}

Set-Location $DesktopDir

if (-not (Test-Path (Join-Path $DesktopDir "node_modules"))) {
    Write-Host "Installing dependencies..."
    & $Npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path (Join-Path $DesktopDir "dist" "main.js"))) {
    Write-Host "Building..."
    & $Npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $Npm run start
