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
SMOKE_METADATA_STATUS=""
SMOKE_METADATA_PHASE=""
SMOKE_METADATA_REQUEST_COUNT=""
SMOKE_METADATA_MATRIX_STATUS=""
SMOKE_METADATA_MATRIX_MISSING=""
SMOKE_METADATA_REQUIRED_COUNT=""
SMOKE_METADATA_PASSED_COUNT=""
SMOKE_METADATA_SUMMARY_PATH=""
BOOTSTRAP_METADATA_STATUS=""
BOOTSTRAP_METADATA_SCENARIO_COUNT=""
BOOTSTRAP_METADATA_FAILED_SCENARIOS=""
BOOTSTRAP_METADATA_SUMMARY_PATH=""

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
  artifacts: {},
};

const parseOptionalInt = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
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

const smokeSummaryPath = process.argv[8];
const smokeStatus = process.argv[9];
const smokePhase = process.argv[10];
const smokeRequestCount = parseOptionalInt(process.argv[11]);
const smokeMatrixStatus = process.argv[12];
const smokeMatrixMissing = (process.argv[13] || "").split(",").filter(Boolean);
const smokeMatrixRequired = parseOptionalInt(process.argv[14]);
const smokeMatrixPassed = parseOptionalInt(process.argv[15]);
const hasSmokeArtifact = [
  smokeSummaryPath,
  smokeStatus,
  smokePhase,
  smokeMatrixStatus,
  String(smokeRequestCount ?? ""),
].some(Boolean);

if (hasSmokeArtifact) {
  payload.artifacts.smoke = {
    summaryPath: smokeSummaryPath || null,
    status: smokeStatus || null,
    phase: smokePhase || null,
    requestCount: smokeRequestCount,
    verificationMatrixStatus: smokeMatrixStatus || null,
    verificationMatrixMissing: smokeMatrixMissing,
    verificationMatrixRequiredCount: smokeMatrixRequired,
    verificationMatrixPassedCount: smokeMatrixPassed,
  };
}

const bootstrapSummaryPath = process.argv[16];
const bootstrapStatus = process.argv[17];
const bootstrapScenarioCount = parseOptionalInt(process.argv[18]);
const bootstrapFailedScenarios = (process.argv[19] || "").split(",").filter(Boolean);
const hasBootstrapArtifact = [
  bootstrapSummaryPath,
  bootstrapStatus,
  String(bootstrapScenarioCount ?? ""),
].some(Boolean);

if (hasBootstrapArtifact) {
  payload.artifacts.bootstrap = {
    summaryPath: bootstrapSummaryPath || null,
    status: bootstrapStatus || null,
    scenarioCount: bootstrapScenarioCount,
    failedScenarios: bootstrapFailedScenarios,
  };
}

fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2));
' "${STAGE_RESULTS_FILE}" \
    "${CI_VALIDATION_SUMMARY_PATH}" \
    "${VALIDATION_STATUS}" \
    "${VALIDATION_MESSAGE}" \
    "${CURRENT_STAGE}" \
    "${STARTED_AT}" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${SMOKE_METADATA_SUMMARY_PATH}" \
    "${SMOKE_METADATA_STATUS}" \
    "${SMOKE_METADATA_PHASE}" \
    "${SMOKE_METADATA_REQUEST_COUNT}" \
    "${SMOKE_METADATA_MATRIX_STATUS}" \
    "${SMOKE_METADATA_MATRIX_MISSING}" \
    "${SMOKE_METADATA_REQUIRED_COUNT}" \
    "${SMOKE_METADATA_PASSED_COUNT}" \
    "${BOOTSTRAP_METADATA_SUMMARY_PATH}" \
    "${BOOTSTRAP_METADATA_STATUS}" \
    "${BOOTSTRAP_METADATA_SCENARIO_COUNT}" \
    "${BOOTSTRAP_METADATA_FAILED_SCENARIOS}" || true
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
  SMOKE_METADATA_STATUS="failed"
  SMOKE_METADATA_SUMMARY_PATH="${CI_SMOKE_SUMMARY_PATH}"
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  echo "[enterprise-ci-local] Smoke run failed. Dumping server log from ${CI_LOG_PATH}."
  dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"
  cat "${CI_LOG_PATH}" || true
  exit 1
fi
SMOKE_METADATA_SUMMARY_PATH="${CI_SMOKE_SUMMARY_PATH}"

mapfile -t SMOKE_METADATA_LINES < <(node -e '
const fs = require("fs");
const emit = (value) => console.log(String(value ?? "").replace(/\r?\n/g, " "));
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const required = Array.isArray(payload.verificationMatrix?.required)
    ? payload.verificationMatrix.required
    : [];
  const passed = Array.isArray(payload.verificationMatrix?.passed)
    ? payload.verificationMatrix.passed
    : [];
  const missing = Array.isArray(payload.verificationMatrix?.missing)
    ? payload.verificationMatrix.missing
    : [];
  emit(payload.status || "");
  emit(payload.currentPhase || "");
  emit(String(payload.requestCount ?? ""));
  emit(payload.verificationMatrix?.status || "");
  emit(missing.join(","));
  emit(String(required.length));
  emit(String(passed.length));
} catch {
  emit("");
  emit("");
  emit("");
  emit("");
  emit("");
  emit("");
  emit("");
}
' "${CI_SMOKE_SUMMARY_PATH}" 2>/dev/null)
SMOKE_METADATA_STATUS="${SMOKE_METADATA_LINES[0]:-}"
SMOKE_METADATA_PHASE="${SMOKE_METADATA_LINES[1]:-}"
SMOKE_METADATA_REQUEST_COUNT="${SMOKE_METADATA_LINES[2]:-}"
SMOKE_METADATA_MATRIX_STATUS="${SMOKE_METADATA_LINES[3]:-}"
SMOKE_METADATA_MATRIX_MISSING="${SMOKE_METADATA_LINES[4]:-}"
SMOKE_METADATA_REQUIRED_COUNT="${SMOKE_METADATA_LINES[5]:-}"
SMOKE_METADATA_PASSED_COUNT="${SMOKE_METADATA_LINES[6]:-}"

if [[ "${SMOKE_METADATA_STATUS}" != "success" ]]; then
  VALIDATION_MESSAGE="Enterprise smoke summary status is not success (${SMOKE_METADATA_STATUS:-<empty>})."
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  echo "[enterprise-ci-local] Smoke summary status is not success."
  dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"
  exit 1
fi
if [[ "${SMOKE_METADATA_MATRIX_STATUS}" != "pass" ]]; then
  VALIDATION_MESSAGE="Enterprise smoke summary matrix status is not pass (${SMOKE_METADATA_MATRIX_STATUS:-<empty>})."
  record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
  echo "[enterprise-ci-local] Smoke summary verificationMatrix status is not pass."
  dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"
  exit 1
fi
SMOKE_STAGE_MESSAGE="Enterprise smoke validation passed (phase=${SMOKE_METADATA_PHASE:-<empty>}, requestCount=${SMOKE_METADATA_REQUEST_COUNT:-<empty>}, matrix=${SMOKE_METADATA_MATRIX_STATUS:-<empty>}, matrixChecks=${SMOKE_METADATA_PASSED_COUNT:-<empty>}/${SMOKE_METADATA_REQUIRED_COUNT:-<empty>})"
if [[ -n "${SMOKE_METADATA_MATRIX_MISSING}" ]]; then
  SMOKE_STAGE_MESSAGE="${SMOKE_STAGE_MESSAGE}, missing=${SMOKE_METADATA_MATRIX_MISSING}"
fi
record_stage_result "${CURRENT_STAGE}" "success" "${SMOKE_STAGE_MESSAGE}"
dump_json_file "${CI_SMOKE_SUMMARY_PATH}" "Smoke summary"

CURRENT_STAGE="bootstrap-validation"
if [[ "${SKIP_BOOTSTRAP_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping deployment bootstrap validation (SKIP_BOOTSTRAP_CHECK=1)."
  BOOTSTRAP_METADATA_STATUS="skipped"
  BOOTSTRAP_METADATA_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}"
  record_stage_result "${CURRENT_STAGE}" "skipped" "SKIP_BOOTSTRAP_CHECK=1"
else
  echo "[enterprise-ci-local] Running deployment bootstrap validation scenarios."
  if ! BOOTSTRAP_VALIDATION_BASE_PORT="${CI_BOOTSTRAP_VALIDATION_BASE_PORT}" \
    BOOTSTRAP_VALIDATION_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" \
    yarn validate:enterprise:bootstrap-local; then
    VALIDATION_MESSAGE="Bootstrap validation scenarios failed."
    BOOTSTRAP_METADATA_STATUS="failed"
    BOOTSTRAP_METADATA_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}"
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    echo "[enterprise-ci-local] Bootstrap validation failed. Dumping bootstrap summaries."
    dump_json_file "${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" "Bootstrap validation summary"
    dump_bootstrap_summaries
    exit 1
  fi
  BOOTSTRAP_METADATA_SUMMARY_PATH="${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}"
  mapfile -t BOOTSTRAP_METADATA_LINES < <(node -e '
const fs = require("fs");
const emit = (value) => console.log(String(value ?? "").replace(/\r?\n/g, " "));
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
  const failed = scenarios
    .filter((scenario) => scenario?.status && scenario.status !== "success")
    .map((scenario) => scenario?.name)
    .filter(Boolean);
  emit(payload.status || "");
  emit(String(scenarios.length));
  emit(failed.join(","));
} catch {
  emit("");
  emit("");
  emit("");
}
' "${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" 2>/dev/null)
  BOOTSTRAP_METADATA_STATUS="${BOOTSTRAP_METADATA_LINES[0]:-}"
  BOOTSTRAP_METADATA_SCENARIO_COUNT="${BOOTSTRAP_METADATA_LINES[1]:-}"
  BOOTSTRAP_METADATA_FAILED_SCENARIOS="${BOOTSTRAP_METADATA_LINES[2]:-}"
  if [[ "${BOOTSTRAP_METADATA_STATUS}" != "success" ]]; then
    VALIDATION_MESSAGE="Bootstrap validation summary status is not success (${BOOTSTRAP_METADATA_STATUS:-<empty>})."
    record_stage_result "${CURRENT_STAGE}" "failed" "${VALIDATION_MESSAGE}"
    echo "[enterprise-ci-local] Bootstrap summary status is not success."
    dump_json_file "${CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH}" "Bootstrap validation summary"
    exit 1
  fi
  BOOTSTRAP_STAGE_MESSAGE="Bootstrap validation scenarios passed"
  if [[ -n "${BOOTSTRAP_METADATA_SCENARIO_COUNT}" ]]; then
    BOOTSTRAP_STAGE_MESSAGE="${BOOTSTRAP_STAGE_MESSAGE} (scenarios=${BOOTSTRAP_METADATA_SCENARIO_COUNT})"
  fi
  if [[ -n "${BOOTSTRAP_METADATA_FAILED_SCENARIOS}" ]]; then
    BOOTSTRAP_STAGE_MESSAGE="${BOOTSTRAP_STAGE_MESSAGE}, failed=${BOOTSTRAP_METADATA_FAILED_SCENARIOS}"
  fi
  record_stage_result "${CURRENT_STAGE}" "success" "${BOOTSTRAP_STAGE_MESSAGE}"
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
