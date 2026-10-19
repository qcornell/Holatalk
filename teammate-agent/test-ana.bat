@echo off
title Test Ana
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

findstr /r /c:"^OPENAI_API_KEY=..*" ".env" >nul
if errorlevel 1 (
  echo.
  echo Notepad is opening. Paste your OpenAI API key right after OPENAI_API_KEY=
  echo Then save, close Notepad, and come back to this window.
  echo.
  notepad ".env"
  pause
)

echo.
echo Starting Ana. Put your headphones on. Press Ctrl+C to stop.
echo.
python agent.py console
echo.
pause
