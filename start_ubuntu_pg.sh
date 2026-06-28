#!/usr/bin/env bash

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOT"

# Password contains "#", so it must be URL-encoded as "%23" in DATABASE_URL.
export DATABASE_URL="postgresql://liuli:142857Db%23@pgm-bp12lnfh8924eska.pg.rds.aliyuncs.com:5432/liuli"
export MCP_PUBLIC_BASE_URL="http://115.29.176.240:8000"

PATH="/home/liuli-v2/.venv/bin:$PATH" ./start.sh
