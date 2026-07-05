@echo off
REM Run this app without XAMPP. Requires Node.js installed and on PATH.
cd /d "%~dp0"

if not defined npm_execpath (
  echo Node.js is not installed or not available in PATH.
  echo Install Node.js from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

if not exist package.json (
  echo package.json not found. This file must be run from the app folder.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting app...
start "" "http://localhost:3000"
npm start
