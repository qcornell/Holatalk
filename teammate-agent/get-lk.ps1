# Downloads LiveKit's command-line tool (lk.exe) for put-ana-online.bat on PCs without winget.
# It comes from LiveKit's own GitHub releases, at a pinned version, and is checked against the
# SHA-256 LiveKit published for it. It goes in %LOCALAPPDATA%\Hola\lk, outside the project.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads crawl in Windows PowerShell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$version = '2.18.8'
$sha256 = @{
  amd64 = 'bcd059b5be584c2a09a8bcb2c0e091983b0734c89575aa7a14dab8e405d08825'
  arm64 = '73766e207396b2716091047c2124b46fb79d3838f39d2b6bdb60cbbc2621faa3'
}
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'amd64' }
$name = "lk_${version}_windows_$arch.zip"
$dir = Join-Path $env:LOCALAPPDATA 'Hola\lk'
$zip = Join-Path $env:TEMP $name

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/livekit/livekit-cli/releases/download/v$version/$name" -OutFile $zip
$got = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
if ($got -ne $sha256[$arch]) {
  Remove-Item $zip -Force
  throw "The download didn't match LiveKit's published checksum, so it wasn't used."
}
$unpacked = Join-Path $env:TEMP "lk_$version"
if (Test-Path $unpacked) { Remove-Item $unpacked -Recurse -Force }
Expand-Archive -Force -Path $zip -DestinationPath $unpacked
$exe = Get-ChildItem -Path $unpacked -Recurse -Filter 'lk.exe' | Select-Object -First 1
if (-not $exe) { throw 'lk.exe was not in the download.' }
Copy-Item -Force $exe.FullName (Join-Path $dir 'lk.exe')
Remove-Item $zip, $unpacked -Recurse -Force
Write-Host "LiveKit tool $version is ready."
