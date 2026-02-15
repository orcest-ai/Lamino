#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-me-now-1234}"
MAX_RETRIES="${MAX_RETRIES:-60}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"

log() {
  printf '[bootstrap-enterprise] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage:
  ./bootstrap-enterprise.sh [options]

Options:
  --base-url <url>           AnythingLLM base URL (default: http://localhost:3001)
  --admin-username <name>    Initial multi-user admin username
  --admin-password <pass>    Initial multi-user admin password
  --max-retries <n>          Max readiness retries (default: 60)
  --sleep-seconds <n>        Seconds between retries (default: 2)
  -h, --help                 Show this help text

Environment variables:
  BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, MAX_RETRIES, SLEEP_SECONDS
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --admin-username)
      ADMIN_USERNAME="$2"
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD="$2"
      shift 2
      ;;
    --max-retries)
      MAX_RETRIES="$2"
      shift 2
      ;;
    --sleep-seconds)
      SLEEP_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

wait_for_api() {
  local attempt=1
  while [[ "$attempt" -le "$MAX_RETRIES" ]]; do
    if curl -fsS "${BASE_URL}/api/ping" >/dev/null 2>&1; then
      log "API is reachable at ${BASE_URL}"
      return 0
    fi
    log "Waiting for API (${attempt}/${MAX_RETRIES})..."
    sleep "${SLEEP_SECONDS}"
    attempt=$((attempt + 1))
  done

  log "API did not become healthy in time."
  return 1
}

is_multi_user_enabled() {
  local response
  response="$(curl -fsS "${BASE_URL}/api/system/multi-user-mode" || true)"
  if [[ -z "$response" ]]; then
    echo "false"
    return
  fi
  if [[ "$response" == *'"multiUserMode":true'* ]]; then
    echo "true"
  else
    echo "false"
  fi
}

enable_multi_user() {
  local payload response
  payload="$(printf '{"username":"%s","password":"%s"}' "$ADMIN_USERNAME" "$ADMIN_PASSWORD")"
  response="$(curl -fsS -X POST "${BASE_URL}/api/system/enable-multi-user" \
    -H "Content-Type: application/json" \
    -d "$payload" || true)"

  if [[ -z "$response" ]]; then
    log "No response from /api/system/enable-multi-user"
    return 1
  fi

  if [[ "$response" == *'"success":true'* ]]; then
    log "Multi-user mode enabled and admin account created."
    return 0
  fi

  if [[ "$response" == *"already enabled"* ]]; then
    log "Multi-user mode was already enabled."
    return 0
  fi

  log "Failed enabling multi-user mode. Response: $response"
  return 1
}

main() {
  log "Starting enterprise bootstrap."
  wait_for_api

  if [[ "$(is_multi_user_enabled)" == "true" ]]; then
    log "Multi-user mode already enabled. Nothing to do."
    return 0
  fi

  if [[ "$ADMIN_PASSWORD" == "change-me-now-1234" ]]; then
    log "WARNING: You are using the default bootstrap password."
  fi

  enable_multi_user
  log "Bootstrap complete."
}

main "$@"

