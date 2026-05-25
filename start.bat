@echo off
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%invest_assistant\ui\web"

echo Starting Liuli backend and Web frontend...
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

call :ensure_port_free 8000 API
if errorlevel 1 exit /b 1

call :ensure_port_free 5173 Web
if errorlevel 1 exit /b 1

start "Liuli API :8000" /D "%ROOT%" cmd /k python -m uvicorn invest_assistant.main:app --host 127.0.0.1 --port 8000
start "Liuli Worker" /D "%ROOT%" cmd /k python -m invest_assistant.worker
start "Liuli Web :5173" /D "%WEB_DIR%" cmd /k npm.cmd run dev -- --host 127.0.0.1 --port 5173

echo.
echo Liuli is starting:
echo   API: http://127.0.0.1:8000/api/health
echo   Worker: python -m invest_assistant.worker
echo   Web: http://127.0.0.1:5173
echo.
echo Use stop.bat to stop processes listening on ports 8000 and 5173.

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
