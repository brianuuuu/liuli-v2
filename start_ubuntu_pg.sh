#!/usr/bin/env bash

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOT"

# Password contains "#", so it must be URL-encoded as "%23" in DATABASE_URL.
export DATABASE_URL="postgresql://liuli:142857Db%23@pgm-bp12lnfh8924eska.pg.rds.aliyuncs.com:5432/liuli"

PATH="/home/liuli-v2/.venv/bin:$PATH" ./start.sh
