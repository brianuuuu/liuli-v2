#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly CADDYFILE="/etc/caddy/Caddyfile"
readonly STATE_DIR="/var/lib/liuli-caddy-mcp"
readonly ORIGINAL_CADDYFILE="$STATE_DIR/Caddyfile.original"
readonly BEGIN_MARKER="# BEGIN LIULI MCP HTTPS - MANAGED"
readonly END_MARKER="# END LIULI MCP HTTPS - MANAGED"

PRE_RESTORE_CADDYFILE=""
TEMP_DIR=""
RESTORE_INSTALLED=0

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  if [[ "${RESTORE_INSTALLED:-0}" -eq 1 ]]; then
    recover_after_error 1
  fi
  exit 1
}

recover_after_error() {
  local exit_code="${1:-$?}"
  trap - ERR
  if [[ "$RESTORE_INSTALLED" -eq 1 && -n "$PRE_RESTORE_CADDYFILE" && -f "$PRE_RESTORE_CADDYFILE" ]]; then
    warn "Restoration failed after replacing the Caddyfile; reinstalling the pre-restore configuration."
    install -o root -g root -m 0644 "$PRE_RESTORE_CADDYFILE" "$CADDYFILE"
    if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
      systemctl reload caddy || warn "Caddy reload failed while recovering the pre-restore configuration."
    else
      warn "The pre-restore Caddyfile could not be validated during recovery."
    fi
  fi
  exit "$exit_code"
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

trap recover_after_error ERR
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

check_prerequisites() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run this script as root."
  for command_name in caddy systemctl awk grep cp install mktemp rm date chmod; do
    require_command "$command_name"
  done

  [[ -f "$CADDYFILE" ]] || die "Caddyfile not found: $CADDYFILE"
  [[ -f "$ORIGINAL_CADDYFILE" ]] || die "Original Caddyfile backup not found: $ORIGINAL_CADDYFILE"
  systemctl cat caddy >/dev/null 2>&1 || die "The caddy systemd service was not found."
}

main() {
  check_prerequisites
  TEMP_DIR="$(mktemp -d)"

  PRE_RESTORE_CADDYFILE="$STATE_DIR/Caddyfile.pre-restore.$(date +%Y%m%d-%H%M%S).$$"
  cp --preserve=all -- "$CADDYFILE" "$PRE_RESTORE_CADDYFILE"
  chmod 0600 "$PRE_RESTORE_CADDYFILE"
  log "Saved the pre-restore Caddyfile to $PRE_RESTORE_CADDYFILE."

  local restored_candidate="$TEMP_DIR/Caddyfile.restored-candidate"
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
  ' "$CADDYFILE" > "$restored_candidate" || die "The managed marker block is malformed; refusing to alter the Caddyfile."

  caddy validate --config "$restored_candidate" --adapter caddyfile
  install -o root -g root -m 0644 "$restored_candidate" "$CADDYFILE"
  RESTORE_INSTALLED=1
  caddy validate --config "$CADDYFILE" --adapter caddyfile
  systemctl reload caddy
  systemctl is-active --quiet caddy

  if grep -Fq "$BEGIN_MARKER" "$CADDYFILE" || grep -Fq "$END_MARKER" "$CADDYFILE"; then
    die "Managed markers are still present after restoration."
  fi
  RESTORE_INSTALLED=0
  printf '\n[SUCCESS] The managed Liuli MCP HTTPS block was removed and Caddy is active.\n'
  printf 'Pre-restore safety copy: %s\n' "$PRE_RESTORE_CADDYFILE"
  printf 'Any Caddy configuration outside the managed block was preserved.\n'
  printf 'Liuli services and ports 8000, 5173, and 5174 were not changed.\n'
}

main "$@"
