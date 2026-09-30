@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Run step.bat once on this computer before start.bat.
  pause
  exit /b 1
)
if not exist "frontend\search_agent\node_modules" (
  echo Run step.bat once on this computer before start.bat.
  pause
  exit /b 1
)

start "Finder API" /D "%~dp0" cmd /k ".venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000"
start "Finder page" /D "%~dp0frontend\search_agent" cmd /k "npm run dev"

echo.
echo The app is running on this computer only.
echo Open http://localhost:3000/ in this computer's browser.
echo.
pause
endlocal
