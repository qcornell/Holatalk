@echo off
title Put the Hola server online
cd /d "%~dp0"
echo.
echo This puts the Hola server online. It checks each rep's App Store plan and counts their Ana minutes.
echo About 5 minutes. A browser window opens once so you can sign in to Supabase.
echo.
pause

set SB=npx --yes supabase@2.119.0
set REF=bozoiqestwopczjaxnlu

echo.
echo Step 1 of 4: sign in to Supabase
call %SB% login || goto :fail
echo.
echo If it asks for the database password: it's the one you picked when you made the Supabase project.
echo Forgot it? Supabase, Project Settings, Database, Reset database password.
call %SB% link --project-ref %REF% || goto :fail

echo.
echo Step 2 of 4: the tables that hold plans and minutes
call %SB% db push || goto :fail

echo.
echo Step 3 of 4: the LiveKit keys and your owner code, from teammate-agent\.env
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("teammate-agent\.env") do set "ENV_%%a=%%b"
if not defined ENV_LIVEKIT_API_SECRET (
  echo teammate-agent\.env doesn't have the LiveKit keys yet.
  goto :fail
)
call %SB% secrets set "LIVEKIT_URL=%ENV_LIVEKIT_URL%" "LIVEKIT_API_KEY=%ENV_LIVEKIT_API_KEY%" "LIVEKIT_API_SECRET=%ENV_LIVEKIT_API_SECRET%" --project-ref %REF% || goto :fail
if defined ENV_TEAMMATE_ACCESS_CODES call %SB% secrets set "TEAMMATE_ACCESS_CODES=%ENV_TEAMMATE_ACCESS_CODES%" --project-ref %REF% || goto :fail
if defined ENV_TEAMMATE_MONTHLY_MINUTES call %SB% secrets set "TEAMMATE_MONTHLY_MINUTES=%ENV_TEAMMATE_MONTHLY_MINUTES%" --project-ref %REF% || goto :fail

echo.
echo Step 4 of 4: the start-live function
call %SB% functions deploy start-live --no-verify-jwt --use-api --project-ref %REF% || goto :fail

echo.
echo The server is online.
echo.
if defined ENV_TEAMMATE_ACCESS_CODES echo Your owner code, for the owner build on your phone: %ENV_TEAMMATE_ACCESS_CODES%
if defined ENV_TEAMMATE_ACCESS_CODES echo In the app: Settings, Owner code. Type it exactly as shown.
if defined ENV_TEAMMATE_ACCESS_CODES echo.
echo Last thing, so Ana counts minutes: Notepad and Supabase are opening.
echo In Supabase, copy the service_role key (Project Settings, API Keys, Reveal).
echo In Notepad, paste it after SUPABASE_SERVICE_ROLE_KEY= then save and close.
powershell -NoProfile -Command "$p='teammate-agent\.env'; (Get-Content $p) -replace '^SUPABASE_URL=$','SUPABASE_URL=https://%REF%.supabase.co' | Set-Content $p"
start "" "https://supabase.com/dashboard/project/%REF%/settings/api-keys"
notepad "teammate-agent\.env"
echo.
echo Done. Close the start-ana-for-iphone window and open it again.
pause
exit /b

:fail
echo.
echo That step didn't work. Send Claude a screenshot of this window.
pause
exit /b 1
