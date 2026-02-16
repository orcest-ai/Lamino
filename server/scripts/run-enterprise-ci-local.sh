#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${SERVER_DIR}/.." && pwd)"

CI_AUTH_TOKEN="${CI_AUTH_TOKEN:-ci-single-user-token}"
CI_JWT_SECRET="${CI_JWT_SECRET:-ci-enterprise-secret}"
CI_ADMIN_USERNAME="${CI_ADMIN_USERNAME:-ADMIN+++CI_BOOTSTRAP_USERNAME}"
CI_ADMIN_PASSWORD="${CI_ADMIN_PASSWORD:-EnterprisePass123!}"
CI_RUN_ID="${CI_RUN_ID:-ci-run-id-with-symbols-@@@-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789}"
CI_LOG_PATH="${CI_LOG_PATH:-/tmp/anythingllm-server.log}"
CI_SMOKE_SUMMARY_PATH="${CI_SMOKE_SUMMARY_PATH:-/tmp/anythingllm-enterprise-ci-smoke-summary.json}"
CI_PORT="${CI_PORT:-3101}"
RUN_INSTALL="${RUN_INSTALL:-0}"
SKIP_OPENAPI_CHECK="${SKIP_OPENAPI_CHECK:-0}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"
SKIP_USAGE_CLEANUP_CHECK="${SKIP_USAGE_CLEANUP_CHECK:-0}"
SKIP_BOOTSTRAP_CHECK="${SKIP_BOOTSTRAP_CHECK:-0}"
CI_USAGE_RETENTION_DAYS_CHECK="${CI_USAGE_RETENTION_DAYS_CHECK:-1}"
CI_VALIDATE_USAGE_CLEANUP_NOOP="${CI_VALIDATE_USAGE_CLEANUP_NOOP:-1}"
CI_EXTRA_SMOKE_ARGS="${CI_EXTRA_SMOKE_ARGS:-}"
CI_BOOTSTRAP_VALIDATION_BASE_PORT="${CI_BOOTSTRAP_VALIDATION_BASE_PORT:-4201}"
CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH:-/tmp/anythingllm-bootstrap-validation-summary.json}"
CI_VALIDATION_SUMMARY_PATH="${CI_VALIDATION_SUMMARY_PATH:-/tmp/anythingllm-enterprise-ci-validation-summary.json}"
STAGE_RESULTS_FILE="$(mktemp)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CURRENT_STAGE="initialization"
VALIDATION_STATUS="failed"
VALIDATION_MESSAGE="CI-local validation did not complete."

if [[ "${CI_SINGLE_USER_TOKEN+x}" != "x" ]]; then
  CI_SINGLE_USER_TOKEN="${CI_AUTH_TOKEN}"
fi

cd "${REPO_ROOT}"

dump_json_file() {
  local json_path="$1"
  local label="$2"
  if [[ ! -f "${json_path}" ]]; then
    return 0
  fi

  echo "[enterprise-ci-local] ${label}: ${json_path}"
  node -e '
const fs = require("fs");
const filePath = process.argv[1];
try {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(content);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log("[enterprise-ci-local] (non-json content)");
  console.log(fs.readFileSync(filePath, "utf8"));
}
' "${json_path}" || true
}

dump_bootstrap_summaries() {
  local found=0
  for summary_path in /tmp/anythingllm-bootstrap-*-summary.json; do
    if [[ -f "${summary_path}" ]]; then
      found=1
      dump_json_file "${summary_path}" "Bootstrap summary"
    fi
  done

  if [[ "${found}" == "0" ]]; then
    echo "[enterprise-ci-local] No bootstrap summary artifacts found in /tmp."
  fi
}

record_stage_result() {
  local stage="$1"
  local status="$2"
  local message="$3"
  node -e '
const fs = require("fs");
const filePath = process.argv[1];
const payload = {
  stage: process.argv[2],
  status: process.argv[3],
  message: process.argv[4],
};
fs.appendFileSync(filePath, JSON.stringify(payload) + "\n");
' "${STAGE_RESULTS_FILE}" "${stage}" "${status}" "${message}" >/dev/null 2>&1 || true
}

write_validation_summary() {
  local summary_dir
  summary_dir="$(dirname "${CI_VALIDATION_SUMMARY_PATH}")"
  mkdir -p "${summary_dir}"

  node -e '
const fs = require("fs");
const stageFile = process.argv[1];
const summaryPath = process.argv[2];
const payload = {
  status: process.argv[3],
  message: process.argv[4],
  currentStage: process.argv[5],
  startedAt: process.argv[6],
  finishedAt: process.argv[7],
  stages: [],
};

if (fs.existsSync(stageFile)) {
  const entries = fs
    .readFileSync(stageFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  payload.stages = entries;
}

fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2));
' "${STAGE_RESULTS_FILE}" \
    "${CI_VALIDATION_SUMMARY_PATH}" \
    "${VALIDATION_STATUS}" \
    "${VALIDATION_MESSAGE}" \
    "${CURRENT_STAGE}" \
    "${STARTED_AT}" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
}

on_exit() {
  write_validation_summary
  rm -f "${STAGE_RESULTS_FILE}" >/dev/null 2>&1 || true
}

trap on_exit EXIT

echo "[enterprise-ci-local] Starting CI-equivalent enterprise validation pipeline."
echo "[enterprise-ci-local] Settings: CI_PORT=${CI_PORT} CI_SMOKE_SUMMARY_PATH=${CI_SMOKE_SUMMARY_PATH} CI_BOOTSTRAP_VALIDATION_BASE_PORT=${CI_BOOTSTRAP_VALIDATION_BASE_PORT} CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH=${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH} CI_VALIDATION_SUMMARY_PATH=${CI_VALIDATION_SUMMARY_PATH} RUN_INSTALL=${RUN_INSTALL} SKIP_OPENAPI_CHECK=${SKIP_OPENAPI_CHECK} SKIP_FRONTEND_BUILD=${SKIP_FRONTEND_BUILD} SKIP_USAGE_CLEANUP_CHECK=${SKIP_USAGE_CLEANUP_CHECK} SKIP_BOOTSTRAP_CHECK=${SKIP_BOOTSTRAP_CHECK} CI_USAGE_RETENTION_DAYS_CHECK=${CI_USAGE_RETENTION_DAYS_CHECK} CI_VALIDATE_USAGE_CLEANUP_NOOP=${CI_VALIDATE_USAGE_CLEANUP_NOOP}"
echo "[enterprise-ci-local] Auth settings: CI_AUTH_TOKEN set=$([[ -n "${CI_AUTH_TOKEN}" ]] && echo "yes" || echo "no"), CI_SINGLE_USER_TOKEN set=$([[ -n "${CI_SINGLE_USER_TOKEN}" ]] && echo "yes" || echo "no")"
if [[ -n "${CI_EXTRA_SMOKE_ARGS}" ]]; then
  echo "[enterprise-ci-local] CI_EXTRA_SMOKE_ARGS=${CI_EXTRA_SMOKE_ARGS}"
fi

if [[ "${RUN_INSTALL}" == "1" ]]; then
  CURRENT_STAGE="dependency-install"
  echo "[enterprise-ci-local] Installing root/server/frontend dependencies."
  if ! yarn install --frozen-lockfile; then
    VALIDATION_MESSAGE="Root dependency installation failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  if ! (cd server && yarn install --frozen-lockfile); then
    VALIDATION_MESSAGE="Server dependency installation failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  if ! (cd frontend && yarn install --frozen-lockfile); then
    VALIDATION_MESSAGE="Frontend dependency installation failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "Installed root/server/frontend dependencies."
else
  record_stage_result "dependency-install" "skipped" "RUN_INSTALL=0"
fi

echo "[enterprise-ci-local] Running enterprise backend test suite."
CURRENT_STAGE="enterprise-tests"
if ! yarn test:enterprise; then
  VALIDATION_MESSAGE="Enterprise backend test suite failed."
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  exit 1
fi
record_stage_result "${CURRENT_STAGE}" "success" "Enterprise backend test suite passed."

CURRENT_STAGE="openapi-check"
if [[ "${SKIP_OPENAPI_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping OpenAPI drift check (SKIP_OPENAPI_CHECK=1)."
  record_stage_result "${CURRENT_STAGE}" "skipped" "SKIP_OPENAPI_CHECK=1"
else
  echo "[enterprise-ci-local] Verifying OpenAPI artifact is current."
  if ! (cd server && yarn swagger && git diff --exit-code -- swagger/openapi.json); then
    VALIDATION_MESSAGE="OpenAPI drift check failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "OpenAPI artifact is current."
fi

CURRENT_STAGE="frontend-build"
if [[ "${SKIP_FRONTEND_BUILD}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping frontend build (SKIP_FRONTEND_BUILD=1)."
  record_stage_result "${CURRENT_STAGE}" "skipped" "SKIP_FRONTEND_BUILD=1"
else
  echo "[enterprise-ci-local] Building frontend."
  if ! (cd frontend && yarn build); then
    VALIDATION_MESSAGE="Frontend build failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "Frontend build succeeded."
fi

echo "[enterprise-ci-local] Running enterprise smoke with CI inputs."
CURRENT_STAGE="enterprise-smoke"
if ! RESET_DB=1 \
  PORT="${CI_PORT}" \
  AUTH_TOKEN="${CI_AUTH_TOKEN}" \
  LOCAL_SINGLE_USER_TOKEN="${CI_SINGLE_USER_TOKEN}" \
  JWT_SECRET="${CI_JWT_SECRET}" \
  SEED_BOOTSTRAP_COLLISION=1 \
  ADMIN_USERNAME="${CI_ADMIN_USERNAME}" \
  ADMIN_PASSWORD="${CI_ADMIN_PASSWORD}" \
  RUN_ID="${CI_RUN_ID}" \
  SMOKE_SUMMARY_PATH="${CI_SMOKE_SUMMARY_PATH}" \
  EXTRA_SMOKE_ARGS="${CI_EXTRA_SMOKE_ARGS}" \
  LOG_PATH="${CI_LOG_PATH}" \
  yarn validate:enterprise:local; then
  VALIDATION_MESSAGE="Enterprise smoke validation failed."
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  echo "[enterprise-ci-local] Smoke run failed. Dumping server log from ${CI_LOG_PATH}."
  dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"
  cat "${CI_LOG_PATH}" || true
  exit 1
fi

SMOKE_SUMMARY_PHASE="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.currentPhase || "");
' "${CI_SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
SMOKE_SUMMARY_REQUEST_COUNT="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(payload.requestCount ?? ""));
' "${CI_SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
SMOKE_SUMMARY_MATRIX_STATUS="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.verificationMatrix?.status || "");
' "${CI_SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
SMOKE_SUMMARY_MATRIX_MISSING="$(
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const missing = Array.isArray(payload.verificationMatrix?.missing)
  ? payload.verificationMatrix.missing
  : [];
process.stdout.write(missing.join(","));
' "${CI_SMOKE_SUMMARY_PATH}" 2>/dev/null || true
)"
if [[ "${SMOKE_SUMMARY_MATRIX_STATUS}" != "pass" ]]; then
  VALIDATION_MESSAGE="Enterprise smoke summary matrix status is not pass (${SMOKE_SUMMARY_MATRIX_STATUS:-<empty>})."
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  echo "[enterprise-ci-local] Smoke summary verificationMatrix status is not pass."
  dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"
  exit 1
fi
SMOKE_STAGE_MESSAGE="Enterprise smoke validation passed (phase=${SMOKE_SUMMARY_PHASE:-<empty>}, requestCount=${SMOKE_SUMMARY_REQUEST_COUNT:-<empty>}, matrix=${SMOKE_SUMMARY_MATRIX_STATUS})"
if [[ -n "${SMOKE_SUMMARY_MATRIX_MISSING}" ]]; then
  SMOKE_STAGE_MESSAGE="${SMOKE_STAGE_MESSAGE}, missing=${SMOKE_SUMMARY_MATRIX_MISSING}"
fi
record_stage_result "${CURRENT_STAGE}" "success" "${SMOKE_STAGE_MESSAGE}"
dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"

CURRENT_STAGE="bootstrap-validation"
if [[ "${SKIP_BOOTSTRAP_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping deployment bootstrap validation (SKIP_BOOTSTRAP_CHECK=1)."
  record_stage_result "${CURRENT_STAGE}" "skipped" "SKIP_BOOTSTRAP_CHECK=1"
else
  echo "[enterprise-ci-local] Running deployment bootstrap validation scenarios."
  if ! BOOTSTRAP_VALIDATION_BASE_PORT="${CI_BOOTSTRAP_VALIDATION_BASE_PORT}" \
    BOOTSTRAP_VALIDATION_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" \
    yarn validate:enterprise:bootstrap-local; then
    VALIDATION_MESSAGE="Bootstrap validation scenarios failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    echo "[enterprise-ci-local] Bootstrap validation failed. Dumping bootstrap summaries."
    dump_json_file "${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" "Bootstrap validation summary"
    dump_bootstrap_summaries
    exit 1
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "Bootstrap validation scenarios passed."
  dump_json_file "${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" "Bootstrap validation summary"
fi

CURRENT_STAGE="usage-cleanup-enabled"
if [[ "${SKIP_USAGE_CLEANUP_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping usage cleanup command check (SKIP_USAGE_CLEANUP_CHECK=1)."
  record_stage_result "${CURRENT_STAGE}" "skipped" "SKIP_USAGE_CLEANUP_CHECK=1"
  record_stage_result "usage-cleanup-noop" "skipped" "SKIP_USAGE_CLEANUP_CHECK=1"
else
  echo "[enterprise-ci-local] Running usage cleanup command check (retention enabled path)."
  if ! USAGE_EVENTS_RETENTION_DAYS="${CI_USAGE_RETENTION_DAYS_CHECK}" yarn usage:cleanup-events; then
    VALIDATION_MESSAGE="Usage cleanup retention-enabled path failed."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    exit 1
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "Usage cleanup retention-enabled path passed."

  CURRENT_STAGE="usage-cleanup-noop"
  if [[ "${CI_VALIDATE_USAGE_CLEANUP_NOOP}" == "1" ]]; then
    echo "[enterprise-ci-local] Running usage cleanup command check (retention disabled/no-op path)."
    if ! USAGE_EVENTS_RETENTION_DAYS="" yarn usage:cleanup-events; then
      VALIDATION_MESSAGE="Usage cleanup retention-disabled/no-op path failed."
      record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
      exit 1
    fi
    record_stage_result "${CURRENT_STAGE}" "success" "Usage cleanup retention-disabled/no-op path passed."
  else
    echo "[enterprise-ci-local] Skipping usage cleanup no-op check (CI_VALIDATE_USAGE_CLEANUP_NOOP=0)."
    record_stage_result "${CURRENT_STAGE}" "skipped" "CI_VALIDATE_USAGE_CLEANUP_NOOP=0"
  fi
fi

VALIDATION_STATUS="success"
VALIDATION_MESSAGE="CI-equivalent enterprise validation succeeded."
write_validation_summary
dump_json_file "${CI_VALIDATION_SUMMARY_PATH}" "CI validation summary"
echo "[enterprise-ci-local] CI-equivalent enterprise validation succeeded."
