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

cd "${SERVER_DIR}"

echo "[enterprise-local-validation] Using BASE_URL=${BASE_URL}"
echo "[enterprise-local-validation] Log file: ${LOG_PATH}"

if [[ "${RESET_DB}" == "1" ]]; then
  echo "[enterprise-local-validation] Resetting SQLite database."
  rm -f "${SERVER_DIR}/storage/anythingllm.db"
fi

echo "[enterprise-local-validation] Applying database migrations."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[enterprise-local-validation] Starting server on port ${PORT}."
AUTH_TOKEN="${AUTH_TOKEN}" JWT_SECRET="${JWT_SECRET}" NODE_ENV=development PORT="${PORT}" node index.js >"${LOG_PATH}" 2>&1 &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" >/dev/null 2>&1 || true' EXIT

echo "[enterprise-local-validation] Waiting for server readiness."
for _ in {1..120}; do
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

echo "[enterprise-local-validation] Running enterprise smoke test."
BASE_URL="${BASE_URL}" AUTH_TOKEN="${AUTH_TOKEN}" JWT_SECRET="${JWT_SECRET}" \
  ./scripts/enterprise-smoke-test.sh --single-user-token "${AUTH_TOKEN}"

echo "[enterprise-local-validation] Enterprise local validation succeeded."
