param(
  [int]$Port = 10530
)

$ErrorActionPreference = 'Stop'
$ProjectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$Npm = Get-Command npm -ErrorAction Stop

Write-Host "[INFO] Starting the Goldjet logistics prototype at http://localhost:$Port" -ForegroundColor Cyan
Push-Location $ProjectDirectory
try {
  & $Npm.Source run dev -- --port $Port
}
finally {
  Pop-Location
}
