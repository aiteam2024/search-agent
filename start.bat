@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Run step.bat once before start.bat.
  exit /b 1
)
if not exist "frontend\search_agent\node_modules" (
  echo Run step.bat once before start.bat.
  exit /b 1
)

start "Finder API" /D "%~dp0" cmd /k ".venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000"
start "Finder page" /D "%~dp0frontend\search_agent" cmd /k "npm run dev"

echo The API is at http://127.0.0.1:8000
echo The page is at http://localhost:3000/
endlocal
