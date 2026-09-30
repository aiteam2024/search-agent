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

netsh advfirewall firewall show rule name="Component Finder Page" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="Component Finder Page" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
  netsh advfirewall firewall add rule name="Component Finder API" dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
)

start "Finder API" /D "%~dp0" cmd /k ".venv\Scripts\python.exe -m uvicorn api.main:app --host 0.0.0.0 --port 8000"
start "Finder page" /D "%~dp0frontend\search_agent" cmd /k "npm run dev"

echo.
echo On this computer: http://localhost:3000/
echo On another computer on the same Wi-Fi, open:
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%A in ("%%I") do echo   http://%%A:3000/
)
echo.
echo If the other computer cannot connect, run start.bat as Administrator once so Windows Firewall allows ports 3000 and 8000.
endlocal
