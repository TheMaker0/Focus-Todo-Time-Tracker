@echo off
REM Run the Focus app using Electron from the local project folder.
cd /d "%~dp0"

if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" .
) else if exist "node-portable\node.exe" (
  call "node-portable\node.exe" "node_modules\.bin\electron" .
) else (
  echo Electron is not installed locally. Run build-electron.bat first or install dependencies.
  pause
  exit /b 1
)
