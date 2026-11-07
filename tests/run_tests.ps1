<#
.SYNOPSIS
    Runs the automated E2E test suite for Rustcord Discord Authentic UI.

.PARAMETER Tier
    Specifies which test tier to run: 'All', '1', '2', '3', '4'. Defaults to 'All'.

.PARAMETER Json
    If specified, outputs test results formatted as structured JSON.
#>
param (
    [ValidateSet('All', '1', '2', '3', '4')]
    [string]$Tier = 'All',

    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir

# Ensure Cargo bin is in PATH
$cargoBin = "C:\Users\Tsoij\.cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

# Ensure Node is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js executable was not found on PATH."
    exit 2
}

Push-Location $ProjectDir
try {
    $argsList = @("tests\verify_ui.js", "--tier=$Tier")
    if ($Json) {
        $argsList += "--json"
    }

    & node $argsList
    $exitCode = $LASTEXITCODE
    exit $exitCode
}
finally {
    Pop-Location
}
