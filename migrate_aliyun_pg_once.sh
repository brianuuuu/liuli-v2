#!/usr/bin/env bash

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOT"

export PATH="/home/liuli-v2/.venv/bin:$PATH"

SQLITE_URL="${SQLITE_URL:-sqlite:///./var/db/liuli.sqlite3}"
BATCH_SIZE="${BATCH_SIZE:-500}"

# Password contains "#", so it must be URL-encoded as "%23" in DATABASE_URL.
POSTGRES_URL="postgresql://liuli:142857Db%23@pgm-bp12lnfh8924eska.pg.rds.aliyuncs.com:5432/liuli"

if ! command -v python >/dev/null 2>&1; then
  echo "[ERROR] python was not found in PATH. Expected /home/liuli-v2/.venv/bin/python." >&2
  exit 1
fi

if ! python - <<'PY'
import importlib.util
import sys

sys.exit(0 if importlib.util.find_spec("psycopg") else 1)
PY
then
  echo "[INFO] psycopg is missing in the active venv. Installing..."
  python -m pip install "psycopg[binary]>=3.2.0"
fi

echo "[INFO] Running dry-run from $SQLITE_URL to Aliyun PostgreSQL..."
python -m tools.dev.migrate_sqlite_to_postgres \
  --sqlite-url "$SQLITE_URL" \
  --postgres-url "$POSTGRES_URL" \
  --batch-size "$BATCH_SIZE" \
  --dry-run

echo "[INFO] Dry-run completed. Running real migration..."
python -m tools.dev.migrate_sqlite_to_postgres \
  --sqlite-url "$SQLITE_URL" \
  --postgres-url "$POSTGRES_URL" \
  --batch-size "$BATCH_SIZE"

echo "[INFO] Migration finished. PostgreSQL target:"
echo "  host=pgm-bp12lnfh8924eska.pg.rds.aliyuncs.com port=5432 db=liuli user=liuli"
