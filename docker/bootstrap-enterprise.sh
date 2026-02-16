#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-me-now-1234}"
SINGLE_USER_AUTH_TOKEN="${SINGLE_USER_AUTH_TOKEN:-}"
MAX_RETRIES="${MAX_RETRIES:-60}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"
AUTH_HEADER_ARGS=()

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
  --single-user-token <pass> Single-user AUTH_TOKEN password (required when AUTH_TOKEN/JWT_SECRET are set)
  --max-retries <n>          Max readiness retries (default: 60)
  --sleep-seconds <n>        Seconds between retries (default: 2)
  -h, --help                 Show this help text

Environment variables:
  BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, SINGLE_USER_AUTH_TOKEN, MAX_RETRIES, SLEEP_SECONDS
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
    --single-user-token)
      SINGLE_USER_AUTH_TOKEN="$2"
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

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

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
  payload="$(printf '{"username":"%s","password":"%s"}' \
    "$(json_escape "$ADMIN_USERNAME")" \
    "$(json_escape "$ADMIN_PASSWORD")")"
  response="$(curl -fsS -X POST "${BASE_URL}/api/system/enable-multi-user" \
    "${AUTH_HEADER_ARGS[@]}" \
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
  if [[ -z "$SINGLE_USER_AUTH_TOKEN" && "$response" == *"No auth token found."* ]]; then
    log "Hint: pass --single-user-token or set SINGLE_USER_AUTH_TOKEN when AUTH_TOKEN is configured."
  fi
  return 1
}

request_single_user_session() {
  if [[ -z "$SINGLE_USER_AUTH_TOKEN" ]]; then
    return 0
  fi

  log "Requesting single-user session token for bootstrap."

  local payload response session_token
  payload="$(printf '{"password":"%s"}' "$(json_escape "$SINGLE_USER_AUTH_TOKEN")")"
  response="$(curl -sS -X POST "${BASE_URL}/api/request-token" \
    -H "Content-Type: application/json" \
    -d "$payload" || true)"

  if [[ -z "$response" ]]; then
    log "No response from /api/request-token"
    return 1
  fi

  if [[ "$response" != *'"valid":true'* ]]; then
    log "Failed acquiring single-user session token. Response: $response"
    return 1
  fi

  session_token="$(printf '%s' "$response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  if [[ -z "$session_token" ]]; then
    log "Token response was valid but no token was found. Response: $response"
    return 1
  fi

  AUTH_HEADER_ARGS=(-H "Authorization: Bearer ${session_token}")
  log "Single-user session token acquired."
  return 0
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

  request_single_user_session
  enable_multi_user
  log "Bootstrap complete."
}

main "$@"

