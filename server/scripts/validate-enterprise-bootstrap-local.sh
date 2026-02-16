#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${SERVER_DIR}/.." && pwd)"

BOOTSTRAP_SCRIPT="${REPO_ROOT}/docker/bootstrap-enterprise.sh"
SCHEMA_PATH="./prisma/schema.prisma"
DB_PATH="${SERVER_DIR}/storage/anythingllm.db"
STORAGE_DIR_PATH="${SERVER_DIR}/storage"
WAIT_RETRIES="${WAIT_RETRIES:-60}"
WAIT_SLEEP_SECONDS="${WAIT_SLEEP_SECONDS:-1}"
BOOTSTRAP_VALIDATION_BASE_PORT="${BOOTSTRAP_VALIDATION_BASE_PORT:-$((4200 + RANDOM % 200))}"
AUTH_SCENARIO_PORT="${AUTH_SCENARIO_PORT:-${BOOTSTRAP_VALIDATION_BASE_PORT}}"
OPEN_SCENARIO_PORT="${OPEN_SCENARIO_PORT:-$((BOOTSTRAP_VALIDATION_BASE_PORT + 1))}"
NEGATIVE_SCENARIO_PORT="${NEGATIVE_SCENARIO_PORT:-$((BOOTSTRAP_VALIDATION_BASE_PORT + 2))}"
COLLISION_SCENARIO_PORT="${COLLISION_SCENARIO_PORT:-$((BOOTSTRAP_VALIDATION_BASE_PORT + 3))}"
AUTH_SERVER_LOG="${AUTH_SERVER_LOG:-/tmp/anythingllm-bootstrap-auth-server.log}"
OPEN_SERVER_LOG="${OPEN_SERVER_LOG:-/tmp/anythingllm-bootstrap-open-server.log}"
NEGATIVE_SERVER_LOG="${NEGATIVE_SERVER_LOG:-/tmp/anythingllm-bootstrap-negative-server.log}"
NEGATIVE_BOOTSTRAP_LOG="${NEGATIVE_BOOTSTRAP_LOG:-/tmp/anythingllm-bootstrap-negative-run.log}"
COLLISION_SERVER_LOG="${COLLISION_SERVER_LOG:-/tmp/anythingllm-bootstrap-collision-server.log}"
COLLISION_BOOTSTRAP_LOG="${COLLISION_BOOTSTRAP_LOG:-/tmp/anythingllm-bootstrap-collision-run.log}"
AUTH_BOOTSTRAP_SUMMARY="${AUTH_BOOTSTRAP_SUMMARY:-/tmp/anythingllm-bootstrap-auth-summary.json}"
OPEN_BOOTSTRAP_SUMMARY="${OPEN_BOOTSTRAP_SUMMARY:-/tmp/anythingllm-bootstrap-open-summary.json}"
NEGATIVE_BOOTSTRAP_SUMMARY="${NEGATIVE_BOOTSTRAP_SUMMARY:-/tmp/anythingllm-bootstrap-negative-summary.json}"
COLLISION_BOOTSTRAP_SUMMARY="${COLLISION_BOOTSTRAP_SUMMARY:-/tmp/anythingllm-bootstrap-collision-summary.json}"

SERVER_PID=""

log() {
  printf '[enterprise-bootstrap-validation] %s\n' "$*"
}

cleanup_server() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  SERVER_PID=""
}

trap cleanup_server EXIT

reset_and_migrate() {
  log "Resetting database."
  rm -f "${DB_PATH}"
  log "Applying migrations."
  (
    cd "${SERVER_DIR}"
    npx prisma migrate deploy --schema="${SCHEMA_PATH}" >/dev/null
  )
}

wait_for_api() {
  local base_url="$1"
  local attempt=1
  while [[ "${attempt}" -le "${WAIT_RETRIES}" ]]; do
    if [[ -n "${SERVER_PID}" ]] && ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      return 1
    fi
    if curl -fsS "${base_url}/api/ping" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${WAIT_SLEEP_SECONDS}"
    attempt=$((attempt + 1))
  done

  return 1
}

start_server() {
  local port="$1"
  local auth_token="$2"
  local jwt_secret="$3"
  local server_log="$4"

  log "Starting server on port ${port}."
  local previous_dir="${PWD}"
  cd "${SERVER_DIR}"
  NODE_ENV=production \
    STORAGE_DIR="${STORAGE_DIR_PATH}" \
    SERVER_PORT="${port}" \
    AUTH_TOKEN="${auth_token}" \
    JWT_SECRET="${jwt_secret}" \
    node index.js >"${server_log}" 2>&1 &
  SERVER_PID=$!
  cd "${previous_dir}"

  sleep 1
  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    log "Server failed to start on port ${port}. Log: ${server_log}"
    return 1
  fi
}

assert_multi_user_enabled() {
  local base_url="$1"
  local mode_response
  mode_response="$(curl -fsS "${base_url}/api/system/multi-user-mode" || true)"
  if [[ "${mode_response}" != *'"multiUserMode":true'* ]]; then
    log "Expected multi-user mode enabled but got: ${mode_response:-<empty>}"
    return 1
  fi
}

seed_username_collision() {
  local username="$1"
  local previous_dir="${PWD}"
  cd "${SERVER_DIR}"
  PRESEED_USERNAME="${username}" node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  await prisma.users.upsert({
    where: { username: process.env.PRESEED_USERNAME },
    update: {},
    create: {
      username: process.env.PRESEED_USERNAME,
      password: "preseeded-collision-password",
      role: "admin",
    },
  });
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
'
  cd "${previous_dir}"
}

summary_field() {
  local summary_path="$1"
  local field="$2"
  node -e '
const fs = require("fs");
const summary = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const field = process.argv[2];
const value = summary[field];
if (value === undefined || value === null) process.exit(2);
process.stdout.write(String(value));
' "${summary_path}" "${field}" 2>/dev/null || true
}

assert_summary_status() {
  local summary_path="$1"
  local expected="$2"
  local label="$3"
  if [[ ! -f "${summary_path}" ]]; then
    log "Missing bootstrap summary for ${label}: ${summary_path}"
    return 1
  fi
  local actual
  actual="$(summary_field "${summary_path}" "status")"
  if [[ "${actual}" != "${expected}" ]]; then
    log "Unexpected bootstrap summary status for ${label}. expected=${expected} got=${actual:-<empty>}"
    return 1
  fi
}

run_auth_protected_scenario() {
  local port="${AUTH_SCENARIO_PORT}"
  local base_url="http://localhost:${port}"
  local auth_token="BootstrapPass!123"
  local jwt_secret="bootstrap-secret-123"

  log "Scenario 1/4: auth-protected bootstrap with --single-user-token."
  reset_and_migrate
  rm -f "${AUTH_BOOTSTRAP_SUMMARY}"
  start_server "${port}" "${auth_token}" "${jwt_secret}" "${AUTH_SERVER_LOG}"
  if ! wait_for_api "${base_url}"; then
    log "Auth-protected scenario API did not become ready. Server log: ${AUTH_SERVER_LOG}"
    return 1
  fi

  (
    cd "${REPO_ROOT}/docker"
    ./bootstrap-enterprise.sh \
      --base-url "${base_url}" \
      --single-user-token "${auth_token}" \
      --admin-username "bootstrapadmin" \
      --admin-password "AdminPass!1234" \
      --summary-file "${AUTH_BOOTSTRAP_SUMMARY}"
  )
  assert_summary_status "${AUTH_BOOTSTRAP_SUMMARY}" "success" "auth-protected scenario"
  assert_multi_user_enabled "${base_url}"
  cleanup_server
}

run_open_scenario() {
  local port="${OPEN_SCENARIO_PORT}"
  local base_url="http://localhost:${port}"
  local bootstrap_base_url="${base_url}/api"

  log "Scenario 2/4: open single-user bootstrap without token."
  reset_and_migrate
  rm -f "${OPEN_BOOTSTRAP_SUMMARY}"
  start_server "${port}" "" "" "${OPEN_SERVER_LOG}"
  if ! wait_for_api "${base_url}"; then
    log "Open scenario API did not become ready. Server log: ${OPEN_SERVER_LOG}"
    return 1
  fi

  (
    cd "${REPO_ROOT}/docker"
    ./bootstrap-enterprise.sh \
      --base-url "${bootstrap_base_url}" \
      --admin-username "bootstrapadmin2" \
      --admin-password "AdminPass!1234" \
      --summary-file "${OPEN_BOOTSTRAP_SUMMARY}"
  )
  assert_summary_status "${OPEN_BOOTSTRAP_SUMMARY}" "success" "open scenario"
  assert_multi_user_enabled "${base_url}"
  cleanup_server
}

run_missing_token_negative_scenario() {
  local port="${NEGATIVE_SCENARIO_PORT}"
  local base_url="http://localhost:${port}"

  log "Scenario 3/4: auth-protected bootstrap without token should fail with hint."
  reset_and_migrate
  rm -f "${NEGATIVE_BOOTSTRAP_SUMMARY}"
  start_server "${port}" "BootstrapPass!123" "bootstrap-secret-123" "${NEGATIVE_SERVER_LOG}"
  if ! wait_for_api "${base_url}"; then
    log "Negative scenario API did not become ready. Server log: ${NEGATIVE_SERVER_LOG}"
    return 1
  fi

  local exit_code=0
  (
    cd "${REPO_ROOT}/docker"
    set +e
    ./bootstrap-enterprise.sh \
      --base-url "${base_url}" \
      --admin-username "bootstrapadmin3" \
      --admin-password "AdminPass!1234" \
      --summary-file "${NEGATIVE_BOOTSTRAP_SUMMARY}" >"${NEGATIVE_BOOTSTRAP_LOG}" 2>&1
    exit_code=$?
    set -e
    if [[ "${exit_code}" -eq 0 ]]; then
      log "Negative scenario unexpectedly succeeded."
      return 1
    fi
  )

  if ! rg "Hint: pass --single-user-token" "${NEGATIVE_BOOTSTRAP_LOG}" >/dev/null; then
    log "Expected hint not found in negative scenario output: ${NEGATIVE_BOOTSTRAP_LOG}"
    return 1
  fi
  if ! rg "status=401" "${NEGATIVE_BOOTSTRAP_LOG}" >/dev/null; then
    log "Expected status=401 diagnostic not found in negative scenario output: ${NEGATIVE_BOOTSTRAP_LOG}"
    return 1
  fi
  assert_summary_status "${NEGATIVE_BOOTSTRAP_SUMMARY}" "failed" "negative scenario"
  local negative_message
  negative_message="$(summary_field "${NEGATIVE_BOOTSTRAP_SUMMARY}" "message")"
  if [[ "${negative_message}" != *"status=401"* ]]; then
    log "Expected status=401 message in negative summary, got: ${negative_message:-<empty>}"
    return 1
  fi
  cleanup_server
}

run_collision_retry_scenario() {
  local port="${COLLISION_SCENARIO_PORT}"
  local base_url="http://localhost:${port}"
  local colliding_username="collisionadmin"
  local first_retry_username="collisionadmin-retry"
  local effective_username
  local login_response
  local retry_count

  log "Scenario 4/4: username collision retries should converge on fallback admin username."
  reset_and_migrate
  rm -f "${COLLISION_BOOTSTRAP_SUMMARY}"
  seed_username_collision "${colliding_username}"
  seed_username_collision "${first_retry_username}"
  start_server "${port}" "" "" "${COLLISION_SERVER_LOG}"
  if ! wait_for_api "${base_url}"; then
    log "Collision scenario API did not become ready. Server log: ${COLLISION_SERVER_LOG}"
    return 1
  fi

  (
    cd "${REPO_ROOT}/docker"
    ./bootstrap-enterprise.sh \
      --base-url "${base_url}" \
      --admin-username "${colliding_username}" \
      --admin-password "AdminPass!1234" \
      --summary-file "${COLLISION_BOOTSTRAP_SUMMARY}" >"${COLLISION_BOOTSTRAP_LOG}"
  )

  assert_summary_status "${COLLISION_BOOTSTRAP_SUMMARY}" "success" "collision scenario"
  assert_multi_user_enabled "${base_url}"
  if ! rg "retrying as" "${COLLISION_BOOTSTRAP_LOG}" >/dev/null; then
    log "Expected collision retry logs in ${COLLISION_BOOTSTRAP_LOG} but none were found."
    return 1
  fi

  retry_count="$(summary_field "${COLLISION_BOOTSTRAP_SUMMARY}" "retriesUsed")"
  if (( retry_count < 2 )); then
    log "Expected at least 2 collision retries, found ${retry_count} in ${COLLISION_BOOTSTRAP_LOG}."
    return 1
  fi

  effective_username="$(summary_field "${COLLISION_BOOTSTRAP_SUMMARY}" "effectiveAdminUsername")"
  if [[ -z "${effective_username}" ]]; then
    log "Unable to parse effective admin username from ${COLLISION_BOOTSTRAP_SUMMARY}."
    return 1
  fi

  login_response="$(
    curl -sS -X POST "${base_url}/api/request-token" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"${effective_username}\",\"password\":\"AdminPass!1234\"}" || true
  )"
  if [[ "${login_response}" != *'"valid":true'* ]]; then
    log "Expected successful login for fallback username ${effective_username}, got: ${login_response}"
    return 1
  fi
  cleanup_server
}

main() {
  if [[ ! -x "${BOOTSTRAP_SCRIPT}" ]]; then
    log "Bootstrap script not found or not executable: ${BOOTSTRAP_SCRIPT}"
    exit 1
  fi

  run_auth_protected_scenario
  run_open_scenario
  run_missing_token_negative_scenario
  run_collision_retry_scenario
  log "All enterprise bootstrap validation scenarios passed."
}

main "$@"
