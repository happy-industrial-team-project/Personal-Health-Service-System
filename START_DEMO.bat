@echo off
setlocal
title Personal Health Service System - Local Demo
cd /d "%~dp0"
set PNPM_DISABLE_SELF_UPDATE_CHECK=true

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install Node.js 22.13 or later from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 (
  echo.
  echo Node.js 22.13 or later is required. Your installed version is:
  node --version
  echo.
  pause
  exit /b 1
)

set NEED_INSTALL=0
if not exist "node_modules\.modules.yaml" set NEED_INSTALL=1
if not exist "node_modules\.bin\vinext.cmd" set NEED_INSTALL=1
if not exist "node_modules\next\package.json" set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
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
