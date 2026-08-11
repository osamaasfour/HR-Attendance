# Build signed release APK and copy to apk/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

if (-not (Test-Path "android\gradlew.bat")) {
  Write-Host "Running expo prebuild..."
  $env:CI = "1"
  npx expo prebuild --platform android
}

Push-Location android
try {
  .\gradlew.bat assembleRelease --no-daemon
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path apk | Out-Null
$apk = Get-ChildItem "android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
if (-not $apk) { throw "APK not found" }
Copy-Item $apk.FullName "apk\HR-Attendance-1.0.0.apk" -Force
Write-Host "APK ready: $root\apk\HR-Attendance-1.0.0.apk"
