# Build static web export and deploy to Firebase Hosting.
Set-Location $PSScriptRoot\..

& "$PSScriptRoot\web-export.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Deploying to Firebase Hosting...' -ForegroundColor Cyan
npx firebase-tools deploy --only hosting --project ecf-hr
exit $LASTEXITCODE
