# Changelog — Orcest AI Enterprise Chat Platform

All notable changes to the Lamino/Orcest AI platform are documented in this file.

## [2.0.0] - 2026-02-21

### Enterprise Platform Upgrade

This release transforms the Lamino/Orcest AI chat platform into an enterprise-grade
solution rivaling Open WebUI, AnythingLLM, Flowise, and Text Generation WebUI.

---

### Bug Fixes

- **Streaming error recovery**: Added retry mechanism for transient network errors
  (`ECONNRESET`, `ETIMEDOUT`, `ECONNABORTED`) during LLM streaming. Partial responses
  are now preserved instead of being discarded on connection interrupts.
- **Response truncation**: Improved stream handler to properly detect `finish_reason`
  and ensure complete responses are delivered to the frontend.
- **Model selection restored**: LLM selector modal now works correctly with session-scoped
  provider/model persistence via `sessionStorage`. RainyModel added as first-class
  default provider.
- **File/image upload**: Enhanced `validateImageAttachments()` with support for PNG, JPEG,
  WEBP, and GIF formats up to 10MB. Paste-to-upload now handles both images and files.
- **RTL/bidirectional text**: Added `dir="auto"` to all chat input and output elements.
  Persian and English words now render in correct order. Global CSS support for
  `unicode-bidi: plaintext` ensures mixed LTR/RTL content displays correctly.
- **Chat input auto-grow**: Added `useEffect` to recalculate textarea height when
  prompt input changes programmatically (e.g., from slash commands or speech-to-text).
- **Chat persistence**: `usePromptInputStorage` hook now persists draft messages
  across page reloads, scoped per workspace thread.
- **`$.mailToOrcest` error**: Removed broken shortcut reference that caused console errors.

### Persian Language Enhancement

- **Extended normalization**: Added normalization for Alef variants (`أإآ` → `ا`),
  Teh Marbuta (`ة` → `ه`), Hamza on Waw/Yeh, and Arabic Extended diacritics.
- **Enhanced tokenizer**: Improved punctuation handling for Persian/Arabic punctuation
  marks including `؟،«»٫٪`.
- **Language detection**: New `detectTextDirection()` function for automatic RTL/LTR
  detection supporting Arabic, Hebrew, Syriac, and Thaana scripts.
- **System prompt**: Enhanced Persian system prompt suffix instructs LLMs to respond in
  formal Persian register, preserve technical terms in English, and use Persian numerals.
- **Search query building**: New `buildPersianSearchQuery()` extracts key terms for
  improved vector search recall on Persian queries.
- **Test coverage**: 60+ unit tests covering normalization, tokenization, detection,
  and regression tests for 10 typical Persian programming prompts.

### Enterprise User Management (Login SSO)

- **RBAC**: Role-based access control with Admin, Developer, Researcher, and Viewer groups.
- **SCIM 2.0**: Full SCIM provisioning endpoints (`/scim/v2/Users`, `/scim/v2/Groups`)
  for integration with Authentik or other identity providers.
- **Multi-workspace**: Workspace management with membership, roles, and permissions.
  Users can belong to multiple workspaces with different access levels.
- **Group management**: Create, update, and manage groups with granular permissions
  for chat histories, file access, and model usage.
- **Audit logging**: All authentication events, user changes, and access grants are
  logged with timestamps and IP addresses.

### Standardized API Endpoints

- **RainyModel as default**: RainyModel (`rm.orcest.ai`) set as the default LLM
  provider with automatic routing across free/internal/premium tiers.
- **Provider auto-discovery**: New `/v1/providers` endpoint lists all configured
  providers and their availability status.
- **AUTO mode**: `/v1/auto/config` discovers available endpoints, providers, and models
  based on environment variables and returns sensible defaults.
- **Rate limiting**: In-memory rate limiter (configurable via env vars) protects all
  API endpoints from abuse.
- **Provider override**: `X-RainyModel-Provider` header allows users to route directly
  to a specific provider (e.g., OpenAI, Anthropic).

### Multi-Modal & File Support

- **Image validation**: PNG, JPEG, WEBP, GIF formats with configurable size limits.
- **RAG pipeline**: Enhanced vector search with Persian-aware query building for
  improved retrieval on bilingual documents.
- **Document management**: Existing workspace document upload, embedding, and
  retrieval flows preserved and enhanced.

### Unified Interface

- **RainyModel in LLM selector**: Added as first-class provider in the chat model
  selection dropdown with auto-configuration.
- **RTL CSS**: Global bidirectional text support for Persian, Arabic, and Hebrew.
- **Theme support**: Existing dark/light theme system preserved; status dashboard
  gets dark/light toggle.

### Developer APIs & Plugins (orcest.ai)

- **OpenAI-compatible proxy**: `/v1/chat/completions` endpoint proxies through
  RainyModel with streaming support.
- **Model listing**: `/v1/models` lists available models.
- **Plugin system**: Register/unregister plugins via `/api/plugins/register` with
  capabilities, endpoints, and webhook URL.
- **Webhook system**: Register webhooks for event notifications with HMAC signature
  verification.
- **Audit log API**: `/api/audit` returns recent platform activity.
- **Enhanced metrics**: `/metrics` now includes error counts, per-path request
  distribution, and requests-per-second.

### Monitoring & Status Dashboard

- **Performance metrics**: New `/api/metrics` endpoint with per-service average
  response time and uptime percentage.
- **Incident tracking**: Automatic incident detection when services go down, with
  resolution tracking via `/api/incidents`.
- **Dark/light theme**: Status dashboard now supports theme toggling.
- **Additional services**: OllamaFreeAPI and RainyModel Providers added to monitoring.

### OllamaFreeAPI Enhancements

- **OpenAI-compatible endpoint**: `/v1/chat/completions` for drop-in compatibility
  with RainyModel and other consumers.
- **Model listing**: `/v1/models` in OpenAI format.
- **Rate limiting**: Per-IP rate limiting middleware.
- **CORS support**: Cross-origin requests enabled for `*.orcest.ai`.

### Deployment & Infrastructure

- **Enterprise Docker Compose**: Full-stack `docker-compose.enterprise.yml` with:
  - Lamino (chat platform)
  - RainyModel (LLM proxy)
  - Login SSO (identity provider)
  - Status dashboard (monitoring)
  - Orcest Web (landing + APIs)
  - Ollama (local LLM with GPU)
  - ChromaDB (vector database)
  - Redis (cache/sessions)
- **Health checks**: All services have Docker health checks with configurable intervals.
- **Resource limits**: Memory and CPU limits per service for predictable scaling.
- **GPU support**: Ollama service configured for NVIDIA GPU acceleration.
- **Environment template**: `.env.enterprise.example` with all configurable variables.

### Security & Compliance

- **Rate limiting**: Per-IP rate limiting on all API endpoints across all services.
- **Audit logging**: Structured JSON audit logs for all API requests and auth events.
- **CORS hardening**: orcest.ai CORS restricted to `*.orcest.ai` origins (was `*`).
- **Cookie security**: SSO tokens use `httpOnly`, `secure`, `sameSite=lax` flags.
- **API key auth**: Bearer token authentication on developer APIs.
- **Webhook signatures**: HMAC-SHA256 signature verification for webhook deliveries.
- **No eval/exec**: No dynamic code execution on user input.
- **XSS protection**: DOMPurify used for Markdown rendering; `X-Frame-Options: DENY`.

---

### Migration Notes

1. Update environment variables per `.env.enterprise.example`
2. Run `yarn prisma:migrate` for Lamino database schema updates
3. Configure SSO secrets to match between Login and all client services
4. Set `RAINYMODEL_MASTER_KEY` for API authentication
5. For Docker deployment: `docker compose -f docker-compose.enterprise.yml up -d`
