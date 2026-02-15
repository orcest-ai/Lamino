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
   - Usage analytics query filters sanitize invalid/blank values and require positive integer IDs
   - Inverted `from/to` query windows are normalized to a valid chronological range
   - Overview, timeseries, breakdown, and CSV export APIs
   - Endpoints:
     - Session API: `/api/admin/usage/*`
     - Developer API: `/api/v1/admin/usage/*`

4. **Usage Policy Engine**
   - Scoped policy CRUD (`system`, `team`, `workspace`, `user`)
   - Effective policy resolution and chat preflight enforcement
   - Endpoints:
     - Session API: `/api/admin/usage-policies*`
     - Developer API: `/api/v1/admin/usage-policies*`

5. **Commercial API Key Controls**
   - Scoped keys, expiry, revocation support, and route-level scope enforcement
   - Invalid/malformed key expiry timestamps are treated as expired for fail-safe access control
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

# frontend compile + route validation
cd frontend && yarn build

# regenerate OpenAPI spec
cd server && yarn swagger

# full enterprise API smoke test (requires running server)
cd server && ./scripts/enterprise-smoke-test.sh

# smoke script now includes role matrix assertions:
# - API /ping readiness retry loop before executing checks
# - default user denied /admin/teams
# - manager user can list/create teams
# - enterprise_teams feature gate disable => /admin/teams denied
# - enterprise_teams flag restore => /admin/teams allowed again
# - enterprise_usage_monitoring gate disable/enable around /admin/usage/overview
# - enterprise_prompt_library gate disable/enable around /admin/prompt-templates
# - enterprise_usage_policies gate disable blocks /admin/usage-policies/new
# - admin:read API key can read /v1/admin/usage/overview
# - admin:read API key can read /v1/admin/prompt-templates and /v1/admin/usage-policies
# - usage monitoring checks include timeseries, breakdown, and CSV export on both session and /v1 admin routes
# - usage breakdown validation checks include invalid `by` field rejection on both session and /v1 admin routes
# - admin:read key denial checks include write attempts to team, prompt-template, and usage-policy create routes
# - prompt template lifecycle checks include create + apply-to-workspace + v1 versions-read validation
# - usage overview checks include inverted `from/to` range handling on both session and /v1 admin routes
# - prompt apply checks include post-apply workspace prompt verification and admin:read denial on v1 api-key update
# - workspace:chat key denial checks include access attempts to admin-read routes (scope boundary validation)

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
- smoke bootstrap fallback that retries with a unique admin username if `enable-multi-user` reports username collisions
