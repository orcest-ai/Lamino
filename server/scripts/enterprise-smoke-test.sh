#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-EnterprisePass123!}"
SINGLE_USER_AUTH_TOKEN="${SINGLE_USER_AUTH_TOKEN:-${AUTH_TOKEN:-}}"
RUN_ID="${RUN_ID:-$(date +%s)-$RANDOM}"
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

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
  --single-user-token <t>  AUTH token for single-user login verification
  --run-id <value>         Unique suffix to avoid collisions (default: timestamp-random)
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
    --single-user-token)
      SINGLE_USER_AUTH_TOKEN="$2"
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

json_get_json_value() {
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
  if (curr === undefined) process.exit(2);
  process.stdout.write(JSON.stringify(curr));
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

assert_max_length() {
  local label="$1"
  local value="$2"
  local max_len="$3"
  if (( ${#value} > max_len )); then
    log "FAILED: ${label} exceeds max length ${max_len} (got ${#value})."
    log "Value: ${value}"
    exit 1
  fi
}

assert_username_shape() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z][a-z0-9._-]*$ ]]; then
    log "FAILED: ${label} is not a valid normalized username."
    log "Value: ${value}"
    exit 1
  fi
}

json_quote() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""));' "$1"
}

compose_name() {
  local prefix="$1"
  local max_len="$2"
  local suffix="$3"
  if [[ "${#prefix}" -ge "$max_len" ]]; then
    printf '%s' "${prefix:0:${max_len}}"
    return 0
  fi
  local available=$((max_len - ${#prefix}))
  local normalized_suffix="${suffix:0:${available}}"
  printf '%s%s' "$prefix" "$normalized_suffix"
}

normalize_username_seed() {
  local raw="$1"
  local max_len="${2:-24}"
  local sanitized
  sanitized="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9._-' | cut -c1-"$max_len")"
  if [[ -z "$sanitized" || ! "$sanitized" =~ ^[a-z] ]]; then
    sanitized="admin"
  fi
  printf '%s' "$sanitized"
}

inject_usage_event() {
  local workspace_id="$1"
  local user_id="$2"
  local team_id="$3"
  local prompt_tokens="$4"
  local completion_tokens="$5"
  local total_tokens="$6"
  local duration_ms="$7"
  local event_type="${8:-smoke_usage_probe}"

  node -e '
const usageEventsPath = process.argv[1];
const parseId = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const parseIntValue = (raw, fallback = 0) => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const payload = {
  eventType: process.argv[9] || "smoke_usage_probe",
  workspaceId: parseId(process.argv[2]),
  userId: parseId(process.argv[3]),
  teamId: parseId(process.argv[4]),
  provider: "smoke-provider",
  model: "smoke-model",
  mode: "chat",
  promptTokens: parseIntValue(process.argv[5]),
  completionTokens: parseIntValue(process.argv[6]),
  totalTokens: parseIntValue(process.argv[7]),
  durationMs: parseIntValue(process.argv[8], null),
  metadata: { source: "enterprise-smoke-test" },
};
const { UsageEvents } = require(usageEventsPath);
(async () => {
  const { event, error } = await UsageEvents.log(payload);
  if (error || !event?.id) {
    console.error(error || "Failed to create usage probe event.");
    process.exit(1);
  }
  process.stdout.write(String(event.id));
})().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
' \
    "${SERVER_DIR}/models/usageEvents.js" \
    "$workspace_id" \
    "$user_id" \
    "$team_id" \
    "$prompt_tokens" \
    "$completion_tokens" \
    "$total_tokens" \
    "$duration_ms" \
    "$event_type"
}

wait_for_api() {
  local attempts="${1:-30}"
  local delay_seconds="${2:-1}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "${BASE_URL}/ping" >/dev/null 2>&1; then
      HTTP_STATUS="200"
      HTTP_BODY=""
      return 0
    fi
    sleep "$delay_seconds"
  done
  request "GET" "/ping"
  return 1
}

cleanup() {
  set +e
  if [[ -n "${ADMIN_TOKEN:-}" && -n "${ORIGINAL_CUSTOM_APP_NAME_JSON:-}" ]]; then
    request "POST" "/admin/system-preferences" "{\"custom_app_name\":${ORIGINAL_CUSTOM_APP_NAME_JSON}}" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${ADMIN_TOKEN:-}" ]]; then
    request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"enabled\",\"enterprise_prompt_library\":\"enabled\",\"enterprise_usage_monitoring\":\"enabled\",\"enterprise_usage_policies\":\"enabled\"}" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${TEMPLATE_ID:-}" ]]; then
    request "DELETE" "/admin/prompt-templates/${TEMPLATE_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${MANAGER_TEAM_ID:-}" ]]; then
    request "DELETE" "/admin/teams/${MANAGER_TEAM_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${ADMIN_READ_KEY_ID:-}" ]]; then
    request "DELETE" "/admin/delete-api-key/${ADMIN_READ_KEY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${EXPIRED_KEY_ID:-}" ]]; then
    request "DELETE" "/admin/delete-api-key/${EXPIRED_KEY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${CHAT_KEY_ID:-}" ]]; then
    request "DELETE" "/admin/delete-api-key/${CHAT_KEY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${POLICY_ID:-}" ]]; then
    request "DELETE" "/admin/usage-policies/${POLICY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${TOKEN_POLICY_ID:-}" ]]; then
    request "DELETE" "/admin/usage-policies/${TOKEN_POLICY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${CHAT_QUOTA_POLICY_ID:-}" ]]; then
    request "DELETE" "/admin/usage-policies/${CHAT_QUOTA_POLICY_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${TEAM_ID:-}" ]]; then
    request "DELETE" "/admin/teams/${TEAM_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${WORKSPACE_ID:-}" ]]; then
    request "DELETE" "/admin/workspaces/${WORKSPACE_ID}" "" "${ADMIN_TOKEN:-}"
  fi
  if [[ -n "${ISOLATED_WORKSPACE_ID:-}" ]]; then
    request "DELETE" "/admin/workspaces/${ISOLATED_WORKSPACE_ID}" "" "${ADMIN_TOKEN:-}"
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

RUN_SUFFIX="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]' | cut -c1-24)"
if [[ -z "$RUN_SUFFIX" ]]; then
  RUN_SUFFIX="$(date +%s | tr -cd '[:alnum:]' | cut -c1-12)"
fi

TEAM_NAME="$(compose_name "qa-team-" 64 "${RUN_SUFFIX}")"
MANAGER_TEAM_NAME="$(compose_name "qa-manager-team-" 64 "${RUN_SUFFIX}")"
MANAGER_TEAM_UPDATED_NAME="$(compose_name "qa-manager-team-updated-" 64 "${RUN_SUFFIX}")"
WORKSPACE_NAME="$(compose_name "qa-workspace-" 64 "${RUN_SUFFIX}")"
ISOLATED_WORKSPACE_NAME="$(compose_name "qa-isolated-workspace-" 64 "${RUN_SUFFIX}")"
USER_NAME="$(compose_name "qa-user-" 32 "${RUN_SUFFIX}")"
MANAGER_USER_NAME="$(compose_name "qa-manager-" 32 "${RUN_SUFFIX}")"
TEMPLATE_PROMPT="You are $(compose_name "qa-template-" 64 "${RUN_SUFFIX}")."

assert_max_length "TEAM_NAME" "${TEAM_NAME}" 64
assert_max_length "MANAGER_TEAM_NAME" "${MANAGER_TEAM_NAME}" 64
assert_max_length "MANAGER_TEAM_UPDATED_NAME" "${MANAGER_TEAM_UPDATED_NAME}" 64
assert_max_length "WORKSPACE_NAME" "${WORKSPACE_NAME}" 64
assert_max_length "ISOLATED_WORKSPACE_NAME" "${ISOLATED_WORKSPACE_NAME}" 64
assert_max_length "USER_NAME" "${USER_NAME}" 32
assert_max_length "MANAGER_USER_NAME" "${MANAGER_USER_NAME}" 32
assert_username_shape "USER_NAME" "${USER_NAME}"
assert_username_shape "MANAGER_USER_NAME" "${MANAGER_USER_NAME}"

log "Checking API reachability at ${BASE_URL}"
if ! wait_for_api 60 1; then
  log "FAILED: API did not become ready at ${BASE_URL}/ping"
  log "Last status=${HTTP_STATUS} body=${HTTP_BODY}"
  exit 1
fi

request "GET" "/system/multi-user-mode"
assert_status "200" "read multi-user mode setting"
CURRENT_MULTI_USER_MODE="$(json_get_or_empty "$HTTP_BODY" "multiUserMode")"
if [[ "${CURRENT_MULTI_USER_MODE}" == "false" && -n "${SINGLE_USER_AUTH_TOKEN}" ]]; then
  log "Verifying single-user authentication path before bootstrap"
  request "POST" "/request-token" "{\"password\":$(json_quote "invalid-${RUN_ID}")}"
  assert_status "401" "single-user login rejects invalid auth token"
  if ! contains_text "$HTTP_BODY" "Invalid password provided"; then
    log "FAILED: single-user invalid-login response missing expected message."
    log "Response: ${HTTP_BODY}"
    exit 1
  fi

  request "POST" "/request-token" "{\"password\":$(json_quote "${SINGLE_USER_AUTH_TOKEN}")}"
  assert_status "200" "single-user login accepts auth token"
  SINGLE_USER_TOKEN="$(json_get_or_empty "$HTTP_BODY" "token")"
  if [[ -z "${SINGLE_USER_TOKEN}" ]]; then
    log "FAILED: single-user login did not return a token."
    log "Response: ${HTTP_BODY}"
    exit 1
  fi
elif [[ "${CURRENT_MULTI_USER_MODE}" == "false" ]]; then
  log "Single-user auth check skipped (SINGLE_USER_AUTH_TOKEN/AUTH_TOKEN not provided)."
fi

log "Logging in as admin user"
request "POST" "/request-token" "{\"username\":$(json_quote "${ADMIN_USERNAME}"),\"password\":$(json_quote "${ADMIN_PASSWORD}")}"
if [[ "$HTTP_STATUS" == "200" ]]; then
  ADMIN_TOKEN="$(json_get_or_empty "$HTTP_BODY" "token")"
  ADMIN_USER_ID="$(json_get_or_empty "$HTTP_BODY" "user.id")"
  if [[ -z "${ADMIN_USER_ID}" ]]; then
    ADMIN_TOKEN=""
  fi
elif [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "422" ]]; then
  ADMIN_TOKEN=""
else
  log "FAILED: admin login request (unexpected status ${HTTP_STATUS})"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

if [[ -z "${ADMIN_TOKEN}" ]]; then
  if [[ "${CURRENT_MULTI_USER_MODE}" == "true" ]]; then
    log "FAILED: admin login failed while multi-user mode is already enabled."
    log "Ensure ADMIN_USERNAME and ADMIN_PASSWORD are valid for an existing admin account."
    log "Response: ${HTTP_BODY}"
    exit 1
  fi

  log "Admin login unavailable, attempting multi-user bootstrap"
  BOOTSTRAP_USERNAME_SEED="$(normalize_username_seed "${ADMIN_USERNAME}" 24)"
  BOOTSTRAP_USERNAME="${BOOTSTRAP_USERNAME_SEED}"
  assert_max_length "BOOTSTRAP_USERNAME_SEED" "${BOOTSTRAP_USERNAME_SEED}" 24
  assert_username_shape "BOOTSTRAP_USERNAME_SEED" "${BOOTSTRAP_USERNAME_SEED}"
  BOOTSTRAP_RETRY_COUNT=0
  BOOTSTRAP_MAX_RETRIES=6
  while true; do
    request "POST" "/system/enable-multi-user" "{\"username\":$(json_quote "${BOOTSTRAP_USERNAME}"),\"password\":$(json_quote "${ADMIN_PASSWORD}")}"

    if [[ "$HTTP_STATUS" == "200" ]]; then
      break
    fi

    if [[ "$HTTP_STATUS" == "400" ]]; then
      if contains_text "$HTTP_BODY" "already exists"; then
        BOOTSTRAP_RETRY_COUNT=$((BOOTSTRAP_RETRY_COUNT + 1))
        if [[ "${BOOTSTRAP_RETRY_COUNT}" -ge "${BOOTSTRAP_MAX_RETRIES}" ]]; then
          log "FAILED: bootstrap enable-multi-user exhausted username collision retries."
          log "Response: ${HTTP_BODY}"
          exit 1
        fi

        if [[ "${BOOTSTRAP_RETRY_COUNT}" == "1" ]]; then
          BOOTSTRAP_USERNAME="$(compose_name "${BOOTSTRAP_USERNAME_SEED}-" 32 "${RUN_SUFFIX}")"
          assert_max_length "BOOTSTRAP_USERNAME_RETRY" "${BOOTSTRAP_USERNAME}" 32
          assert_username_shape "BOOTSTRAP_USERNAME_RETRY" "${BOOTSTRAP_USERNAME}"
        else
          BOOTSTRAP_FALLBACK_SUFFIX="$(printf '%s' "$(date +%s%N)-$RANDOM-${BOOTSTRAP_RETRY_COUNT}" | tr -cd '[:alnum:]' | cut -c1-12)"
          BOOTSTRAP_USERNAME="$(compose_name "${BOOTSTRAP_USERNAME_SEED}-" 32 "${BOOTSTRAP_FALLBACK_SUFFIX}")"
          assert_max_length "BOOTSTRAP_USERNAME_FALLBACK" "${BOOTSTRAP_USERNAME}" 32
          assert_username_shape "BOOTSTRAP_USERNAME_FALLBACK" "${BOOTSTRAP_USERNAME}"
        fi

        log "Bootstrap username already exists; retrying as ${BOOTSTRAP_USERNAME} (${BOOTSTRAP_RETRY_COUNT}/${BOOTSTRAP_MAX_RETRIES})"
        continue
      fi

      log "FAILED: bootstrap enable-multi-user rejected payload."
      log "Response: ${HTTP_BODY}"
      exit 1
    fi

    log "FAILED: bootstrap multi-user mode (${HTTP_STATUS})"
    log "Response: ${HTTP_BODY}"
    exit 1
  done

  if [[ "$HTTP_STATUS" != "200" ]]; then
    log "FAILED: bootstrap multi-user mode (${HTTP_STATUS})"
    log "Response: ${HTTP_BODY}"
    exit 1
  fi

  ADMIN_USERNAME="${BOOTSTRAP_USERNAME}"
  request "POST" "/request-token" "{\"username\":$(json_quote "${ADMIN_USERNAME}"),\"password\":$(json_quote "${ADMIN_PASSWORD}")}"
  assert_status "200" "admin login after bootstrap"
  ADMIN_TOKEN="$(json_get_or_empty "$HTTP_BODY" "token")"
  ADMIN_USER_ID="$(json_get_or_empty "$HTTP_BODY" "user.id")"
fi

if [[ -z "$ADMIN_TOKEN" || -z "${ADMIN_USER_ID:-}" ]]; then
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

log "Creating isolated workspace to verify access boundaries"
request "POST" "/admin/workspaces/new" "{\"name\":\"${ISOLATED_WORKSPACE_NAME}\"}" "${ADMIN_TOKEN}"
assert_status "200" "create isolated workspace"
ISOLATED_WORKSPACE_ID="$(json_get "$HTTP_BODY" "workspace.id")"
ISOLATED_WORKSPACE_SLUG="$(json_get "$HTTP_BODY" "workspace.slug")"

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
if contains_text "$HTTP_BODY" "$ISOLATED_WORKSPACE_SLUG"; then
  log "FAILED: team user can see workspace not assigned through team/direct mapping."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Asserting default users cannot access team admin routes"
request "GET" "/admin/teams" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team admin list"
request "POST" "/admin/teams/new" "{\"name\":\"qa-default-denied-team-${RUN_ID}\"}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team admin create"
request "GET" "/admin/teams/${TEAM_ID}" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team admin detail reads"
request "GET" "/admin/teams/${TEAM_ID}/members" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team member listing reads"
request "GET" "/admin/teams/${TEAM_ID}/workspaces" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team workspace listing reads"
request "POST" "/admin/teams/${TEAM_ID}/update-members" "{\"members\":[{\"userId\":${USER_ID},\"role\":\"member\"}]}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team member update writes"
request "POST" "/admin/teams/${TEAM_ID}/update-workspaces" "{\"workspaceIds\":[${WORKSPACE_ID}]}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team workspace update writes"
request "POST" "/admin/teams/${TEAM_ID}" "{\"name\":\"qa-default-denied-team-update-${RUN_ID}\"}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team admin update"
request "DELETE" "/admin/teams/${TEAM_ID}" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team admin delete"
request "GET" "/admin/teams/${TEAM_ID}/access-map" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied team access-map reads"
request "GET" "/admin/system-preferences-for?labels=custom_app_name" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied system preference reads"
request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"disabled\"}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied system preference updates"
request "GET" "/admin/api-keys" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied api key listing"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-default-denied-key-${RUN_ID}\",\"scopes\":[\"admin:read\"]}" "${TEAM_USER_TOKEN}"
if [[ "$HTTP_STATUS" == "200" ]]; then
  UNEXPECTED_DEFAULT_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"
  if [[ -n "$UNEXPECTED_DEFAULT_KEY_ID" ]]; then
    API_KEY_IDS+=("$UNEXPECTED_DEFAULT_KEY_ID")
  fi
fi
assert_status "401" "default user denied api key creation"

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
request "GET" "/admin/teams/${TEAM_ID}" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can read team detail"
if ! contains_text "$HTTP_BODY" "$TEAM_NAME"; then
  log "FAILED: manager team detail did not include expected team name."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/teams/${TEAM_ID}/members" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can read team members"
if ! contains_text "$HTTP_BODY" "\"userId\":${USER_ID}"; then
  log "FAILED: manager team members response missing expected default user assignment."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/teams/${TEAM_ID}/workspaces" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can read team workspaces"
if ! contains_text "$HTTP_BODY" "\"workspaceId\":${WORKSPACE_ID}"; then
  log "FAILED: manager team workspaces response missing expected workspace assignment."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/teams/${TEAM_ID}/update-members" "{\"members\":[{\"userId\":${USER_ID},\"role\":\"member\"}]}" "${MANAGER_TOKEN}"
assert_status "200" "manager can update team members"
request "GET" "/admin/teams/${TEAM_ID}/members" "" "${MANAGER_TOKEN}"
assert_status "200" "manager member updates persisted"
if ! contains_text "$HTTP_BODY" "\"userId\":${USER_ID}"; then
  log "FAILED: manager team member update did not persist expected default user assignment."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/teams/${TEAM_ID}/update-workspaces" "{\"workspaceIds\":[${WORKSPACE_ID}]}" "${MANAGER_TOKEN}"
assert_status "200" "manager can update team workspaces"
request "GET" "/admin/teams/${TEAM_ID}/workspaces" "" "${MANAGER_TOKEN}"
assert_status "200" "manager workspace updates persisted"
if ! contains_text "$HTTP_BODY" "\"workspaceId\":${WORKSPACE_ID}"; then
  log "FAILED: manager team workspace update did not persist expected workspace assignment."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/teams/${TEAM_ID}/access-map" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can read team access map"
if ! contains_text "$HTTP_BODY" "\"teamId\":${TEAM_ID}" || ! contains_text "$HTTP_BODY" "\"workspaceId\":${WORKSPACE_ID}"; then
  log "FAILED: manager team access map response missing expected team/workspace linkage."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/api-keys" "" "${MANAGER_TOKEN}"
assert_status "401" "manager denied admin api key listing"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-manager-denied-key-${RUN_ID}\",\"scopes\":[\"admin:read\"]}" "${MANAGER_TOKEN}"
if [[ "$HTTP_STATUS" == "200" ]]; then
  UNEXPECTED_MANAGER_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"
  if [[ -n "$UNEXPECTED_MANAGER_KEY_ID" ]]; then
    API_KEY_IDS+=("$UNEXPECTED_MANAGER_KEY_ID")
  fi
fi
assert_status "401" "manager denied admin api key creation"

request "POST" "/admin/teams/new" "{\"name\":\"${MANAGER_TEAM_NAME}\"}" "${MANAGER_TOKEN}"
assert_status "200" "manager can create team"
MANAGER_TEAM_ID="$(json_get "$HTTP_BODY" "team.id")"
request "POST" "/admin/teams/${MANAGER_TEAM_ID}" "{\"name\":\"${MANAGER_TEAM_UPDATED_NAME}\"}" "${MANAGER_TOKEN}"
assert_status "200" "manager can update team"
MANAGER_UPDATED_TEAM_NAME="$(json_get_or_empty "$HTTP_BODY" "team.name")"
if [[ "${MANAGER_UPDATED_TEAM_NAME}" != "${MANAGER_TEAM_UPDATED_NAME}" ]]; then
  log "FAILED: manager team update did not persist expected name."
  log "Expected: ${MANAGER_TEAM_UPDATED_NAME} | Actual: ${MANAGER_UPDATED_TEAM_NAME}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/system-preferences-for?labels=custom_app_name" "" "${MANAGER_TOKEN}"
assert_status "200" "manager can read system preferences"

request "GET" "/admin/system-preferences-for?labels=custom_app_name" "" "${ADMIN_TOKEN}"
assert_status "200" "load current custom app name for manager preference test"
ORIGINAL_CUSTOM_APP_NAME_JSON="$(json_get_json_value "$HTTP_BODY" "settings.custom_app_name")"
if [[ -z "${ORIGINAL_CUSTOM_APP_NAME_JSON}" ]]; then
  ORIGINAL_CUSTOM_APP_NAME_JSON="null"
fi
request "GET" "/admin/system-preferences-for?labels=feature_flags" "" "${ADMIN_TOKEN}"
assert_status "200" "capture baseline feature flags before manager denial checks"
BASELINE_ENTERPRISE_TEAMS_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_teams")"
BASELINE_ENTERPRISE_PROMPT_LIBRARY_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_prompt_library")"
BASELINE_ENTERPRISE_USAGE_MONITORING_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_usage_monitoring")"
BASELINE_ENTERPRISE_USAGE_POLICIES_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_usage_policies")"

MANAGER_TEMP_APP_NAME="qa-manager-app-${RUN_ID}"
request "POST" "/admin/system-preferences" "{\"custom_app_name\":$(json_quote "${MANAGER_TEMP_APP_NAME}")}" "${MANAGER_TOKEN}"
assert_status "200" "manager can update non-enterprise system preference"

request "GET" "/admin/system-preferences-for?labels=custom_app_name" "" "${ADMIN_TOKEN}"
assert_status "200" "verify manager custom app name update persisted"
UPDATED_CUSTOM_APP_NAME="$(json_get_or_empty "$HTTP_BODY" "settings.custom_app_name")"
if [[ "${UPDATED_CUSTOM_APP_NAME}" != "${MANAGER_TEMP_APP_NAME}" ]]; then
  log "FAILED: manager custom_app_name update was not persisted."
  log "Expected: ${MANAGER_TEMP_APP_NAME} | Actual: ${UPDATED_CUSTOM_APP_NAME}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"custom_app_name\":${ORIGINAL_CUSTOM_APP_NAME_JSON}}" "${ADMIN_TOKEN}"
assert_status "200" "restore original custom app name after manager preference test"
request "GET" "/admin/system-preferences-for?labels=custom_app_name" "" "${ADMIN_TOKEN}"
assert_status "200" "verify original custom app name restored after manager preference test"
RESTORED_CUSTOM_APP_NAME_JSON="$(json_get_json_value "$HTTP_BODY" "settings.custom_app_name")"
if [[ -z "${RESTORED_CUSTOM_APP_NAME_JSON}" ]]; then
  RESTORED_CUSTOM_APP_NAME_JSON="null"
fi
if [[ "${RESTORED_CUSTOM_APP_NAME_JSON}" != "${ORIGINAL_CUSTOM_APP_NAME_JSON}" ]]; then
  log "FAILED: custom_app_name did not restore to original value after manager preference test."
  log "Original: ${ORIGINAL_CUSTOM_APP_NAME_JSON} | Restored: ${RESTORED_CUSTOM_APP_NAME_JSON}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"enabled\"}" "${MANAGER_TOKEN}"
assert_status "403" "manager denied enterprise key system preference writes"
if ! contains_text "$HTTP_BODY" "Managers cannot update enterprise_teams"; then
  log "FAILED: manager enterprise key denial missing expected error message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_usage_monitoring\":\"disabled\"}" "${MANAGER_TOKEN}"
assert_status "403" "manager denied usage monitoring enterprise key writes"
if ! contains_text "$HTTP_BODY" "Managers cannot update enterprise_usage_monitoring"; then
  log "FAILED: manager usage monitoring denial missing expected error message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_prompt_library\":\"disabled\"}" "${MANAGER_TOKEN}"
assert_status "403" "manager denied prompt library enterprise key writes"
if ! contains_text "$HTTP_BODY" "Managers cannot update enterprise_prompt_library"; then
  log "FAILED: manager prompt library denial missing expected error message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"disabled\"}" "${MANAGER_TOKEN}"
assert_status "403" "manager denied usage policy enterprise key writes"
if ! contains_text "$HTTP_BODY" "Managers cannot update enterprise_usage_policies"; then
  log "FAILED: manager usage policy denial missing expected error message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"feature_flags\":{\"enterprise_teams\":\"disabled\"}}" "${MANAGER_TOKEN}"
assert_status "403" "manager denied feature_flags preference writes"
if ! contains_text "$HTTP_BODY" "Managers cannot update feature_flags"; then
  log "FAILED: manager feature_flags denial missing expected error message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/system-preferences-for?labels=feature_flags" "" "${ADMIN_TOKEN}"
assert_status "200" "verify enterprise feature flags unchanged after manager denied writes"
POST_MANAGER_ENTERPRISE_TEAMS_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_teams")"
POST_MANAGER_ENTERPRISE_PROMPT_LIBRARY_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_prompt_library")"
POST_MANAGER_ENTERPRISE_USAGE_MONITORING_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_usage_monitoring")"
POST_MANAGER_ENTERPRISE_USAGE_POLICIES_FLAG="$(json_get_or_empty "$HTTP_BODY" "settings.feature_flags.enterprise_usage_policies")"
if [[ "${POST_MANAGER_ENTERPRISE_TEAMS_FLAG}" != "${BASELINE_ENTERPRISE_TEAMS_FLAG}" || "${POST_MANAGER_ENTERPRISE_PROMPT_LIBRARY_FLAG}" != "${BASELINE_ENTERPRISE_PROMPT_LIBRARY_FLAG}" || "${POST_MANAGER_ENTERPRISE_USAGE_MONITORING_FLAG}" != "${BASELINE_ENTERPRISE_USAGE_MONITORING_FLAG}" || "${POST_MANAGER_ENTERPRISE_USAGE_POLICIES_FLAG}" != "${BASELINE_ENTERPRISE_USAGE_POLICIES_FLAG}" ]]; then
  log "FAILED: manager denied writes unexpectedly changed enterprise feature flags."
  log "Baseline: teams=${BASELINE_ENTERPRISE_TEAMS_FLAG}, prompt=${BASELINE_ENTERPRISE_PROMPT_LIBRARY_FLAG}, monitoring=${BASELINE_ENTERPRISE_USAGE_MONITORING_FLAG}, policies=${BASELINE_ENTERPRISE_USAGE_POLICIES_FLAG}"
  log "Current: teams=${POST_MANAGER_ENTERPRISE_TEAMS_FLAG}, prompt=${POST_MANAGER_ENTERPRISE_PROMPT_LIBRARY_FLAG}, monitoring=${POST_MANAGER_ENTERPRISE_USAGE_MONITORING_FLAG}, policies=${POST_MANAGER_ENTERPRISE_USAGE_POLICIES_FLAG}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

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

request "GET" "/admin/usage/overview?from=2026-03-10T00:00:00.000Z&to=2026-03-01T00:00:00.000Z" "" "${ADMIN_TOKEN}"
assert_status "200" "usage overview handles inverted from/to range"

request "GET" "/admin/usage/timeseries?interval=day" "" "${ADMIN_TOKEN}"
assert_status "200" "usage timeseries available when monitoring enabled"

request "GET" "/admin/usage/breakdown?by=eventType" "" "${ADMIN_TOKEN}"
assert_status "200" "usage breakdown available when monitoring enabled"

request "GET" "/admin/usage/breakdown?by=notAField" "" "${ADMIN_TOKEN}"
assert_status "400" "usage breakdown rejects invalid field"
if ! contains_text "$HTTP_BODY" "Invalid breakdown field"; then
  log "FAILED: invalid breakdown response missing expected error text."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/admin/usage/export.csv" "" "${ADMIN_TOKEN}"
assert_status "200" "usage CSV export available when monitoring enabled"
if ! contains_text "$HTTP_BODY" "id,occurredAt,eventType"; then
  log "FAILED: usage export csv missing expected header row."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying usage monitoring reflects fresh usage events"
request "GET" "/admin/usage/overview?workspaceId=${WORKSPACE_ID}" "" "${ADMIN_TOKEN}"
assert_status "200" "usage overview before probe event"
BASE_USAGE_EVENTS="$(json_get "$HTTP_BODY" "summary.events")"
BASE_USAGE_TOTAL_TOKENS="$(json_get "$HTTP_BODY" "summary.totalTokens")"
PROBE_PROMPT_TOKENS=13
PROBE_COMPLETION_TOKENS=8
PROBE_TOTAL_TOKENS=21
PROBE_DURATION_MS=210
PROBE_USAGE_EVENT_ID="$(
  inject_usage_event \
    "${WORKSPACE_ID}" \
    "${USER_ID}" \
    "${TEAM_ID}" \
    "${PROBE_PROMPT_TOKENS}" \
    "${PROBE_COMPLETION_TOKENS}" \
    "${PROBE_TOTAL_TOKENS}" \
    "${PROBE_DURATION_MS}"
)"
if [[ -z "${PROBE_USAGE_EVENT_ID}" ]]; then
  log "FAILED: usage probe event did not return an event id."
  exit 1
fi
request "GET" "/admin/usage/overview?workspaceId=${WORKSPACE_ID}" "" "${ADMIN_TOKEN}"
assert_status "200" "usage overview after probe event"
UPDATED_USAGE_EVENTS="$(json_get "$HTTP_BODY" "summary.events")"
UPDATED_USAGE_TOTAL_TOKENS="$(json_get "$HTTP_BODY" "summary.totalTokens")"
if (( UPDATED_USAGE_EVENTS < BASE_USAGE_EVENTS + 1 )); then
  log "FAILED: usage event count did not increase after usage probe insertion."
  log "Before events=${BASE_USAGE_EVENTS}, after events=${UPDATED_USAGE_EVENTS}, probeEventId=${PROBE_USAGE_EVENT_ID}"
  exit 1
fi
if (( UPDATED_USAGE_TOTAL_TOKENS < BASE_USAGE_TOTAL_TOKENS + PROBE_TOTAL_TOKENS )); then
  log "FAILED: usage total token count did not reflect probe event payload."
  log "Before totalTokens=${BASE_USAGE_TOTAL_TOKENS}, after totalTokens=${UPDATED_USAGE_TOTAL_TOKENS}, expectedIncrease=${PROBE_TOTAL_TOKENS}, probeEventId=${PROBE_USAGE_EVENT_ID}"
  exit 1
fi

log "Verifying prompt library feature gate denies template routes when disabled"
request "POST" "/admin/system-preferences" "{\"enterprise_prompt_library\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_prompt_library flag"
request "GET" "/admin/prompt-templates" "" "${ADMIN_TOKEN}"
assert_status "403" "prompt templates blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_prompt_library"; then
  log "FAILED: disabled feature response missing enterprise_prompt_library marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_prompt_library\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_prompt_library flag"
request "GET" "/admin/prompt-templates" "" "${ADMIN_TOKEN}"
assert_status "200" "prompt templates restored when feature enabled"

log "Creating and applying prompt template to workspace"
request "POST" "/admin/prompt-templates/new" "{\"name\":\"qa-template-${RUN_ID}\",\"scope\":\"system\",\"prompt\":\"${TEMPLATE_PROMPT}\"}" "${ADMIN_TOKEN}"
assert_status "200" "create prompt template"
TEMPLATE_ID="$(json_get "$HTTP_BODY" "template.id")"

request "POST" "/admin/prompt-templates/${TEMPLATE_ID}/apply-to-workspace" "{\"workspaceId\":${WORKSPACE_ID}}" "${ADMIN_TOKEN}"
assert_status "200" "apply prompt template to workspace"
if ! contains_text "$HTTP_BODY" "${TEMPLATE_PROMPT}"; then
  log "FAILED: applied template response missing expected prompt text."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/workspace/${WORKSPACE_SLUG}" "" "${ADMIN_TOKEN}"
assert_status "200" "workspace details after template apply"
if ! contains_text "$HTTP_BODY" "${TEMPLATE_PROMPT}"; then
  log "FAILED: workspace prompt did not match applied template."
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
request "GET" "/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}&teamIds=${TEAM_ID}" "" "${ADMIN_TOKEN}"
assert_status "403" "usage policy effective blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_policies"; then
  log "FAILED: disabled effective policy response missing enterprise_usage_policies marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_usage_policies flag"

log "Creating strict prompt-length usage policy"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-strict-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":50,\"rules\":{\"maxPromptLength\":10}}" "${ADMIN_TOKEN}"
assert_status "200" "create strict usage policy"
POLICY_ID="$(json_get "$HTTP_BODY" "policy.id")"

log "Verifying effective usage policy endpoints sanitize malformed teamIds"
request "GET" "/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}&userId=${USER_ID}&teamIds=${TEAM_ID}" "" "${ADMIN_TOKEN}"
assert_status "200" "session effective policy with clean teamIds"
CLEAN_EFFECTIVE_MAX_PROMPT="$(json_get_or_empty "$HTTP_BODY" "rules.maxPromptLength")"
if [[ -z "${CLEAN_EFFECTIVE_MAX_PROMPT}" ]]; then
  log "FAILED: clean effective policy response missing rules.maxPromptLength."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "GET" "/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}.5&userId=foo&teamIds=${TEAM_ID},${TEAM_ID},foo,0,-3,4.2" "" "${ADMIN_TOKEN}"
assert_status "200" "session effective policy with malformed ids"
DIRTY_EFFECTIVE_MAX_PROMPT="$(json_get_or_empty "$HTTP_BODY" "rules.maxPromptLength")"
if [[ "${DIRTY_EFFECTIVE_MAX_PROMPT}" != "${CLEAN_EFFECTIVE_MAX_PROMPT}" ]]; then
  log "FAILED: malformed effective-policy ids changed session policy resolution unexpectedly."
  log "Clean maxPromptLength=${CLEAN_EFFECTIVE_MAX_PROMPT} Dirty maxPromptLength=${DIRTY_EFFECTIVE_MAX_PROMPT}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

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

request "GET" "/v1/admin/teams" "" "${CHAT_KEY}"
assert_status "403" "workspace:chat key denied admin team listing"
if ! contains_text "$HTTP_BODY" "admin:read"; then
  log "FAILED: workspace:chat key denial missing admin:read requirement message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying token quota policy blocks chat when daily tokens are exhausted"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-token-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":45,\"rules\":{\"maxTokensPerDay\":5}}" "${ADMIN_TOKEN}"
assert_status "200" "create token quota usage policy"
TOKEN_POLICY_ID="$(json_get "$HTTP_BODY" "policy.id")"
TOKEN_QUOTA_EVENT_ID="$(
  inject_usage_event \
    "${WORKSPACE_ID}" \
    "${USER_ID}" \
    "${TEAM_ID}" \
    "2" \
    "4" \
    "6" \
    "120" \
    "workspace_chat"
)"
if [[ -z "${TOKEN_QUOTA_EVENT_ID}" ]]; then
  log "FAILED: token quota probe event did not return an event id."
  exit 1
fi
request "POST" "/v1/workspace/${WORKSPACE_SLUG}/chat" "{\"message\":\"short\",\"mode\":\"chat\"}" "${CHAT_KEY}"
assert_status "403" "token quota policy blocks chat"
if ! contains_text "$HTTP_BODY" "Daily token quota reached"; then
  log "FAILED: token quota denial missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying chat quota policy blocks chat when daily message cap is reached"
request "POST" "/admin/usage-policies/new" "{\"name\":\"qa-chat-quota-policy-${RUN_ID}\",\"scope\":\"system\",\"priority\":44,\"rules\":{\"maxChatsPerDay\":1}}" "${ADMIN_TOKEN}"
assert_status "200" "create chat quota usage policy"
CHAT_QUOTA_POLICY_ID="$(json_get "$HTTP_BODY" "policy.id")"
request "POST" "/v1/workspace/${WORKSPACE_SLUG}/chat" "{\"message\":\"short\",\"mode\":\"chat\"}" "${CHAT_KEY}"
assert_status "403" "chat quota policy blocks chat"
if ! contains_text "$HTTP_BODY" "Daily chat quota reached"; then
  log "FAILED: chat quota denial missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying malformed API key datetime payloads are rejected"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-invalid-expiry-${RUN_ID}\",\"scopes\":[\"admin:read\"],\"expiresAt\":\"not-a-date\"}" "${ADMIN_TOKEN}"
assert_status "200" "invalid api key expiry payload rejected"
if ! contains_text "$HTTP_BODY" "Invalid expiresAt datetime."; then
  log "FAILED: invalid expiresAt payload response missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Creating admin read-only API key"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-admin-read-${RUN_ID}\",\"scopes\":[\"admin:read\"],\"expiresAt\":\"2030-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "create admin read-only key"
ADMIN_READ_KEY="$(json_get "$HTTP_BODY" "apiKey.secret")"
ADMIN_READ_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"

request "POST" "/admin/api-keys/${ADMIN_READ_KEY_ID}" "{\"revokedAt\":\"invalid-revoked-at\"}" "${ADMIN_TOKEN}"
assert_status "200" "invalid api key revokedAt payload rejected"
if ! contains_text "$HTTP_BODY" "Invalid revokedAt datetime."; then
  log "FAILED: invalid revokedAt payload response missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying admin:read key can read teams"
request "GET" "/v1/admin/teams" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key teams list"

request "GET" "/v1/admin/usage/overview" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage overview"

request "GET" "/v1/admin/usage/overview?from=2026-03-10T00:00:00.000Z&to=2026-03-01T00:00:00.000Z" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage overview handles inverted range"

request "GET" "/v1/admin/usage/timeseries?interval=day" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage timeseries"

request "GET" "/v1/admin/usage/breakdown?by=eventType&workspaceId=${WORKSPACE_ID}" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage breakdown"
if ! contains_text "$HTTP_BODY" "smoke_usage_probe"; then
  log "FAILED: usage breakdown did not include smoke probe event type."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/v1/admin/usage/breakdown?by=notAField" "" "${ADMIN_READ_KEY}"
assert_status "400" "admin:read key breakdown invalid field rejection"
if ! contains_text "$HTTP_BODY" "Invalid breakdown field"; then
  log "FAILED: v1 invalid breakdown response missing expected error text."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/v1/admin/usage/export.csv" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage csv export"
if ! contains_text "$HTTP_BODY" "id,occurredAt,eventType"; then
  log "FAILED: v1 usage export csv missing expected header row."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/v1/admin/prompt-templates" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key prompt templates list"

request "GET" "/v1/admin/prompt-templates/${TEMPLATE_ID}/versions" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key prompt template versions list"

request "GET" "/v1/admin/usage-policies" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key usage policies list"

request "GET" "/v1/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}&userId=${USER_ID}&teamIds=${TEAM_ID}" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key effective policy clean ids"
V1_CLEAN_EFFECTIVE_MAX_PROMPT="$(json_get_or_empty "$HTTP_BODY" "rules.maxPromptLength")"
if [[ -z "${V1_CLEAN_EFFECTIVE_MAX_PROMPT}" ]]; then
  log "FAILED: v1 clean effective policy response missing rules.maxPromptLength."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "GET" "/v1/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}.8&userId=bad-user&teamIds=${TEAM_ID},${TEAM_ID},foo,0,-9,7.7" "" "${ADMIN_READ_KEY}"
assert_status "200" "admin:read key effective policy malformed ids"
V1_DIRTY_EFFECTIVE_MAX_PROMPT="$(json_get_or_empty "$HTTP_BODY" "rules.maxPromptLength")"
if [[ "${V1_DIRTY_EFFECTIVE_MAX_PROMPT}" != "${V1_CLEAN_EFFECTIVE_MAX_PROMPT}" ]]; then
  log "FAILED: malformed effective-policy ids changed v1 policy resolution unexpectedly."
  log "Clean maxPromptLength=${V1_CLEAN_EFFECTIVE_MAX_PROMPT} Dirty maxPromptLength=${V1_DIRTY_EFFECTIVE_MAX_PROMPT}"
  log "Response: ${HTTP_BODY}"
  exit 1
fi

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

log "Verifying feature gates deny developer /v1 admin routes"
request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_teams for v1 gate check"
request "GET" "/v1/admin/teams" "" "${ADMIN_READ_KEY}"
assert_status "403" "v1 team list blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_teams"; then
  log "FAILED: v1 team feature gate response missing enterprise_teams marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "POST" "/admin/system-preferences" "{\"enterprise_teams\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_teams after v1 gate check"

request "POST" "/admin/system-preferences" "{\"enterprise_usage_monitoring\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_usage_monitoring for v1 gate check"
request "GET" "/v1/admin/usage/overview" "" "${ADMIN_READ_KEY}"
assert_status "403" "v1 usage overview blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_monitoring"; then
  log "FAILED: v1 usage feature gate response missing enterprise_usage_monitoring marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "POST" "/admin/system-preferences" "{\"enterprise_usage_monitoring\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_usage_monitoring after v1 gate check"

request "POST" "/admin/system-preferences" "{\"enterprise_prompt_library\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_prompt_library for v1 gate check"
request "GET" "/v1/admin/prompt-templates" "" "${ADMIN_READ_KEY}"
assert_status "403" "v1 prompt templates blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_prompt_library"; then
  log "FAILED: v1 prompt feature gate response missing enterprise_prompt_library marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "POST" "/admin/system-preferences" "{\"enterprise_prompt_library\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_prompt_library after v1 gate check"

request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"disabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "disable enterprise_usage_policies for v1 gate check"
request "GET" "/v1/admin/usage-policies" "" "${ADMIN_READ_KEY}"
assert_status "403" "v1 usage policies blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_policies"; then
  log "FAILED: v1 usage policy gate response missing enterprise_usage_policies marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "GET" "/v1/admin/usage-policies/effective?workspaceId=${WORKSPACE_ID}&teamIds=${TEAM_ID}" "" "${ADMIN_READ_KEY}"
assert_status "403" "v1 effective usage policies blocked when feature disabled"
if ! contains_text "$HTTP_BODY" "enterprise_usage_policies"; then
  log "FAILED: v1 effective usage policy gate response missing enterprise_usage_policies marker."
  log "Response: ${HTTP_BODY}"
  exit 1
fi
request "POST" "/admin/system-preferences" "{\"enterprise_usage_policies\":\"enabled\"}" "${ADMIN_TOKEN}"
assert_status "200" "re-enable enterprise_usage_policies after v1 gate check"

log "Verifying admin:read key cannot perform admin write"
request "POST" "/v1/admin/teams/new" "{\"name\":\"qa-should-fail-${RUN_ID}\"}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on team create"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/v1/admin/prompt-templates/new" "{\"name\":\"qa-template-denied-${RUN_ID}\",\"scope\":\"system\"}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on prompt template create"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial for prompt template create."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/v1/admin/usage-policies/new" "{\"name\":\"qa-policy-denied-${RUN_ID}\",\"scope\":\"system\",\"rules\":{}}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on usage policy create"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial for usage policy create."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

request "POST" "/v1/admin/api-keys/${ADMIN_READ_KEY_ID}" "{\"name\":\"qa-denied-update-${RUN_ID}\"}" "${ADMIN_READ_KEY}"
assert_status "403" "admin:read key denied on api key update"
if ! contains_text "$HTTP_BODY" "admin:write"; then
  log "FAILED: missing admin:write scope denial for api key update."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying expired API key is rejected"
request "POST" "/admin/generate-api-key" "{\"name\":\"qa-expired-${RUN_ID}\",\"scopes\":[\"admin:read\"],\"expiresAt\":\"2000-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "create expired admin key"
EXPIRED_KEY="$(json_get "$HTTP_BODY" "apiKey.secret")"
EXPIRED_KEY_ID="$(json_get_or_empty "$HTTP_BODY" "apiKey.id")"
request "GET" "/v1/admin/teams" "" "${EXPIRED_KEY}"
assert_status "403" "expired key denied"
if ! contains_text "$HTTP_BODY" "expired"; then
  log "FAILED: expired key denial missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying revoked API key is rejected"
request "POST" "/admin/api-keys/${ADMIN_READ_KEY_ID}" "{\"revokedAt\":\"2030-01-01T00:00:00.000Z\"}" "${ADMIN_TOKEN}"
assert_status "200" "revoke admin read key"
request "GET" "/v1/admin/teams" "" "${ADMIN_READ_KEY}"
assert_status "403" "revoked key denied"
if ! contains_text "$HTTP_BODY" "revoked"; then
  log "FAILED: revoked key denial missing expected message."
  log "Response: ${HTTP_BODY}"
  exit 1
fi

log "Verifying manager cannot mutate admin API key records"
request "POST" "/admin/api-keys/${ADMIN_READ_KEY_ID}" "{\"name\":\"qa-manager-denied-update-${RUN_ID}\"}" "${MANAGER_TOKEN}"
assert_status "401" "manager denied admin api key update"
request "DELETE" "/admin/delete-api-key/${ADMIN_READ_KEY_ID}" "" "${MANAGER_TOKEN}"
assert_status "401" "manager denied admin api key deletion"

log "Verifying default user cannot mutate admin API key records"
request "POST" "/admin/api-keys/${ADMIN_READ_KEY_ID}" "{\"name\":\"qa-default-denied-update-${RUN_ID}\"}" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied admin api key update"
request "DELETE" "/admin/delete-api-key/${ADMIN_READ_KEY_ID}" "" "${TEAM_USER_TOKEN}"
assert_status "401" "default user denied admin api key deletion"

log "Smoke test completed successfully."
