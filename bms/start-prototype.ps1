[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 10520,

    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectDirectory = $PSScriptRoot
$Url = "http://localhost:$Port/"

function Test-PrototypeServer {
    param([string]$TargetUrl)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $TargetUrl -TimeoutSec 5
        return $response.StatusCode -eq 200 -and $response.Content -match "<title>BMS"
    }
    catch {
        return $false
    }
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js and try again."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm was not found. Check the Node.js installation."
}

if (Test-PrototypeServer -TargetUrl $Url) {
    Write-Host "[INFO] The unified BMS prototype is already running at $Url" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $Url }
    exit 0
}

$viteCommand = Join-Path $ProjectDirectory "node_modules\.bin\vite.cmd"
if (-not (Test-Path -LiteralPath $viteCommand)) {
    Write-Host "[INFO] Installing project dependencies for the first run..." -ForegroundColor Cyan
    Push-Location $ProjectDirectory
    try {
        & $npm.Source install
        if ($LASTEXITCODE -ne 0) { throw "Failed to install project dependencies." }
    }
    finally { Pop-Location }
}

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($TargetUrl)
        $deadline = (Get-Date).AddSeconds(60)
        do {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $TargetUrl -TimeoutSec 5
                if ($response.StatusCode -eq 200) { Start-Process $TargetUrl; return }
            }
            catch {}
            Start-Sleep -Milliseconds 500
        } while ((Get-Date) -lt $deadline)
    } -ArgumentList $Url | Out-Null
}

Write-Host "[INFO] Starting the unified BMS prototype at $Url" -ForegroundColor Cyan
Push-Location $ProjectDirectory
try { & $npm.Source run dev -- --port $Port }
finally { Pop-Location }
