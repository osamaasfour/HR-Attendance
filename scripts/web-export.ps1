# Expo web static export — Metro needs extra Node heap on Windows (default ~2GB OOMs).
Set-Location $PSScriptRoot\..

$env:METRO_MAX_WORKERS = '2'

Write-Host 'Exporting web bundle (8GB Node heap)...' -ForegroundColor Cyan
& node --max-old-space-size=8192 "$PSScriptRoot\..\node_modules\expo\bin\cli" export --platform web
if ($LASTEXITCODE -ne 0) {
  Write-Host 'expo export failed.' -ForegroundColor Red
  exit $LASTEXITCODE
}

& "$PSScriptRoot\copy-public-assets.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Web export complete -> dist/' -ForegroundColor Green
