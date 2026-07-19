@echo off
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%invest_assistant\ui\web"
set "H5_DIR=%ROOT%invest_assistant\ui\android\h5"

echo Starting Liuli backend, desktop Web and Android H5...
echo Root: %ROOT%

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python was not found in PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found in PATH.
  exit /b 1
)

if not exist "%WEB_DIR%\node_modules" (
  echo [INFO] Web dependencies are missing. Installing...
  pushd "%WEB_DIR%"
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    exit /b 1
  )
  popd
)

if not exist "%H5_DIR%\node_modules" (
  echo [INFO] Android H5 dependencies are missing. Installing...
  pushd "%H5_DIR%"
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo [ERROR] Android H5 npm install failed.
    exit /b 1
  )
  popd
)

call :ensure_port_free 8000 API
if errorlevel 1 exit /b 1

call :ensure_port_free 5173 Web
if errorlevel 1 exit /b 1

call :ensure_port_free 5174 H5
if errorlevel 1 exit /b 1

start "Liuli API :8000" /D "%ROOT%" cmd /k python -m uvicorn invest_assistant.main:app --host 127.0.0.1 --port 8000
start "Liuli Worker" /D "%ROOT%" cmd /k python -m invest_assistant.worker
start "Liuli Web :5173" /D "%WEB_DIR%" cmd /k npm.cmd run dev -- --host 127.0.0.1 --port 5173
start "Liuli H5 :5174" /D "%H5_DIR%" cmd /k npm.cmd run dev -- --host 127.0.0.1 --port 5174

echo.
echo Liuli is starting:
echo   API: http://127.0.0.1:8000/api/health
echo   Worker: python -m invest_assistant.worker
echo   Web: http://127.0.0.1:5173
echo   Android H5: http://127.0.0.1:5174/
echo.
echo Use stop.bat to stop processes listening on ports 8000, 5173 and 5174.

endlocal
exit /b 0

:ensure_port_free
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port = [int]'%~1'; " ^
  "$listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1; " ^
  "if ($null -ne $listener) { exit 1 }; exit 0"
if errorlevel 1 (
  echo [ERROR] Port %~1 is already in use by %~2. Please run stop.bat first.
  exit /b 1
)
exit /b 0
