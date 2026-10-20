@echo off
title Ana for your iPhone
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python isn't installed yet.
  echo Get it from python.org, tick "Add python.exe to PATH" when installing, then double-click this file again.
  echo.
  pause
  exit /b
)

if not exist ".venv\Scripts\activate.bat" (
  echo.
  echo First time setup. This takes a few minutes...
  echo.
  python -m venv .venv
  if errorlevel 1 ( pause & exit /b )
  call ".venv\Scripts\activate.bat"
  python -m pip install --quiet --upgrade pip
  pip install -r requirements.txt
  if errorlevel 1 ( echo. & echo Setup failed. Send Claude a screenshot of this window. & pause & exit /b )
) else (
  call ".venv\Scripts\activate.bat"
  pip install --quiet --disable-pip-version-check -r requirements.txt
  if errorlevel 1 ( echo. & echo Update failed. Send Claude a screenshot of this window. & pause & exit /b )
)

if not exist ".env" copy ".env.example" ".env" >nul

set MISSING=
findstr /r /c:"^OPENAI_API_KEY=..*" ".env" >nul || set MISSING=1
findstr /r /c:"^LIVEKIT_URL=..*" ".env" >nul || set MISSING=1
findstr /r /c:"^LIVEKIT_API_KEY=..*" ".env" >nul || set MISSING=1
findstr /r /c:"^LIVEKIT_API_SECRET=..*" ".env" >nul || set MISSING=1
if defined MISSING (
  echo.
  echo Notepad is opening. Fill in these lines, then save and close Notepad:
  echo   OPENAI_API_KEY=      your OpenAI key
  echo   LIVEKIT_URL=         from cloud.livekit.io, Settings, Keys (starts with wss://)
  echo   LIVEKIT_API_KEY=     same page
  echo   LIVEKIT_API_SECRET=  same page
  echo.
  notepad ".env"
  pause
)

echo.
echo Ana is waiting for calls from your iPhone. Keep this window open while you knock doors.
echo Close this window to stop her.
echo.
python agent.py start
echo.
pause
