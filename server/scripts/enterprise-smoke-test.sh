#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-EnterprisePass123!}"
RUN_ID="${RUN_ID:-$(date +%s)}"

HTTP_STATUS=""
HTTP_BODY=""

log() {
  printf '[enterprise-smoke-test] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage:
  ./server/scripts/enterprise-smoke-test.sh [options]

Options:
  --base-url <url>         API base URL (default: http://localhost:3001/api)
  --admin-username <name>  Admin username for login (default: admin)
  --admin-password <pass>  Admin password for login (default: EnterprisePass123!)
  --run-id <value>         Unique suffix to avoid collisions (default: unix timestamp)
  -h, --help               Show help
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
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local token="${4:-}"
  local tmp
  tmp="$(mktemp)"

  local args=(-sS -o "$tmp" -w "%{http_code}" -X "$method" "${BASE_URL}${path}")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi

  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$tmp")"
  rm -f "$tmp"
}

json_get() {
  local json="$1"
  local path="$2"
  node -e '
const obj = JSON.parse(process.argv[1]);
const path = process.argv[2].split(".");
let curr = obj;
for (const segment of path) {
  if (!segment) continue;
  curr = curr?.[segment];
}
if (curr === undefined || curr === null) process.exit(2);
process.stdout.write(String(curr));
' "$json" "$path"
}

assert_status() {
  local expected="$1"
  local context="$2"
  if [[ "$HTTP_STATUS" != "$expected" ]]; then
    log "FAILED: ${context} (expected status ${expected}, got ${HTTP_STATUS})"
    log "Response: ${HTTP_BODY}"
    exit 1
  fi
}

contains_text() {
  local text="$1"
  local needle="$2"
  [[ "$text" == *"$needle"* ]]
}

cleanup() {
  set +e
  if [[ -n "${POLICY_ID:-}" ]]; then
    request "DELETE" "/admin/usage-policies/${POLICY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${TEAM_ID:-}" ]]; then
    request "DELETE" "/admin/teams/${TEAM_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${WORKSPACE_ID:-}" ]]; then
    request "DELETE" "/admin/workspaces/${WORKSPACE_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${USER_ID:-}" ]]; then
    request "DELETE" "/admin/user/${USER_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  set -e
}

trap cleanup EXIT

TEAM_NAME="qa-team-${RUN_ID}"
WORKSPACE_NAME="qa-workspace-${RUN_ID}"
USER_NAME="qa-user-${RUN_ID}"

log "Checking API reachability at ${BASE_URL}"
request "GET" "/ping"
assert_status "200" "ping healthcheck"

log "Logging in as admin user"
request "POST" "/request-token" "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}"
assert_status "200" "admin login request"
ADMIN_TOKEN="$(json_get "$HTTP_BODY" "token")"

log "Creating smoke-test default user"
request "POST" "/admin/users/new" "{\"username\":\"${USER_NAME}\",\"password\":\"TeamUser123!\",\"role\":\"default\"}" "${ADMIN_TOKEN}"
assert_status "200" "create default user"
USER_ID="$(json_get "$HTTP_BODY" "user.id")"

log "Creating workspace for team access check"
request "POST" "/admin/workspaces/new" "{\"name\":\"${WORKSPACE_NAME}\"}" "${ADMIN_TOKEN}"
assert_status "200" "create workspace"
WORKSPACE_ID="$(json_get "$HTTP_BODY" "workspace.id")"
WORKSPACE_SLUG="$(json_get "$HTTP_BODY" "workspace.slug")"

log "Creating team with mapped user and workspace"
request "POST" "/admin/teams/new" "{\"name\":\"${TEAM_NAME}\",\"members\":[{\"userId\":${USER_ID},\"role\":\"member\"}],\"workspaceIds\":[${WORKSPACE_ID}]}" "${ADMIN_TOKEN}"
assert_status "200" "create team"
TEAM_ID="$(json_get "$HTTP_BODY" "team.id")"

log "Logging in as default team user and checking workspace visibility"
request "POST" "/request-token" "{\"username\":\"${USER_NAME}\",\"password\":\"TeamUser123!\"}"
assert_status "200" "team user login"
TEAM_USER_TOKEN="$(json_get "$HTTP_BODY" "token")"
request "GET" "/workspaces" "" "${TEAM_USER_TOKEN}"
assert_status "200" "team user workspace listing"
if ! contains_text "$HTTP_BODY" "$WORKSPACE_SLUG"; then
  log "FAILED: team user does not see team-mapped workspace."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Creating strict prompt-length usage policy"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-strict-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":50,\"rules\":{\"maxPromptLength\":10}}" "${ADMIN_TOKEN}"
assert_status "200" "create strict usage policy"
POLICY_ID="$(json_get "$HTTP_BODY" "policy.id")"

log "Creating workspace:chat scoped API key"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-chat-key-${RUN_ID}\",\"scopes\":[\"workspace:chat\"],\"expiresAt\":\"2030-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "create scoped chat key"
CHAT_KEY="$(json_get "$HTTP_BODY" "apiKey.secret")"

log "Asserting strict policy blocks long chat prompts"
request "POST" "/v1/workspace/${WORKSPACE_SLUG}/chat" "{\"message\":\"this prompt is intentionally too long\",\"mode\":\"chat\"}" "${CHAT_KEY}"
assert_status "403" "policy-based chat block"
if ! contains_text "$HTTP_BODY" "Prompt length exceeds policy limit"; then
  log "FAILED: policy block response missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Creating admin read-only API key"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-admin-read-${RUN_ID}\",\"scopes\":[\"admin:read\"],\"expiresAt\":\"2030-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "create admin read-only key"
ADMIN_READ_KEY="$(json_get "$HTTP_BODY" "apiKey.secret")"

log "Verifying admin:read key can read teams"
request "GET" "/v1/admin/teams" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key teams list"

log "Verifying admin:read key cannot perform admin write"
request "POST" "/v1/admin/teams/new" "{\"name\":\"qa-should-fail-${RUN_ID}\"}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on team create"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Smoke test completed successfully."
