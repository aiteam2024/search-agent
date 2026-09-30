@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1 && (set "PYTHON=py -3") || (set "PYTHON=python")
%PYTHON% --version >nul 2>&1
if errorlevel 1 (
  echo Install Python 3 from https://www.python.org/downloads/ and run step.bat again.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org/ and run step.bat again.
  exit /b 1
)

echo Creating the Python environment...
if not exist ".venv\Scripts\python.exe" (
  %PYTHON% -m venv .venv
  if errorlevel 1 exit /b 1
)

echo Installing Python packages...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo Downloading the browser used for shop searches...
".venv\Scripts\python.exe" -m camoufox fetch
if errorlevel 1 exit /b 1

echo Installing the page...
pushd "frontend\search_agent"
call npm install
if errorlevel 1 (
  popd
  exit /b 1
)
popd

echo.
echo Setup is complete. Double-click start.bat to open the app.
endlocal
