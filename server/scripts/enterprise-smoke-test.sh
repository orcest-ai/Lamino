#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-EnterprisePass123!}"
RUN_ID="${RUN_ID:-$(date +%s)}"

HTTP_STATUS=""
HTTP_BODY=""
ADMIN_TOKEN=""

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

json_get_or_empty() {
  local json="$1"
  local path="$2"
  node -e '
try {
  const obj = JSON.parse(process.argv[1]);
  const path = process.argv[2].split(".");
  let curr = obj;
  for (const segment of path) {
    if (!segment) continue;
    curr = curr?.[segment];
  }
  if (curr === undefined || curr === null) process.exit(2);
  process.stdout.write(String(curr));
} catch {
  process.exit(2);
}
' "$json" "$path" 2>/dev/null || true
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

assert_status_any() {
  local context="$1"
  shift
  local expected
  for expected in "$@"; do
    if [[ "$HTTP_STATUS" == "$expected" ]]; then
      return 0
    fi
  done
  log "FAILED: ${context} (expected one of: $*, got ${HTTP_STATUS})"
  log "Response: ${HTTP_BODY}"
  exit 1
}

contains_text() {
  local text="$1"
  local needle="$2"
  [[ "$text" == *"$needle"* ]]
}

cleanup() {
  set +e
  if [[ -n "${ADMIN_TOKEN:-}" ]]; then
    request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"enabled\",\"enterprise_usage_monitoring\":\"enabled\",\"enterprise_usage_policies\":\"enabled\"}" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${MANAGER_TEAM_ID:-}" ]]; then
    request "DELETE" "/admin/teams/${MANAGER_TEAM_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${ADMIN_READ_KEY_ID:-}" ]]; then
    request "DELETE" "/admin/delete-api-key/${ADMIN_READ_KEY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${CHAT_KEY_ID:-}" ]]; then
    request "DELETE" "/admin/delete-api-key/${CHAT_KEY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
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
  if [[ -n "${MANAGER_USER_ID:-}" ]]; then
    request "DELETE" "/admin/user/${MANAGER_USER_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  set -e
}

trap cleanup EXIT

TEAM_NAME="qa-team-${RUN_ID}"
MANAGER_TEAM_NAME="qa-manager-team-${RUN_ID}"
WORKSPACE_NAME="qa-workspace-${RUN_ID}"
USER_NAME="qa-user-${RUN_ID}"
MANAGER_USER_NAME="qa-manager-${RUN_ID}"

log "Checking API reachability at ${BASE_URL}"
request "GET" "/ping"
assert_status "200" "ping healthcheck"

log "Logging in as admin user"
request "POST" "/request-token" "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}"
assert_status "200" "admin login request"
ADMIN_TOKEN="$(json_get_or_empty "$HTTP_BODY" "token")"

if [[ -z "$ADMIN_TOKEN" ]]; then
  log "Admin login unavailable, attempting multi-user bootstrap"
  request "POST" "/system/enable-multi-user" "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}"
  if [[ "$HTTP_STATUS" != "200" && "$HTTP_STATUS" != "400" ]]; then
    log "FAILED: bootstrap multi-user mode (${HTTP_STATUS})"
    log "Response: ${HTTP_BODY}"
    exit 1
  fi

  request "POST" "/request-token" "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}"
  assert_status "200" "admin login after bootstrap"
  ADMIN_TOKEN="$(json_get_or_empty "$HTTP_BODY" "token")"
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  log "FAILED: unable to obtain admin token."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Creating smoke-test default user"
request "POST" "/admin/users/new" "{\"username\":\"${USER_NAME}\",\"password\":\"TeamUser123!\",\"role\":\"default\"}" "${ADMIN_TOKEN}"
assert_status "200" "create default user"
USER_ID="$(json_get "$HTTP_BODY" "user.id")"

log "Creating smoke-test manager user"
request "POST" "/admin/users/new" "{\"username\":\"${MANAGER_USER_NAME}\",\"password\":\"ManagerUser123!\",\"role\":\"manager\"}" "${ADMIN_TOKEN}"
assert_status "200" "create manager user"
MANAGER_USER_ID="$(json_get "$HTTP_BODY" "user.id")"

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

log "Asserting default users cannot access team admin routes"
request "GET" "/admin/teams" "" "${TEAM_USER_TOKEN}"
assert_status_any "default user denied team admin list" "401" "403"

log "Logging in as manager and validating team admin access"
request "POST" "/request-token" "{\"username\":\"${MANAGER_USER_NAME}\",\"password\":\"ManagerUser123!\"}"
assert_status "200" "manager login"
MANAGER_TOKEN="$(json_get "$HTTP_BODY" "token")"
request "GET" "/admin/teams" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can list teams"
if ! contains_text "$HTTP_BODY" "$TEAM_NAME"; then
  log "FAILED: manager team list did not include expected team."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "POST" "/admin/teams/new" "{\"name\":\"${MANAGER_TEAM_NAME}\"}" "${MANAGER_TOKEN}"
assert_status "200" "manager can create team"
MANAGER_TEAM_ID="$(json_get "$HTTP_BODY" "team.id")"

log "Verifying team feature gate denies team routes when disabled"
request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_teams flag"
request "GET" "/admin/teams" "" "${ADMIN_TOKEN}"
assert_status "403" "team list blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_teams"; then
  log "FAILED: disabled feature response missing enterprise_teams marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_teams flag"
request "GET" "/admin/teams" "" "${ADMIN_TOKEN}"
assert_status "200" "team list restored when feature enabled"

log "Verifying usage monitoring feature gate denies overview route when disabled"
request "POST" "/admin/system-preferences" "{\"enterprise_usage_monitoring\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_usage_monitoring flag"
request "GET" "/admin/usage/overview" "" "${ADMIN_TOKEN}"
assert_status "403" "usage overview blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_monitoring"; then
  log "FAILED: disabled feature response missing enterprise_usage_monitoring marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_usage_monitoring\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_usage_monitoring flag"
request "GET" "/admin/usage/overview" "" "${ADMIN_TOKEN}"
assert_status "200" "usage overview restored when feature enabled"
if ! contains_text "$HTTP_BODY" "summary"; then
  log "FAILED: usage overview response missing summary payload."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying usage policy feature gate denies policy routes when disabled"
request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_usage_policies flag"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-blocked-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":99,\"rules\":{\"maxPromptLength\":9}}" "${ADMIN_TOKEN}"
assert_status "403" "usage policy create blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_policies"; then
  log "FAILED: disabled feature response missing enterprise_usage_policies marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_usage_policies flag"

log "Creating strict prompt-length usage policy"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-strict-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":50,\"rules\":{\"maxPromptLength\":10}}" "${ADMIN_TOKEN}"
assert_status "200" "create strict usage policy"
POLICY_ID="$(json_get "$HTTP_BODY" "policy.id")"

log "Creating workspace:chat scoped API key"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-chat-key-${RUN_ID}\",\"scopes\":[\"workspace:chat\"],\"expiresAt\":\"2030-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "create scoped chat key"
CHAT_KEY="$(json_get "$HTTP_BODY" "apiKey.secret")"
CHAT_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"

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
ADMIN_READ_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"

log "Verifying admin:read key can read teams"
request "GET" "/v1/admin/teams" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key teams list"

request "GET" "/v1/admin/usage/overview" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage overview"

log "Verifying admin:read key can fetch team detail endpoints"
request "GET" "/v1/admin/teams/${TEAM_ID}" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key team detail"
if ! contains_text "$HTTP_BODY" "$TEAM_NAME"; then
  log "FAILED: team detail did not include expected team name."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/v1/admin/teams/${TEAM_ID}/members" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key team members"

request "GET" "/v1/admin/teams/${TEAM_ID}/workspaces" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key team workspaces"

request "GET" "/v1/admin/teams/${TEAM_ID}/access-map" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key team access-map"

log "Verifying admin:read key cannot perform admin write"
request "POST" "/v1/admin/teams/new" "{\"name\":\"qa-should-fail-${RUN_ID}\"}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on team create"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Smoke test completed successfully."
