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
  server/__tests__/models/apiKeys.enterprise.test.js \
  server/__tests__/utils/policies/chatPolicy.test.js \
  server/__tests__/utils/middleware/featureGate.test.js

# frontend compile + route validation
cd frontend && yarn build

# regenerate OpenAPI spec
cd server && yarn swagger

# full enterprise API smoke test (requires running server)
cd server && ./scripts/enterprise-smoke-test.sh

# smoke script now includes role matrix assertions:
# - default user denied /admin/teams
# - manager user can list/create teams
# - enterprise_teams feature gate disable => /admin/teams denied
# - enterprise_teams flag restore => /admin/teams allowed again
# - enterprise_usage_monitoring gate disable/enable around /admin/usage/overview
# - admin:read API key can read /v1/admin/usage/overview

# convenience script aliases from repo root
yarn test:enterprise
yarn smoke:enterprise
```
