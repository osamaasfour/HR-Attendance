# Interactive Firebase login + Hosting deploy for mobile access anywhere.
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\deploy-web-hosting.ps1

Set-Location $PSScriptRoot\..
Write-Host ''
Write-Host 'HR Attendance - deploy to Firebase Hosting' -ForegroundColor Cyan
Write-Host 'Sign in with oasfour77@gmail.com when the browser opens.' -ForegroundColor Yellow
Write-Host ''

npx firebase-tools login
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Login failed or cancelled.' -ForegroundColor Red
  exit 1
}

npm run deploy:web
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Deploy failed.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Live on phone (any network):' -ForegroundColor Green
Write-Host '  https://ecf-hr.web.app'
Write-Host '  https://ecf-hr.firebaseapp.com'
Write-Host ''
