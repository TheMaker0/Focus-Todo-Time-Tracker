@echo off
REM Build the standalone Windows executable for the Focus app.
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

echo Building executable...
"%NPM_CMD%" run build-exe
if errorlevel 1 (
  echo Build failed. Please make sure pkg is installed and the command ran correctly.
  pause
  exit /b 1
)

echo Build completed. You should now have FocusApp.exe in this folder.
pause
