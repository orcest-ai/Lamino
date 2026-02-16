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
if [[ -n "${EXTRA_SMOKE_ARGS}" ]]; then
  echo "[enterprise-local-validation] EXTRA_SMOKE_ARGS=${EXTRA_SMOKE_ARGS}"
fi
if [[ -n "${LOCAL_SINGLE_USER_TOKEN}" ]]; then
  echo "[enterprise-local-validation] single-user auth preflight: enabled"
else
  echo "[enterprise-local-validation] single-user auth preflight: skipped"
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
SMOKE_ARGS=()
if [[ -n "${LOCAL_SINGLE_USER_TOKEN}" ]]; then
  SMOKE_ARGS+=(--single-user-token "${LOCAL_SINGLE_USER_TOKEN}")
fi
if [[ -n "${EXTRA_SMOKE_ARGS}" ]]; then
  # shellcheck disable=SC2206
  EXTRA_ARGS_ARRAY=(${EXTRA_SMOKE_ARGS})
  SMOKE_ARGS+=("${EXTRA_ARGS_ARRAY[@]}")
fi

if ! BASE_URL="${BASE_URL}" SINGLE_USER_AUTH_TOKEN="${LOCAL_SINGLE_USER_TOKEN}" JWT_SECRET="${JWT_SECRET}" \
  ADMIN_USERNAME="${ADMIN_USERNAME}" ADMIN_PASSWORD="${ADMIN_PASSWORD}" RUN_ID="${RUN_ID}" \
  ./scripts/enterprise-smoke-test.sh "${SMOKE_ARGS[@]}"; then
  echo "[enterprise-local-validation] Enterprise smoke failed. Dumping server log from ${LOG_PATH}."
  cat "${LOG_PATH}" || true
  exit 1
fi

echo "[enterprise-local-validation] Enterprise local validation succeeded."
