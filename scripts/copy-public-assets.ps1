# Copy static public/ assets into dist/ after expo export (Expo may not copy them).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'public'
$dst = Join-Path $root 'dist'
if (-not (Test-Path $src)) { exit 0 }
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }
Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
Write-Host "Copied public/ → dist/"
