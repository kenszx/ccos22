# Build & Test CCOS Pro — isolated from main instance
$ErrorActionPreference = "Stop"
$start = Get-Date

Write-Output "=== Phase 1: Build ==="
$env:PATH = "$env:USERPROFILE\node-portable\node-v22.15.0-win-x64;$env:USERPROFILE\.bun\bin;C:\Program Files (x86)\NSIS\Bin;$env:PATH"
Set-Location "$PSScriptRoot\desktop"

# Sidecar
bun run ./scripts/build-sidecars.ts 2>&1 | Out-Null
Write-Output "  [1/4] Sidecar OK"

# Renderer
bun run build 2>&1 | Out-Null
Write-Output "  [2/4] Renderer OK"

# Electron
bun run build:electron 2>&1 | Out-Null
Write-Output "  [3/4] Electron OK"

# Package dir
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
bun "./node_modules/electron-builder/out/cli/cli.js" --dir --x64 --publish never 2>&1 | Out-Null
Write-Output "  [4/4] Package OK"

# Copy to test dir
$testDir = "C:\CCOS-Pro-Dev"
Remove-Item -Recurse -Force "$testDir\app" -ErrorAction SilentlyContinue
Copy-Item -Recurse "build-artifacts\electron\win-unpacked" "$testDir\app"
Write-Output "Copied to $testDir\app\CCOS Pro.exe"

$elapsed = (Get-Date) - $start
Write-Output "=== Build done in $($elapsed.TotalSeconds.ToString('0'))s ==="

# Launch with isolated data
$env:CLAUDE_CONFIG_DIR = "$testDir\data"
Write-Output "Launching with data: $testDir\data"
Start-Process -FilePath "$testDir\app\CCOS Pro.exe"
