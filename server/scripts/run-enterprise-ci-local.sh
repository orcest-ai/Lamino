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
CI_PORT="${CI_PORT:-3001}"
RUN_INSTALL="${RUN_INSTALL:-0}"

cd "${REPO_ROOT}"

echo "[enterprise-ci-local] Starting CI-equivalent enterprise validation pipeline."

if [[ "${RUN_INSTALL}" == "1" ]]; then
  echo "[enterprise-ci-local] Installing root/server/frontend dependencies."
  yarn install --frozen-lockfile
  (cd server && yarn install --frozen-lockfile)
  (cd frontend && yarn install --frozen-lockfile)
fi

echo "[enterprise-ci-local] Running enterprise backend test suite."
yarn test:enterprise

echo "[enterprise-ci-local] Verifying OpenAPI artifact is current."
(cd server && yarn swagger && git diff --exit-code -- swagger/openapi.json)

echo "[enterprise-ci-local] Building frontend."
(cd frontend && yarn build)

echo "[enterprise-ci-local] Running enterprise smoke with CI inputs."
if ! RESET_DB=1 \
  PORT="${CI_PORT}" \
  AUTH_TOKEN="${CI_AUTH_TOKEN}" \
  JWT_SECRET="${CI_JWT_SECRET}" \
  SEED_BOOTSTRAP_COLLISION=1 \
  ADMIN_USERNAME="${CI_ADMIN_USERNAME}" \
  ADMIN_PASSWORD="${CI_ADMIN_PASSWORD}" \
  RUN_ID="${CI_RUN_ID}" \
  LOG_PATH="${CI_LOG_PATH}" \
  yarn validate:enterprise:local; then
  echo "[enterprise-ci-local] Smoke run failed. Dumping server log from ${CI_LOG_PATH}."
  cat "${CI_LOG_PATH}" || true
  exit 1
fi

echo "[enterprise-ci-local] CI-equivalent enterprise validation succeeded."
