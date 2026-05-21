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
