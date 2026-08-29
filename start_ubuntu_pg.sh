#!/usr/bin/env bash

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOT"

# Password contains "#", so it must be URL-encoded as "%23" in DATABASE_URL.
export DATABASE_URL="postgresql://liuli:142857Db%23@pgm-bp12lnfh8924eska.pg.rds.aliyuncs.com:5432/liuli"
export MCP_PUBLIC_BASE_URL="http://115.29.176.240:8000"
export MCP_OAUTH_ENABLED="${MCP_OAUTH_ENABLED:-true}"
export MCP_OAUTH_ISSUER_URL="https://115-29-176-240.sslip.io/mcp"
export MCP_OAUTH_RESOURCE_URL="https://115-29-176-240.sslip.io/mcp"
export MCP_OAUTH_ACCESS_TOKEN_MINUTES="15"
export MCP_OAUTH_REFRESH_TOKEN_DAYS="30"
export MCP_OAUTH_MASTER_KEY_FILE="/var/lib/liuli-mcp-oauth/master.key"

PATH="/home/liuli-v2/.venv/bin:$PATH" ./start.sh
