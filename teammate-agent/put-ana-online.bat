@echo off
title Put Ana online
cd /d "%~dp0"
echo.
echo This runs Ana in LiveKit's cloud, so she answers calls even when this PC is off.
echo About 10 minutes the first time.
echo.
pause

rem The LiveKit tool: already installed, or downloaded once into %LOCALAPPDATA%\Hola\lk
set "LK=lk"
where lk >nul 2>nul && goto :have_lk
set "LK=%LOCALAPPDATA%\Hola\lk\lk.exe"
if exist "%LK%" goto :have_lk
echo Getting the LiveKit tool from LiveKit's GitHub page. About 40 MB.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-lk.ps1" || goto :fail
:have_lk

echo.
echo Step 1 of 2: sign in to LiveKit in the browser window, and pick the Hola project.
"%LK%" cloud auth || goto :fail

echo.
echo Step 2 of 2: sending Ana to the cloud
rem Ana's settings and keys from .env, except LiveKit's own keys (the cloud has those) and PC-only files
powershell -NoProfile -Command "Get-Content .env | Where-Object { $_ -match '^[A-Z_]+=.+' -and $_ -notmatch '^(LIVEKIT_|PLAYBOOK_FILE=|LEADS_FILE=|TEAMMATE_ACCESS_CODES=|TEAMMATE_MONTHLY_MINUTES=)' } | Set-Content cloud-secrets.env"
if exist livekit.toml (
  "%LK%" agent deploy --secrets-file cloud-secrets.env
) else (
  "%LK%" agent create --secrets-file cloud-secrets.env
)
set RESULT=%errorlevel%
del cloud-secrets.env
if not "%RESULT%"=="0" goto :fail

echo.
echo Ana is online. You can close the start-ana-for-iphone window now.
pause
exit /b

:fail
echo.
echo That step didn't work. Send Claude a screenshot of this window.
pause
exit /b 1
