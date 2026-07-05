@echo off
REM Package the Focus app as a Windows desktop executable using Electron.
cd /d "%~dp0"

set "NPM_CMD=npm"
if exist "node-portable\npm.cmd" set "NPM_CMD=node-portable\npm.cmd"

echo Installing dependencies...
"%NPM_CMD%" install
if errorlevel 1 (
  echo Failed to install dependencies. Please make sure Node.js and npm are installed.
  pause
  exit /b 1
)

echo Packaging Electron app for Windows...
"%NPM_CMD%" run package:win
if errorlevel 1 (
  echo Electron packaging failed. Please make sure electron-packager is installed and the build ran correctly.
  pause
  exit /b 1
)

echo Packaging completed. Check the dist\FocusApp-win32-x64 folder for your executable.
pause
