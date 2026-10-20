@echo off
title Check Ana's iPhone link
cd /d "%~dp0"
if not exist ".venv\Scripts\activate.bat" (
  echo Run start-ana-for-iphone.bat first, once.
  pause
  exit /b
)
call ".venv\Scripts\activate.bat"
echo.
echo Pretending to be your iPhone. Keep the start-ana-for-iphone window open too.
echo.
python check_phone_link.py
echo.
pause
