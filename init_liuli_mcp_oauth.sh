#!/usr/bin/env bash

set -euo pipefail

readonly PROJECT_ROOT="${LIULI_PROJECT_ROOT:-/home/liuli-v2}"
readonly PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
readonly START_SCRIPT="$PROJECT_ROOT/start_ubuntu_pg.sh"

cd "$PROJECT_ROOT"

[[ -x "$PYTHON_BIN" ]] || {
  printf '[ERROR] Python not found: %s\n' "$PYTHON_BIN" >&2
  exit 1
}
[[ -f "$START_SCRIPT" ]] || {
  printf '[ERROR] Startup script not found: %s\n' "$START_SCRIPT" >&2
  exit 1
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(
    sed -n 's/^export DATABASE_URL="\([^"]*\)"$/\1/p' "$START_SCRIPT" | head -n 1
  )"
  [[ -n "$DATABASE_URL" ]] || {
    printf '[ERROR] DATABASE_URL was not found in %s\n' "$START_SCRIPT" >&2
    exit 1
  }
  export DATABASE_URL
fi

export MCP_OAUTH_MASTER_KEY_FILE="/var/lib/liuli-mcp-oauth/master.key"

printf '一次性创建 ChatGPT OAuth client，请保存输出的 client_id 和 client_secret。\n'
exec "$PYTHON_BIN" -m invest_assistant.modules.basic.mcp.oauth.cli provision-client \
  --name ChatGPT \
  --redirect-uri 'https://chatgpt.com/connector/oauth/vKrIV9rCrHIT' \
  --profile chatgpt \
  --token-auth-method client_secret_basic
