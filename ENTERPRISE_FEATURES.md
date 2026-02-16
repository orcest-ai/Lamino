# Enterprise Features Guide

This repository includes an additive enterprise layer for team and commercial operation.

## Included modules

1. **Team Management**
   - Teams, memberships, and team-to-workspace assignments
   - Team detail/read endpoints for access-map automation:
     - `/api/v1/admin/teams/:teamId`
     - `/api/v1/admin/teams/:teamId/members`
     - `/api/v1/admin/teams/:teamId/workspaces`
     - `/api/v1/admin/teams/:teamId/access-map`
   - Endpoints:
     - Session API: `/api/admin/teams*`
     - Developer API: `/api/v1/admin/teams*`

2. **Prompt Engineering Library**
   - Prompt templates, version history, approval/publish, and apply-to-workspace
   - Endpoints:
     - Session API: `/api/admin/prompt-templates*`
     - Developer API: `/api/v1/admin/prompt-templates*`

3. **Usage Monitoring**
   - Normalized `usage_events` capture from workspace/embed chat persistence
   - Metric sanitization guards convert malformed numeric usage values to safe defaults and clamp negative values before persistence
   - Identifier/timestamp sanitization guards normalize malformed, decimal, or non-positive ids to `null` and invalid `occurredAt` values to safe current timestamps
  - Usage analytics query filters sanitize invalid/blank values, require positive integer IDs, accept only string primitive provider/model/eventType filters, safely parse date-like primitives, and bound day-window inputs to sane limits
   - Inverted `from/to` query windows are normalized to a valid chronological range
   - Overview, timeseries, breakdown, and CSV export APIs
   - Endpoints:
     - Session API: `/api/admin/usage/*`
     - Developer API: `/api/v1/admin/usage/*`

4. **Usage Policy Engine**
   - Scoped policy CRUD (`system`, `team`, `workspace`, `user`)
   - Policy payload normalization sanitizes malformed/decimal/non-positive ids and malformed/decimal priority + boolean fields to stable safe defaults
   - Unrecognized string values for `enabled` now fall back to safe defaults instead of being coerced truthy
   - Effective-policy queries sanitize `userId`, `workspaceId`, and `teamIds` inputs (drops invalid/decimal/non-positive values) and dedupe normalized team IDs at resolver boundaries
   - Chat-policy limit parsing now enforces only strict positive integer limits (invalid/blank/decimal/zero/negative values are ignored instead of causing accidental quota locks)
   - Effective policy resolution and chat preflight enforcement
   - Endpoints:
     - Session API: `/api/admin/usage-policies*`
     - Developer API: `/api/v1/admin/usage-policies*`

5. **Commercial API Key Controls**
   - Scoped keys, expiry, revocation support, and route-level scope enforcement
   - Invalid/malformed key expiry timestamps are treated as expired for fail-safe access control
   - API key create/update payloads validate date fields (`expiresAt`, `revokedAt`) and reject malformed datetime values
   - Session API:
     - `/api/admin/generate-api-key`
     - `/api/admin/api-keys/:id`
     - `/api/admin/delete-api-key/:id`
   - Developer API:
     - `/api/v1/admin/generate-api-key`
     - `/api/v1/admin/api-keys`
     - `/api/v1/admin/api-keys/:id`

## Enterprise feature flags

Feature gates are controlled via `system_settings` and exposed in `feature_flags`:

- `enterprise_teams`
- `enterprise_prompt_library`
- `enterprise_usage_monitoring`
- `enterprise_usage_policies`

When disabled:

- gated routes return `403`
- enterprise navigation items are hidden in the admin sidebar
- usage policy enforcement is bypassed if `enterprise_usage_policies` is disabled
- manager-role updates to enterprise feature-flag settings are denied (`/admin/system-preferences` is admin-only for enterprise flag keys)

## Migration and compatibility notes

- New schema is additive and backward-compatible with existing single-user and multi-user operation.
- New migration:
  - `server/prisma/migrations/20260215174500_enterprise_foundations/migration.sql`
- Existing workspace direct membership access remains intact.
- Team membership is an additional access path for default users.
- Usage policy defaults remain non-blocking unless explicitly configured:
  - if no matching policy defines a limit, requests are allowed.
- Usage-event growth can be managed with optional retention:
  - set `USAGE_EVENTS_RETENTION_DAYS=<positive-integer>` to enable daily background pruning of older `usage_events` rows.
  - unset/invalid values disable retention cleanup safely.
  - optional one-off cleanup can be triggered with `yarn usage:cleanup-events` (respects `USAGE_EVENTS_RETENTION_DAYS`).
  - example one-off execution:
    - `USAGE_EVENTS_RETENTION_DAYS=30 yarn usage:cleanup-events`

## Validation checklist

Useful verification commands:

```bash
# backend targeted tests
yarn test \
  server/__tests__/models/teamMembers.test.js \
  server/__tests__/models/promptTemplateVersion.test.js \
  server/__tests__/models/usagePolicies.test.js \
  server/__tests__/models/usageEvents.test.js \
  server/__tests__/models/apiKeys.enterprise.test.js \
  server/__tests__/utils/helpers/usageFilters.test.js \
  server/__tests__/utils/helpers/systemPreferenceAccess.test.js \
  server/__tests__/utils/policies/chatPolicy.test.js \
  server/__tests__/utils/middleware/featureGate.test.js \
  server/__tests__/utils/middleware/validApiKey.enterprise.test.js \
  server/__tests__/utils/middleware/multiUserProtected.enterprise.test.js \
  server/__tests__/utils/backgroundWorkers.enterprise.test.js \
  server/__tests__/jobs/helpers.enterprise.test.js \
  server/__tests__/jobs/cleanupUsageEvents.enterprise.test.js

# api key scope mapping suite includes coverage for:
# - admin/workspace/workspace-thread/openai route families
# - prompt-template version/apply + usage-policy effective nested admin route variants
# - workspace-thread stream/non-stream distinctions (`workspace:chat` vs `workspace:write`)
# - users/system/auth/documents/embed route families
# - unmapped route fallback behavior
# validApiKey middleware suite includes:
# - revoked/expired/missing-scope denial paths
# - no-required-scope pass-through
# - response locals propagation for multi-user mode + api key context
# background worker suite includes:
# - usage-event retention env parsing/validation
# - conditional scheduling for usage-event cleanup + document-sync jobs
# job helper suite includes:
# - standalone direct-run logging fallback when `process.send` is unavailable
# - child-process logging path when `process.send` is present
# cleanup usage-events job suite includes:
# - disabled-retention no-op behavior
# - standalone `NODE_ENV` fallback behavior for direct CLI execution
# - successful prune logging path
# - prune error logging path
# - unexpected exception logging + conclude path
# multiUserProtected middleware suite includes:
# - strict/flex role gate behavior across enabled/disabled multi-user mode
# - default strict/flex role tuple includes both admin and manager access paths
# - explicit `<all>` bypass behavior and unresolved-session denial paths
# - deterministic `401` denial behavior for role-mismatched admin routes
# - setup guard behavior (`isMultiUserSetup`) when multi-user mode is disabled
# systemPreferenceAccess helper suite includes:
# - manager enterprise-flag restricted key detection
# - manager-only access error generation for restricted keys
# - malformed payload handling and restricted-key matrix stability checks
# chatPolicy suite includes:
# - provider/model denylist enforcement
# - prompt-length, max-chats/day, max-tokens/day enforcement paths
# - feature-gate bypass behavior when enterprise usage policies are disabled

# frontend compile + route validation
cd frontend && yarn build

# regenerate OpenAPI spec
cd server && yarn swagger

# full enterprise API smoke test (requires running server)
cd server && ./scripts/enterprise-smoke-test.sh

# smoke script now includes role matrix assertions:
# - API /ping readiness retry loop before executing checks
# - when multi-user is disabled and AUTH_TOKEN is available, single-user login path is verified (invalid token denied, valid token accepted) before bootstrap
# - smoke supports explicit `--single-user-token`/`SINGLE_USER_AUTH_TOKEN` input so CI can always validate the single-user auth branch deterministically
# - generated smoke fixture names now normalize/truncate (and lowercase where needed) run-id suffixes to keep username/workspace/team payloads within backend validation limits even with long custom run ids
# - fixture-name invariant guards now assert max-length and username-shape constraints before API calls so regressions fail fast with clear diagnostics
# - admin credential payloads are JSON-escaped so special characters in usernames/passwords are handled safely during login/bootstrap requests
# - bootstrap username seeds are normalized (lowercased, sanitized, length-bounded) before `enable-multi-user` retries to avoid invalid-username edge cases
# - bootstrap username collisions now retry through bounded fallback attempts (`RUN_ID` suffix, then timestamp/random suffixes) before fail-fast exit
# - admin login bootstrap guard requires multi-user user context (`user.id`) to avoid treating single-user tokens as admin session tokens
# - smoke fails fast with explicit credential guidance when multi-user mode is already enabled but admin login credentials are invalid
# - bootstrap `enable-multi-user` 400 payload rejections now fail immediately with explicit diagnostics unless the error is a handled username-collision retry
# - default user denied /admin/teams list/detail/create/update/delete, member/workspace/access-map reads, and member/workspace update writes
# - default user denied `/admin/system-preferences` reads/writes
# - default user denied usage monitoring and usage policy admin reads/writes (`/admin/usage/overview`, `/admin/usage/timeseries`, `/admin/usage/breakdown`, `/admin/usage/export.csv`, `/admin/usage-policies`, `/admin/usage-policies/effective`, `/admin/usage-policies/new`, `/admin/usage-policies/:id` update/delete), including manager-created policy resources
# - default user denied prompt template admin reads/writes (`/admin/prompt-templates`, `/admin/prompt-templates/new`, `/admin/prompt-templates/:templateId` update/delete, version read/create/approve routes, and apply-to-workspace route), including manager-created template resources
# - default user denied admin API-key routes with strict role-auth status checks (`401`) (e.g., `/admin/api-keys`, `/admin/generate-api-key`, `/admin/api-keys/:id` update, and `/admin/delete-api-key/:id` delete)
# - manager user can list/create/update/delete teams, update team member/workspace assignments, read team detail/member/workspace/access-map surfaces, read usage monitoring + usage policy/effective endpoints, create/update/delete usage policies (update + delete persistence verified), run prompt-template lifecycle flows (create/update/delete template + version create/approve + apply-to-workspace with workspace prompt persistence verification and template-name update/delete persistence checks), and read system preferences
# - manager user is denied admin-only api key management routes with strict role-auth status checks (`401`) (e.g., `/admin/api-keys`, `/admin/generate-api-key`, `/admin/api-keys/:id` update, and `/admin/delete-api-key/:id` delete)
# - manager user can still update non-enterprise preferences (e.g., `custom_app_name`), persistence is verified, and restoration to the original value is explicitly confirmed; enterprise flag writes are denied with explicit key-level error messages across all direct enterprise keys (`enterprise_teams`, `enterprise_prompt_library`, `enterprise_usage_monitoring`, `enterprise_usage_policies`) and `feature_flags` payload updates, and admin checks confirm enterprise feature-flag values remain unchanged after denied manager attempts
# - default/team user visibility checks assert assigned workspaces are visible and isolated unassigned workspaces are hidden
# - enterprise_teams feature gate disable => /admin/teams denied
# - enterprise_teams flag restore => /admin/teams allowed again
# - enterprise_usage_monitoring gate disable/enable around /admin/usage/overview
# - enterprise_prompt_library gate disable/enable around /admin/prompt-templates
# - enterprise_usage_policies gate disable blocks /admin/usage-policies/new
# - admin:read API key can read /v1/admin/usage/overview
# - admin:read API key can read /v1/admin/prompt-templates and /v1/admin/usage-policies
# - auth:read API key can read `/v1/auth`; cross-scope denials are asserted (`admin:read` denied on `/v1/auth`, `auth:read` denied on `/v1/admin/teams`) with scope-hint validation in error payloads
# - wildcard (`*`) API key default-scope compatibility is validated across both `/v1/auth` and `/v1/admin/teams`, including admin write/delete lifecycle checks
# - developer `/v1/admin/*` routes are re-checked against each enterprise feature gate (teams, monitoring, prompt library, policies) with admin:read API keys
# - usage monitoring checks include timeseries, breakdown, and CSV export on both session and /v1 admin routes
# - usage dashboard freshness checks verify filtered overview totals increase after probe event insertion
# - usage breakdown validation checks include invalid `by` field rejection on both session and /v1 admin routes
# - admin:read key denial checks include write attempts to team, prompt-template, and usage-policy create routes
# - prompt template lifecycle checks include create + apply-to-workspace + v1 versions-read validation
# - usage overview checks include inverted `from/to` range handling on both session and /v1 admin routes
# - prompt apply checks include post-apply workspace prompt verification and admin:read denial on v1 api-key update
# - workspace:chat key denial checks include access attempts to admin-read routes (scope boundary validation)
# - API key lifecycle checks include explicit expired-key and revoked-key denial assertions
# - revoked-key lifecycle checks cover `/v1/admin/*` (read + write) and `/v1/auth` surfaces for admin:read, auth:read, and wildcard (`*`) keys
# - API key lifecycle checks include malformed `expiresAt`/`revokedAt` payload rejection assertions with explicit validation messages
# - effective usage-policy endpoints (`/admin` and `/v1/admin`) are validated against malformed `userId`, `workspaceId`, and `teamIds` query payloads and must resolve identically to clean-id inputs
# - policy enforcement matrix includes maxPromptLength, maxTokensPerDay, and maxChatsPerDay denial paths using scoped chat keys
# - usage-policy feature-gate checks include denial assertions for effective-policy routes on both session and `/v1` admin surfaces

# convenience script aliases from repo root
yarn test:enterprise
yarn smoke:enterprise
yarn usage:cleanup-events
yarn validate:enterprise:bootstrap-local
yarn validate:enterprise:local
yarn validate:enterprise:ci-local
```

## Manual verification matrix (phase-9 closure)

The matrix below captures the required manual (terminal-driven) verification paths and their concrete assertions.

| Matrix item | Verification path | Expected / enforced result |
| --- | --- | --- |
| single-user mode | Smoke starts from `multi_user_mode=false` with `AUTH_TOKEN` present, validates `/request-token` invalid+valid password behavior before bootstrap | Invalid token denied (`401`), valid token accepted (`200`) with token payload |
| multi-user mode admin/manager/default | Smoke bootstraps or logs in, creates `admin`/`manager`/`default` actors, then runs role-scoped endpoint matrix | `admin` succeeds on admin APIs; `manager` succeeds on allowed team/prompt/policy/usage reads+writes; `default` receives strict denials (`401`) on admin surfaces |
| team-assigned workspace visibility | Smoke creates assigned and isolated workspaces, maps team members, then lists as default user | Assigned workspace visible, isolated workspace hidden |
| policy enforcement paths | Smoke creates scoped policies and performs chat calls with scoped chat key | deterministic policy denials for prompt length, daily token quota, and daily chat quota with explicit error messages |
| scoped API key failures/successes | Smoke creates `workspace:chat`, `admin:read`, and `auth:read` keys and exercises cross-scope calls | scoped allow on matching endpoints; explicit `403` denials + required-scope hints on cross-scope access |
| usage dashboard data freshness | Smoke injects probe usage events and queries overview/timeseries/breakdown/export across session + `/v1` routes | usage totals and breakdown payloads include fresh probe data; CSV exports include expected headers |

Recommended deterministic execution command (clean-db):

```bash
yarn validate:enterprise:local
```

CI-equivalent end-to-end local replay:

```bash
yarn validate:enterprise:ci-local
```

For faster iterative local debugging (non-CI), the CI-local runner supports optional skips:

```bash
SKIP_OPENAPI_CHECK=1 SKIP_FRONTEND_BUILD=1 SKIP_USAGE_CLEANUP_CHECK=1 SKIP_BOOTSTRAP_CHECK=1 yarn validate:enterprise:ci-local
```

CI-local runner environment controls:

- `RUN_INSTALL=1` → install root/server/frontend dependencies before validation.
- `CI_PORT=<port>` → override CI-local smoke server port (defaults to `3101` locally).
- `CI_VALIDATION_SUMMARY_PATH=<path>` → override CI-local aggregate validation summary JSON output path (defaults to `/tmp/anythingllm-enterprise-ci-validation-summary.json`).
- `CI_SMOKE_SUMMARY_PATH=<path>` → override smoke summary JSON output path for nested local validator (defaults to `/tmp/anythingllm-enterprise-ci-smoke-summary.json`).
- `CI_BOOTSTRAP_VALIDATION_BASE_PORT=<port>` → set deterministic base port for bootstrap validator scenarios (defaults to `4201`; uses `base`, `base+1`, `base+2`, `base+3`).
- `CI_BOOTSTRAP_VALIDATION_SUMMARY_PATH=<path>` → override aggregate bootstrap-validation summary JSON output path (defaults to `/tmp/anythingllm-bootstrap-validation-summary.json`).
- `SKIP_OPENAPI_CHECK=1` → skip OpenAPI regeneration drift gate.
- `SKIP_FRONTEND_BUILD=1` → skip frontend production build step.
- `SKIP_USAGE_CLEANUP_CHECK=1` → skip one-off usage cleanup command validation.
- `SKIP_BOOTSTRAP_CHECK=1` → skip deployment bootstrap validation scenarios.
- `CI_USAGE_RETENTION_DAYS_CHECK=<days>` → override retention days used for cleanup-command check (defaults to `1`).
- `CI_VALIDATE_USAGE_CLEANUP_NOOP=0` → skip the additional retention-disabled/no-op cleanup validation path.
- `CI_SINGLE_USER_TOKEN="..."` → override the nested local validator single-user token (defaults to `CI_AUTH_TOKEN`).
- `CI_EXTRA_SMOKE_ARGS="..."` → append extra smoke-test CLI flags for the nested local validator invocation.

Local validator runner controls:

- `LOCAL_SINGLE_USER_TOKEN=""` → skip explicit single-user auth preflight while still running full smoke/bootstrap coverage.
- `ALLOW_PORT_REUSE=1` → intentionally reuse an already-running API server on the selected port (default guard fails fast to avoid false-positive runs against stale processes).
- `SMOKE_SUMMARY_PATH=<path>` → override smoke summary JSON output path (defaults to `/tmp/anythingllm-enterprise-smoke-summary-<port>.json`).
- `EXTRA_SMOKE_ARGS="..."` → append extra CLI flags to `enterprise-smoke-test.sh` (for targeted reproductions).

To fully mirror fresh CI dependency installation locally:

```bash
RUN_INSTALL=1 yarn validate:enterprise:ci-local
```

## CI validation workflow

The repository includes an `Enterprise Validation` GitHub Actions workflow that runs on `push` and `pull_request` for the enterprise branch work.

Validation stages:

- install root/server/frontend dependencies
- run one-command CI-equivalent validator (`yarn validate:enterprise:ci-local`) with CI-specific env (enterprise tests + OpenAPI drift check + frontend build + deterministic smoke reset/migrate/collision-seeding)
- CI-equivalent validator runs deployment bootstrap validation (`yarn validate:enterprise:bootstrap-local`) across auth-protected + open + username-collision-retry + missing-token-hint scenarios (unless `SKIP_BOOTSTRAP_CHECK=1`)
- CI-equivalent validator also runs one-off usage cleanup command checks (`yarn usage:cleanup-events`) for:
  - retention-enabled path (`CI_USAGE_RETENTION_DAYS_CHECK`)
  - retention-disabled/no-op path (unless `CI_VALIDATE_USAGE_CLEANUP_NOOP=0`)

Workflow reliability safeguards:

- workflow-level concurrency cancellation for stale branch/PR runs
- setup-node yarn dependency caching for faster repeated validation runs
- `/api/ping` readiness polling before smoke execution
- automatic server log dump when smoke validation fails
- smoke run emits structured JSON summary (`SMOKE_SUMMARY_PATH` / `CI_SMOKE_SUMMARY_PATH`) and failure paths print it for fast triage
- smoke summary includes phase telemetry (`currentPhase`, `phaseHistory`), `requestCount`, and `verificationMatrix` (`required`/`passed`/`missing`) to pinpoint where failures occurred
- CI aggregate validation summary (`CI_VALIDATION_SUMMARY_PATH`) records smoke stage telemetry (`phase`, `requestCount`, `verificationMatrix.status`) in stage messages
- CI aggregate validation summary also emits structured `artifacts.smoke` / `artifacts.bootstrap` metadata (summary path, status, and counters) for downstream automation
- local validator enforces smoke summary invariants (`status=success`, `currentPhase=completed`, `requestCount>0`), required matrix-phase coverage in `phaseHistory`, and `verificationMatrix.status=pass` before reporting success (including `single-user` checks only when smoke starts from `multi_user_mode=false`)
- local/CI validator scripts also dump server logs automatically on smoke failures for faster diagnosis
- GitHub workflow uploads validation diagnostics (`/tmp/anythingllm-server.log`, CI aggregate validation summary, smoke summary, bootstrap validation summary, bootstrap scenario summaries/logs) as run artifacts (`enterprise-validation-artifacts`)
- GitHub workflow failure handler also prints server log + CI/smoke/bootstrap summaries inline in run logs before exit
- CI smoke invocation passes `--single-user-token` explicitly to guarantee deterministic single-user branch validation
- CI smoke invocation supplies an intentionally long/symbol-heavy `RUN_ID` to continuously validate fixture-name normalization safeguards
- CI smoke invocation also uses a deliberately invalid-format `ADMIN_USERNAME` to continuously exercise bootstrap-username seed normalization logic
- CI validator runs with `SEED_BOOTSTRAP_COLLISION=1`, which seeds collision fixture usernames (`seed` + first retry candidate) before smoke execution so bootstrap collision retries are exercised every run
- CI validator explicitly sets `CI_USAGE_RETENTION_DAYS_CHECK=1` so one-off usage cleanup command validation is deterministic across runs
- CI validator explicitly sets `CI_VALIDATE_USAGE_CLEANUP_NOOP=1` so retention-disabled/no-op cleanup behavior is also validated on every run
- smoke bootstrap fallback retries `enable-multi-user` with progressively unique normalized usernames (run-id based, then timestamp/random fallback) when username-collision errors are returned
