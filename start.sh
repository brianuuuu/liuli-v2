#!/usr/bin/env bash

# Set up error handling
set -e

# Get absolute path to the directory containing this script
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WEB_DIR="$ROOT/invest_assistant/ui/web"
LOG_DIR="$ROOT/var/logs"
PID_DIR="$ROOT/var/run"

# Ensure log and pid directories exist
mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

echo "Starting Liuli backend and Web frontend on Linux..."
echo "Root directory: $ROOT"

# 1. Check for python/python3
if command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  # Ensure it is python 3
  if python -c "import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)" >/dev/null 2>&1; then
    PYTHON="python"
  else
    echo "[ERROR] Python 3 is required but only Python 2 was found." >&2
    exit 1
  fi
else
  echo "[ERROR] python3 or python was not found in PATH." >&2
  exit 1
fi

# 2. Check for npm
if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm was not found in PATH." >&2
  exit 1
fi

# 3. Check and install web dependencies if missing
if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "[INFO] Web dependencies (node_modules) are missing. Installing..."
  pushd "$WEB_DIR" >/dev/null
  npm install --no-audit --no-fund
  popd >/dev/null
fi

# Function to check if a port is in use
is_port_in_use() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -i :"$port" >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -tln | grep -q ":$port "
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tln | grep -q ":$port "
  else
    # Fallback to bash socket if enabled
    (exec 3<>/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
  fi
}

# 4. Check if ports are free
if is_port_in_use 8000; then
  echo "[ERROR] Port 8000 is already in use (API). Please run stop.sh first." >&2
  exit 1
fi

if is_port_in_use 5173; then
  echo "[ERROR] Port 5173 is already in use (Web). Please run stop.sh first." >&2
  exit 1
fi

# 5. Start API
echo "[INFO] Starting Liuli API on port 8000..."
nohup "$PYTHON" -m uvicorn invest_assistant.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/api.log" 2>&1 &
echo $! > "$PID_DIR/api.pid"

# 6. Start Worker
echo "[INFO] Starting Liuli Worker..."
nohup "$PYTHON" -m invest_assistant.worker > "$LOG_DIR/worker.log" 2>&1 &
echo $! > "$PID_DIR/worker.pid"

# 7. Start Web Frontend
echo "[INFO] Starting Liuli Web on port 5173..."
pushd "$WEB_DIR" >/dev/null
nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/web.log" 2>&1 &
echo $! > "$PID_DIR/web.pid"
popd >/dev/null

echo ""
echo "Liuli has been started in the background!"
echo "Log files are located in: $LOG_DIR"
echo "  - API Log:     $LOG_DIR/api.log"
echo "  - Worker Log:  $LOG_DIR/worker.log"
echo "  - Web Log:     $LOG_DIR/web.log"
echo ""
echo "Access endpoints:"
echo "  - API: http://127.0.0.1:8000/api/health"
echo "  - Web: http://127.0.0.1:5173"
echo ""
echo "Use ./stop.sh to stop all processes."
