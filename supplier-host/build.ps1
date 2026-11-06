# Supplier Windows build entry. Never store signing passwords in this script.
$ErrorActionPreference = "Stop"
$buildExitCode = 1
Push-Location $PSScriptRoot
try {
    # Respect an externally configured key. Otherwise use the supplier's local
    # key file if present; private keys are intentionally not in the delivery ZIP.
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        $keyFile = Join-Path $PSScriptRoot "src-tauri/backup/app-signing.key"
        if (Test-Path $keyFile -PathType Leaf) {
            $env:TAURI_SIGNING_PRIVATE_KEY = $keyFile
        }
    }
    # For an encrypted key, set TAURI_SIGNING_PRIVATE_KEY_PASSWORD externally.
    & npm run tauri:build:default
    $buildExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $buildExitCode
