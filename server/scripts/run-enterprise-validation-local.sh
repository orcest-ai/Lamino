#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
LOG_PATH="${LOG_PATH:-/tmp/anythingllm-enterprise-local-validation.log}"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}/api}"
AUTH_TOKEN="${AUTH_TOKEN:-EnterprisePass123!}"
JWT_SECRET="${JWT_SECRET:-enterprise-smoke-secret}"
RESET_DB="${RESET_DB:-1}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-EnterprisePass123!}"
RUN_ID="${RUN_ID:-$(date +%s)-$RANDOM}"
SEED_BOOTSTRAP_COLLISION="${SEED_BOOTSTRAP_COLLISION:-0}"
EXTRA_SMOKE_ARGS="${EXTRA_SMOKE_ARGS:-}"
ALLOW_PORT_REUSE="${ALLOW_PORT_REUSE:-0}"
SMOKE_SUMMARY_PATH="${SMOKE_SUMMARY_PATH:-/tmp/anythingllm-enterprise-smoke-summary-${PORT}.json}"
EXPECT_SINGLE_USER_PRECHECK=0
if [[ "${LOCAL_SINGLE_USER_TOKEN+x}" != "x" ]]; then
  LOCAL_SINGLE_USER_TOKEN="${AUTH_TOKEN}"
fi

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

compose_name() {
  local prefix="$1"
  local max_len="$2"
  local suffix="$3"
  if [[ "${#prefix}" -ge "$max_len" ]]; then
    printf '%s' "${prefix:0:${max_len}}"
    return 0
  fi
  local available=$((max_len - ${#prefix}))
  printf '%s%s' "$prefix" "${suffix:0:${available}}"
}

cd "${SERVER_DIR}"

mkdir -p "$(dirname "${LOG_PATH}")"

echo "[enterprise-local-validation] Using BASE_URL=${BASE_URL}"
echo "[enterprise-local-validation] Log file: ${LOG_PATH}"
echo "[enterprise-local-validation] Smoke summary file: ${SMOKE_SUMMARY_PATH}"
if [[ -n "${EXTRA_SMOKE_ARGS}" ]]; then
  echo "[enterprise-local-validation] EXTRA_SMOKE_ARGS=${EXTRA_SMOKE_ARGS}"
fi
if [[ -n "${LOCAL_SINGLE_USER_TOKEN}" ]]; then
  echo "[enterprise-local-validation] single-user auth preflight: enabled"
else
  echo "[enterprise-local-validation] single-user auth preflight: skipped"
fi

if [[ "${ALLOW_PORT_REUSE}" != "1" ]] && curl -sf "${BASE_URL}/ping" >/dev/null 2>&1; then
  echo "[enterprise-local-validation] Port ${PORT} is already serving API traffic."
  echo "[enterprise-local-validation] Refusing to reuse an existing server to avoid false-positive validation."
  echo "[enterprise-local-validation] Set ALLOW_PORT_REUSE=1 to bypass this guard intentionally."
  exit 1
fi

if [[ "${RESET_DB}" == "1" ]]; then
  echo "[enterprise-local-validation] Resetting SQLite database."
  rm -f "${SERVER_DIR}/storage/anythingllm.db"
fi

echo "[enterprise-local-validation] Applying database migrations."
npx prisma migrate deploy --schema=./prisma/schema.prisma

if [[ "${SEED_BOOTSTRAP_COLLISION}" == "1" ]]; then
  echo "[enterprise-local-validation] Seeding bootstrap username collision fixtures."
  RUN_SUFFIX="$(printf '%s' "${RUN_ID}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-24)"
  RUN_SUFFIX="${RUN_SUFFIX:-default}"
  USERNAME_SEED="$(normalize_username_seed "${ADMIN_USERNAME}" 24)"
  RETRY_USERNAME="$(compose_name "${USERNAME_SEED}-" 32 "${RUN_SUFFIX}")"
  USERNAME_SEED="${USERNAME_SEED}" RETRY_USERNAME="${RETRY_USERNAME}" node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  for (const username of [process.env.USERNAME_SEED, process.env.RETRY_USERNAME]) {
    await prisma.users.upsert({
      where: { username },
      update: {},
      create: {
        username,
        password: "ci-bootstrap-collision-seed",
        role: "admin",
      },
    });
  }
  await prisma.$disconnect();
  console.log(
    `[enterprise-local-validation] Seeded bootstrap collisions: ${process.env.USERNAME_SEED}, ${process.env.RETRY_USERNAME}`
  );
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
'
fi

echo "[enterprise-local-validation] Starting server on port ${PORT}."
AUTH_TOKEN="${AUTH_TOKEN}" JWT_SECRET="${JWT_SECRET}" NODE_ENV=development SERVER_PORT="${PORT}" PORT="${PORT}" node index.js >"${LOG_PATH}" 2>&1 &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" >/dev/null 2>&1 || true' EXIT

if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
  echo "[enterprise-local-validation] Server process exited immediately after startup."
  cat "${LOG_PATH}" || true
  exit 1
fi

echo "[enterprise-local-validation] Waiting for server readiness."
for _ in {1..120}; do
  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    echo "[enterprise-local-validation] Server process exited before readiness."
    cat "${LOG_PATH}" || true
    exit 1
  fi
  if curl -sf "${BASE_URL}/ping" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "${BASE_URL}/ping" >/dev/null 2>&1; then
  echo "[enterprise-local-validation] Server failed to become healthy."
  cat "${LOG_PATH}" || true
  exit 1
fi

if [[ -n "${LOCAL_SINGLE_USER_TOKEN}" ]]; then
  PRE_SMOKE_MULTI_USER_MODE="$(
    curl -fsS "${BASE_URL}/system/multi-user-mode" 2>/dev/null | node -e '
const fs = require("fs");
const body = fs.readFileSync(0, "utf8");
const payload = JSON.parse(body);
process.stdout.write(String(payload.multiUserMode ?? ""));
' 2>/dev/null || true
  )"
  if [[ "${PRE_SMOKE_MULTI_USER_MODE}" == "false" ]]; then
    EXPECT_SINGLE_USER_PRECHECK=1
  fi
  echo "[enterprise-local-validation] multi-user mode before smoke: ${PRE_SMOKE_MULTI_USER_MODE:-<unknown>} (expect single-user preflight=$([[ "${EXPECT_SINGLE_USER_PRECHECK}" == "1" ]] && echo "yes" || echo "no"))"
fi

echo "[enterprise-local-validation] Running enterprise smoke test."
rm -f "${SMOKE_SUMMARY_PATH}"
SMOKE_ARGS=()
if [[ -n "${LOCAL_SINGLE_USER_TOKEN}" ]]; then
  SMOKE_ARGS+=(--single-user-token "${LOCAL_SINGLE_USER_TOKEN}")
fi
SMOKE_ARGS+=(--summary-file "${SMOKE_SUMMARY_PATH}")
if [[ -n "${EXTRA_SMOKE_ARGS}" ]]; then
  # shellcheck disable=SC2206
  EXTRA_ARGS_ARRAY=(${EXTRA_SMOKE_ARGS})
  SMOKE_ARGS+=("${EXTRA_ARGS_ARRAY[@]}")
fi

if ! BASE_URL="${BASE_URL}" SINGLE_USER_AUTH_TOKEN="${LOCAL_SINGLE_USER_TOKEN}" JWT_SECRET="${JWT_SECRET}" \
  ADMIN_USERNAME="${ADMIN_USERNAME}" ADMIN_PASSWORD="${ADMIN_PASSWORD}" RUN_ID="${RUN_ID}" \
  ./scripts/enterprise-smoke-test.sh "${SMOKE_ARGS[@]}"; then
  echo "[enterprise-local-validation] Enterprise smoke failed. Dumping server log from ${LOG_PATH}."
  if [[ -f "${SMOKE_SUMMARY_PATH}" ]]; then
    echo "[enterprise-local-validation] Smoke summary:"
    node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  fi
  cat "${LOG_PATH}" || true
  exit 1
fi

if [[ ! -f "${SMOKE_SUMMARY_PATH}" ]]; then
  echo "[enterprise-local-validation] Smoke summary file was not generated."
  exit 1
fi

SMOKE_SUMMARY_STATUS="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.status || "");
' "${SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
if [[ "${SMOKE_SUMMARY_STATUS}" != "success" ]]; then
  echo "[enterprise-local-validation] Smoke summary status is not success (got: ${SMOKE_SUMMARY_STATUS:-<empty>})."
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

SMOKE_SUMMARY_CURRENT_PHASE="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.currentPhase || "");
' "${SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
if [[ "${SMOKE_SUMMARY_CURRENT_PHASE}" != "completed" ]]; then
  echo "[enterprise-local-validation] Smoke summary currentPhase is not completed (got: ${SMOKE_SUMMARY_CURRENT_PHASE:-<empty>})."
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

SMOKE_SUMMARY_REQUEST_COUNT="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(payload.requestCount ?? ""));
' "${SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
if [[ ! "${SMOKE_SUMMARY_REQUEST_COUNT}" =~ ^[0-9]+$ ]] || (( SMOKE_SUMMARY_REQUEST_COUNT <= 0 )); then
  echo "[enterprise-local-validation] Smoke summary requestCount is invalid (got: ${SMOKE_SUMMARY_REQUEST_COUNT:-<empty>})."
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

EXPECTED_PHASES=(
  "readiness"
  "admin-auth"
  "fixture-provisioning"
  "default-role-matrix"
  "manager-role-matrix"
  "feature-gates"
  "usage-monitoring"
  "prompt-library"
  "usage-policies"
  "policy-enforcement"
  "api-key-scopes"
  "api-key-lifecycle"
  "completed"
)

if [[ "${EXPECT_SINGLE_USER_PRECHECK}" == "1" ]]; then
  EXPECTED_PHASES=("single-user-preflight" "${EXPECTED_PHASES[@]}")
fi

SMOKE_SUMMARY_MISSING_PHASES="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = process.argv.slice(2).filter(Boolean);
const history = Array.isArray(payload.phaseHistory) ? payload.phaseHistory : [];
const missing = expected.filter((phase) => !history.includes(phase));
process.stdout.write(missing.join(","));
' "${SMOKE_SUMMARY_PATH}" "${EXPECTED_PHASES[@]}" 2>/dev/null || true
)"
if [[ -n "${SMOKE_SUMMARY_MISSING_PHASES}" ]]; then
  echo "[enterprise-local-validation] Smoke summary phaseHistory is missing required phases: ${SMOKE_SUMMARY_MISSING_PHASES}"
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

EXPECTED_MATRIX_CHECKS=(
  "multi-user-mode-admin-manager-default"
  "team-assigned-workspace-visibility"
  "policy-enforcement-paths"
  "scoped-api-key-failures-successes"
  "usage-dashboard-data-freshness"
)
if [[ "${EXPECT_SINGLE_USER_PRECHECK}" == "1" ]]; then
  EXPECTED_MATRIX_CHECKS=("single-user-mode" "${EXPECTED_MATRIX_CHECKS[@]}")
fi

SMOKE_SUMMARY_MISSING_MATRIX_CHECKS="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = process.argv.slice(2).filter(Boolean);
const passed = Array.isArray(payload.verificationMatrix?.passed)
  ? payload.verificationMatrix.passed
  : [];
const missing = expected.filter((check) => !passed.includes(check));
process.stdout.write(missing.join(","));
' "${SMOKE_SUMMARY_PATH}" "${EXPECTED_MATRIX_CHECKS[@]}" 2>/dev/null || true
)"
if [[ -n "${SMOKE_SUMMARY_MISSING_MATRIX_CHECKS}" ]]; then
  echo "[enterprise-local-validation] Smoke summary verificationMatrix is missing required checks: ${SMOKE_SUMMARY_MISSING_MATRIX_CHECKS}"
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

SMOKE_SUMMARY_MATRIX_STATUS="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.verificationMatrix?.status || "");
' "${SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
if [[ "${SMOKE_SUMMARY_MATRIX_STATUS}" != "pass" ]]; then
  echo "[enterprise-local-validation] Smoke summary verificationMatrix status is not pass (got: ${SMOKE_SUMMARY_MATRIX_STATUS:-<empty>})."
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${SMOKE_SUMMARY_PATH}" || true
  exit 1
fi

echo "[enterprise-local-validation] Smoke summary validated (phase=${SMOKE_SUMMARY_CURRENT_PHASE}, requestCount=${SMOKE_SUMMARY_REQUEST_COUNT}, requiredPhases=ok, matrixChecks=ok)."

echo "[enterprise-local-validation] Enterprise local validation succeeded."
