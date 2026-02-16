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

if [[ "${CI_SINGLE_USER_TOKEN+x}" != "x" ]]; then
  CI_SINGLE_USER_TOKEN="${CI_AUTH_TOKEN}"
fi

cd "${REPO_ROOT}"

echo "[enterprise-ci-local] Starting CI-equivalent enterprise validation pipeline."
echo "[enterprise-ci-local] Settings: CI_PORT=${CI_PORT} CI_SMOKE_SUMMARY_PATH=${CI_SMOKE_SUMMARY_PATH} CI_BOOTSTRAP_VALIDATION_BASE_PORT=${CI_BOOTSTRAP_VALIDATION_BASE_PORT} RUN_INSTALL=${RUN_INSTALL} SKIP_OPENAPI_CHECK=${SKIP_OPENAPI_CHECK} SKIP_FRONTEND_BUILD=${SKIP_FRONTEND_BUILD} SKIP_USAGE_CLEANUP_CHECK=${SKIP_USAGE_CLEANUP_CHECK} SKIP_BOOTSTRAP_CHECK=${SKIP_BOOTSTRAP_CHECK} CI_USAGE_RETENTION_DAYS_CHECK=${CI_USAGE_RETENTION_DAYS_CHECK} CI_VALIDATE_USAGE_CLEANUP_NOOP=${CI_VALIDATE_USAGE_CLEANUP_NOOP}"
echo "[enterprise-ci-local] Auth settings: CI_AUTH_TOKEN set=$([[ -n "${CI_AUTH_TOKEN}" ]] && echo "yes" || echo "no"), CI_SINGLE_USER_TOKEN set=$([[ -n "${CI_SINGLE_USER_TOKEN}" ]] && echo "yes" || echo "no")"
if [[ -n "${CI_EXTRA_SMOKE_ARGS}" ]]; then
  echo "[enterprise-ci-local] CI_EXTRA_SMOKE_ARGS=${CI_EXTRA_SMOKE_ARGS}"
fi

if [[ "${RUN_INSTALL}" == "1" ]]; then
  echo "[enterprise-ci-local] Installing root/server/frontend dependencies."
  yarn install --frozen-lockfile
  (cd server && yarn install --frozen-lockfile)
  (cd frontend && yarn install --frozen-lockfile)
fi

echo "[enterprise-ci-local] Running enterprise backend test suite."
yarn test:enterprise

if [[ "${SKIP_OPENAPI_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping OpenAPI drift check (SKIP_OPENAPI_CHECK=1)."
else
  echo "[enterprise-ci-local] Verifying OpenAPI artifact is current."
  (cd server && yarn swagger && git diff --exit-code -- swagger/openapi.json)
fi

if [[ "${SKIP_FRONTEND_BUILD}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping frontend build (SKIP_FRONTEND_BUILD=1)."
else
  echo "[enterprise-ci-local] Building frontend."
  (cd frontend && yarn build)
fi

echo "[enterprise-ci-local] Running enterprise smoke with CI inputs."
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
  echo "[enterprise-ci-local] Smoke run failed. Dumping server log from ${CI_LOG_PATH}."
  if [[ -f "${CI_SMOKE_SUMMARY_PATH}" ]]; then
    echo "[enterprise-ci-local] Smoke summary:"
    node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(payload, null, 2));
' "${CI_SMOKE_SUMMARY_PATH}" || true
  fi
  cat "${CI_LOG_PATH}" || true
  exit 1
fi

if [[ "${SKIP_BOOTSTRAP_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping deployment bootstrap validation (SKIP_BOOTSTRAP_CHECK=1)."
else
  echo "[enterprise-ci-local] Running deployment bootstrap validation scenarios."
  BOOTSTRAP_VALIDATION_BASE_PORT="${CI_BOOTSTRAP_VALIDATION_BASE_PORT}" yarn validate:enterprise:bootstrap-local
fi

if [[ "${SKIP_USAGE_CLEANUP_CHECK}" == "1" ]]; then
  echo "[enterprise-ci-local] Skipping usage cleanup command check (SKIP_USAGE_CLEANUP_CHECK=1)."
else
  echo "[enterprise-ci-local] Running usage cleanup command check (retention enabled path)."
  USAGE_EVENTS_RETENTION_DAYS="${CI_USAGE_RETENTION_DAYS_CHECK}" yarn usage:cleanup-events

  if [[ "${CI_VALIDATE_USAGE_CLEANUP_NOOP}" == "1" ]]; then
    echo "[enterprise-ci-local] Running usage cleanup command check (retention disabled/no-op path)."
    USAGE_EVENTS_RETENTION_DAYS="" yarn usage:cleanup-events
  else
    echo "[enterprise-ci-local] Skipping usage cleanup no-op check (CI_VALIDATE_USAGE_CLEANUP_NOOP=0)."
  fi
fi

echo "[enterprise-ci-local] CI-equivalent enterprise validation succeeded."
