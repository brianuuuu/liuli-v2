#!/usr/bin/env bash

# Get absolute path to the directory containing this script
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_DIR="$ROOT/var/run"

echo "Stopping Liuli backend, worker, and Web frontend..."

stop_process_tree() {
  local pid=$1
  local name=$2

  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -P "$pid" 2>/dev/null || true
  fi
  kill "$pid" 2>/dev/null || true

  for i in {1..10}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "[WARNING] $name (PID $pid) did not exit gracefully, sending SIGKILL..."
    if command -v pkill >/dev/null 2>&1; then
      pkill -KILL -P "$pid" 2>/dev/null || true
    fi
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# Function to stop a process by its PID file
stop_by_pid_file() {
  local name=$1
  local pid_file="$PID_DIR/$name.pid"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "[INFO] Stopping $name (PID $pid)..."
      stop_process_tree "$pid" "$name"
    else
      echo "[INFO] Process $name (PID $pid) is already stopped."
    fi
    rm -f "$pid_file"
  else
    echo "[INFO] No PID file found for $name."
  fi
}

stop_by_port() {
  local port=$1
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti TCP:"$port" 2>/dev/null || true)
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids=$(fuser -n tcp "$port" 2>/dev/null || true)
  fi

  if [ -n "$pids" ]; then
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        echo "[INFO] Stopping process still listening on port $port (PID $pid)..."
        stop_process_tree "$pid" "port $port listener"
      fi
    done
  fi
}

# 1. Stop using PID files first
stop_by_pid_file "api"
stop_by_pid_file "worker"
stop_by_pid_file "web"

# 2. Fallback scan using pgrep / ps to ensure no orphaned processes remain
echo "[INFO] Scanning for any orphaned Liuli processes..."

# List of patterns to look for in process arguments
PATTERNS=(
  "invest_assistant.main:app"
  "invest_assistant.worker"
  "npm run dev -- --host 0.0.0.0 --port 5173"
  "vite --host 0.0.0.0 --port 5173"
  "vite.*--port 5173"
)

for pattern in "${PATTERNS[@]}"; do
  # Find all matching PIDs (excluding the stop.sh script itself)
  pids=$(pgrep -f "$pattern" | grep -v "$$" || true)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        echo "[INFO] Found orphaned process matching '$pattern' (PID $pid). Stopping..."
        stop_process_tree "$pid" "$pattern"
      fi
    done
  fi
done

stop_by_port 5173

# Clean up PID directory if it exists and is empty
if [ -d "$PID_DIR" ]; then
  rmdir "$PID_DIR" 2>/dev/null || true
fi

echo "Done. All Liuli processes stopped."
