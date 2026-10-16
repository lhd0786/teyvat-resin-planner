@echo off
cd /d "%~dp0"
echo Starting planner: http://127.0.0.1:17840/
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" server.mjs --open
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22 or newer was not found. Use the Windows portable package or install Node.js.
    pause
    exit /b 1
  )
  node server.mjs --open
)
echo.
echo If the planner is already running, open http://127.0.0.1:17840/
echo This window stays open so you can read the startup result.
pause
