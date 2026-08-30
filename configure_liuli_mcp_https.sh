#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly PROJECT_ROOT="/home/liuli-v2"
readonly CADDYFILE="/etc/caddy/Caddyfile"
readonly STATE_DIR="/var/lib/liuli-caddy-mcp"
readonly ORIGINAL_CADDYFILE="$STATE_DIR/Caddyfile.original"
readonly PUBLIC_IP="115.29.176.240"
readonly PUBLIC_HOST="115-29-176-240.sslip.io"
readonly HTTPS_MCP_URL="https://$PUBLIC_HOST/mcp/"
readonly UPSTREAM_MCP_URL="http://127.0.0.1:8000/mcp/"
readonly UPSTREAM_HOST="115.29.176.240:8000"
readonly UPSTREAM_ORIGIN="http://115.29.176.240:8000"
readonly BEGIN_MARKER="# BEGIN LIULI MCP HTTPS - MANAGED"
readonly END_MARKER="# END LIULI MCP HTTPS - MANAGED"

TEMP_DIR=""
PRE_RUN_CADDYFILE=""
CONFIG_INSTALLED=0
MCP_BEARER_TOKEN=""

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  if [[ "${CONFIG_INSTALLED:-0}" -eq 1 ]]; then
    restore_after_error 1
  fi
  exit 1
}

cleanup() {
  MCP_BEARER_TOKEN=""
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

restore_after_error() {
  local exit_code="${1:-$?}"
  trap - ERR
  if [[ "$CONFIG_INSTALLED" -eq 1 && -n "$PRE_RUN_CADDYFILE" && -f "$PRE_RUN_CADDYFILE" ]]; then
    warn "Configuration failed after installing the candidate; restoring the pre-run Caddyfile."
    install -o root -g root -m 0644 "$PRE_RUN_CADDYFILE" "$CADDYFILE"
    if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
      systemctl reload caddy || warn "Automatic Caddy reload after restoration failed; inspect systemctl status caddy."
    else
      warn "The pre-run Caddyfile could not be validated after restoration."
    fi
  fi
  exit "$exit_code"
}

trap cleanup EXIT
trap restore_after_error ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run this script as root."
}

check_prerequisites() {
  require_root
  for command_name in caddy systemctl curl getent awk grep mktemp cp install python3 sort seq sleep date chmod rm cat; do
    require_command "$command_name"
  done

  [[ -d "$PROJECT_ROOT" ]] || die "Project directory not found: $PROJECT_ROOT"
  [[ -f "$CADDYFILE" ]] || die "Caddyfile not found: $CADDYFILE"
  systemctl cat caddy >/dev/null 2>&1 || die "The caddy systemd service was not found."
  systemctl is-active --quiet caddy || die "The caddy systemd service is not active."
}

check_dns() {
  local resolved_addresses
  resolved_addresses="$(getent ahostsv4 "$PUBLIC_HOST" | awk '{print $1}' | sort -u || true)"
  [[ -n "$resolved_addresses" ]] || die "DNS lookup failed for $PUBLIC_HOST"
  if ! grep -Fxq "$PUBLIC_IP" <<<"$resolved_addresses"; then
    printf '[ERROR] %s resolved to:\n%s\n' "$PUBLIC_HOST" "$resolved_addresses" >&2
    die "DNS does not include the expected public IP $PUBLIC_IP"
  fi
  log "DNS resolves $PUBLIC_HOST to $PUBLIC_IP."
}

check_upstream() {
  local http_code
  http_code="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --request POST \
      --header 'Accept: application/json, text/event-stream' \
      --header 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
      "$UPSTREAM_MCP_URL" || true
  )"
  case "$http_code" in
    401|403)
      log "The local MCP upstream is reachable and rejects unauthenticated requests ($http_code)."
      ;;
    000|'')
      die "Cannot reach the local MCP upstream at $UPSTREAM_MCP_URL"
      ;;
    *)
      die "Unexpected unauthenticated response from $UPSTREAM_MCP_URL: HTTP $http_code"
      ;;
  esac
}

prepare_state() {
  install -d -o root -g root -m 0700 "$STATE_DIR"

  if [[ ! -f "$ORIGINAL_CADDYFILE" ]]; then
    if grep -Fq "$BEGIN_MARKER" "$CADDYFILE" || grep -Fq "$END_MARKER" "$CADDYFILE"; then
      die "Managed markers exist but $ORIGINAL_CADDYFILE is missing; refusing to overwrite the rollback baseline."
    fi
    cp --preserve=all -- "$CADDYFILE" "$ORIGINAL_CADDYFILE"
    chmod 0600 "$ORIGINAL_CADDYFILE"
    log "Saved the original Caddyfile to $ORIGINAL_CADDYFILE."
  else
    log "Keeping the existing original backup at $ORIGINAL_CADDYFILE."
  fi

  PRE_RUN_CADDYFILE="$STATE_DIR/Caddyfile.pre-run.$(date +%Y%m%d-%H%M%S).$$"
  cp --preserve=all -- "$CADDYFILE" "$PRE_RUN_CADDYFILE"
  chmod 0600 "$PRE_RUN_CADDYFILE"
}

write_candidate() {
  local stripped_caddyfile="$TEMP_DIR/Caddyfile.stripped"
  local candidate_caddyfile="$TEMP_DIR/Caddyfile.candidate"

  awk -v begin_marker="$BEGIN_MARKER" -v end_marker="$END_MARKER" '
    $0 == begin_marker {
      if (inside) exit 42
      inside = 1
      found_begin++
      next
    }
    $0 == end_marker {
      if (!inside) exit 43
      inside = 0
      found_end++
      next
    }
    !inside { print }
    END {
      if (inside || found_begin != found_end || found_begin > 1) exit 44
    }
  ' "$CADDYFILE" > "$stripped_caddyfile" || die "The existing managed marker block is malformed."

  printf '%s\n' "$BEGIN_MARKER" > "$candidate_caddyfile"
  cat >> "$candidate_caddyfile" <<CADDY_CONFIG
{
	auto_https disable_redirects
}

https://$PUBLIC_HOST {
	@liuli_mcp path /mcp /mcp/*

	handle @liuli_mcp {
		reverse_proxy 127.0.0.1:8000 {
			header_up Host $UPSTREAM_HOST
			header_up Origin $UPSTREAM_ORIGIN
			header_up Authorization "Bearer $MCP_BEARER_TOKEN"
		}
	}

	handle {
		respond "Not Found" 404
	}
}
CADDY_CONFIG
  printf '%s\n\n' "$END_MARKER" >> "$candidate_caddyfile"
  cat -- "$stripped_caddyfile" >> "$candidate_caddyfile"

  caddy validate --config "$candidate_caddyfile" --adapter caddyfile
  install -o root -g root -m 0644 "$candidate_caddyfile" "$CADDYFILE"
  CONFIG_INSTALLED=1
  caddy validate --config "$CADDYFILE" --adapter caddyfile
  systemctl reload caddy
  systemctl is-active --quiet caddy
  log "Caddy accepted and reloaded the managed MCP HTTPS configuration."
}

read_bearer_token() {
  if [[ -n "${LIULI_MCP_VERIFY_TOKEN:-}" ]]; then
    MCP_BEARER_TOKEN="$LIULI_MCP_VERIFY_TOKEN"
  elif [[ -t 0 ]]; then
    printf 'Enter the existing MCP Bearer Token for the public HTTPS gateway: ' >&2
    IFS= read -r -s MCP_BEARER_TOKEN
    printf '\n' >&2
  else
    die "No interactive terminal is available. Set LIULI_MCP_VERIFY_TOKEN before running this script."
  fi
  [[ -n "$MCP_BEARER_TOKEN" ]] || die "The MCP Bearer Token cannot be empty."
}

check_public_https() {
  local response_file="$TEMP_DIR/mcp-initialize.json"
  local attempt http_code=""
  for attempt in $(seq 1 20); do
  http_code="$(
    curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
      --resolve "$PUBLIC_HOST:443:127.0.0.1" \
      --request POST \
      --header 'Accept: application/json, text/event-stream' \
      --header 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"caddy-verifier","version":"1"}}}' \
      "$HTTPS_MCP_URL" 2>/dev/null || true
  )"
    [[ "$http_code" == "200" ]] && break
    sleep 2
  done
  [[ "$http_code" == "200" ]] || die "Public HTTPS MCP initialization failed; last HTTP code: ${http_code:-none}"
  python3 - "$response_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

name = payload.get("result", {}).get("serverInfo", {}).get("name")
if name != "liuli":
    raise SystemExit(f"unexpected MCP serverInfo.name: {name!r}")
PY
  log "Public HTTPS MCP initialization succeeded and identified serverInfo.name=liuli."
}

main() {
  check_prerequisites
  TEMP_DIR="$(mktemp -d)"
  check_dns
  check_upstream
  read_bearer_token
  prepare_state
  write_candidate
  check_public_https
  CONFIG_INSTALLED=0

  printf '\n[LOCAL SUCCESS] The server-side Caddy and MCP checks passed.\n'
  printf 'ChatGPT URL: %s\n' "$HTTPS_MCP_URL"
  printf 'ChatGPT authentication: None (Caddy supplies the existing Bearer Token upstream).\n'
  printf 'Existing Codex HTTP URL remains unchanged: http://%s/mcp/\n' "$UPSTREAM_HOST"
  printf '\nExternal verification command:\n'
  printf "  curl -i -X POST -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}' %s\n" "$HTTPS_MCP_URL"
  printf 'Expected result: HTTP 200. Configure ChatGPT with authentication set to None, then run Scan Tools.\n'
  printf 'Rollback command: %s/restore_liuli_mcp_https.sh\n' "$PROJECT_ROOT"
}

main "$@"
