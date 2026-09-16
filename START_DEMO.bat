@echo off
setlocal
title Personal Health Service System - Local Demo
cd /d "%~dp0"
set PNPM_DISABLE_SELF_UPDATE_CHECK=true

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install Node.js 22 or later from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo.
  echo Node.js 22 or later is required. Your installed version is:
  node --version
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vinext" (
  echo.
  echo First-time setup: installing project dependencies...
  echo Internet access is required for this step only.
  call node "%~dp0tools\pnpm\bin\pnpm.mjs" install --frozen-lockfile
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting the local demo at http://localhost:3000
echo Keep this window open during the presentation.
echo Press Ctrl+C here when the presentation is finished.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000'"
call node "%~dp0tools\pnpm\bin\pnpm.mjs" run dev

endlocal
