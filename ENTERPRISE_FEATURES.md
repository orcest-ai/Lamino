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
  server/__tests__/utils/middleware/validApiKey.enterprise.test.js

# api key scope mapping suite includes coverage for:
# - admin/workspace/workspace-thread/openai route families
# - workspace-thread stream/non-stream distinctions (`workspace:chat` vs `workspace:write`)
# - users/system/documents/embed route families
# - unmapped route fallback behavior
# validApiKey middleware suite includes:
# - revoked/expired/missing-scope denial paths
# - no-required-scope pass-through
# - response locals propagation for multi-user mode + api key context
# systemPreferenceAccess helper suite includes:
# - manager enterprise-flag restricted key detection
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
# - admin credential payloads are JSON-escaped so special characters in usernames/passwords are handled safely during login/bootstrap requests
# - bootstrap username seeds are normalized (lowercased, sanitized, length-bounded) before `enable-multi-user` retries to avoid invalid-username edge cases
# - admin login bootstrap guard requires multi-user user context (`user.id`) to avoid treating single-user tokens as admin session tokens
# - smoke fails fast with explicit credential guidance when multi-user mode is already enabled but admin login credentials are invalid
# - bootstrap `enable-multi-user` 400 payload rejections now fail immediately with explicit diagnostics unless the error is a handled username-collision retry
# - default user denied /admin/teams
# - manager user can list/create teams
# - manager user can still update non-enterprise preferences (e.g., `custom_app_name`), persistence is verified, and restoration to the original value is explicitly confirmed; enterprise flag writes are denied with explicit key-level error messages (including multiple direct enterprise keys and `feature_flags` payload updates)
# - default/team user visibility checks assert assigned workspaces are visible and isolated unassigned workspaces are hidden
# - enterprise_teams feature gate disable => /admin/teams denied
# - enterprise_teams flag restore => /admin/teams allowed again
# - enterprise_usage_monitoring gate disable/enable around /admin/usage/overview
# - enterprise_prompt_library gate disable/enable around /admin/prompt-templates
# - enterprise_usage_policies gate disable blocks /admin/usage-policies/new
# - admin:read API key can read /v1/admin/usage/overview
# - admin:read API key can read /v1/admin/prompt-templates and /v1/admin/usage-policies
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
# - API key lifecycle checks include malformed `expiresAt`/`revokedAt` payload rejection assertions with explicit validation messages
# - effective usage-policy endpoints (`/admin` and `/v1/admin`) are validated against malformed `userId`, `workspaceId`, and `teamIds` query payloads and must resolve identically to clean-id inputs
# - policy enforcement matrix includes maxPromptLength, maxTokensPerDay, and maxChatsPerDay denial paths using scoped chat keys
# - usage-policy feature-gate checks include denial assertions for effective-policy routes on both session and `/v1` admin surfaces

# convenience script aliases from repo root
yarn test:enterprise
yarn smoke:enterprise
```

## CI validation workflow

The repository includes an `Enterprise Validation` GitHub Actions workflow that runs on `push` and `pull_request` for the enterprise branch work.

Validation stages:

- install root/server/frontend dependencies
- run `yarn test:enterprise`
- build frontend bundle
- reset `server/storage/anythingllm.db` for deterministic validation state
- run `npx prisma migrate deploy` in `server`
- boot server and run `server/scripts/enterprise-smoke-test.sh`

Workflow reliability safeguards:

- workflow-level concurrency cancellation for stale branch/PR runs
- setup-node yarn dependency caching for faster repeated validation runs
- `/api/ping` readiness polling before smoke execution
- automatic server log dump when smoke validation fails
- CI smoke invocation passes `--single-user-token` explicitly to guarantee deterministic single-user branch validation
- CI smoke invocation supplies an intentionally long/symbol-heavy `RUN_ID` to continuously validate fixture-name normalization safeguards
- CI smoke invocation also uses a deliberately invalid-format `ADMIN_USERNAME` to continuously exercise bootstrap-username seed normalization logic
- smoke bootstrap fallback that retries with a unique admin username if `enable-multi-user` reports username collisions
