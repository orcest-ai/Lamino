# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Lamino is an Intelligent LLM Workspace with three core services:
- **Server** (port 3001): Node.js/Express API backend with Prisma/SQLite
- **Frontend** (port 3000): Vite + React UI
- **Collector** (port 8888): Document processing service

### Running services

All three services must run for the app to work end-to-end. From the repo root:

```bash
yarn dev:server    # API server on :3001
yarn dev:collector # Document processor on :8888
yarn dev:frontend  # Vite dev server on :3000
```

Or all at once: `yarn dev:all`

### Lint, test, build

See `package.json` scripts. Key commands:
- `yarn lint` — runs prettier (server, collector) and eslint (frontend)
- `yarn test` — runs jest across all packages
- `yarn prisma:setup` — regenerate Prisma client, run migrations, seed

### Non-obvious caveats

- **Node version**: Must use Node.js v18 (`nvm use 18.18.0`). The `.nvmrc` specifies v18.18.0. Node 22+ will cause issues.
- **Puppeteer in collector**: The `puppeteer` package downloads Chromium on install. If it hangs, set `PUPPETEER_SKIP_DOWNLOAD=true` — Chromium may already be cached in `~/.cache/puppeteer/`. The collector still starts fine without it; only web scraping features need Chromium.
- **LLM provider**: Default config uses RainyModel (`rm.orcest.ai`). Chat requires a valid `RAINYMODEL_API_KEY` in `server/.env.development`. Without it, workspace creation and UI work, but chat returns 401 errors.
- **SQLite database**: Located at `server/storage/lamino.db`. Created by `yarn prisma:setup`. If you need a fresh DB, run `yarn prisma:reset`.
- **Environment files**: `yarn setup:envs` copies `.env.example` files. These are gitignored and won't conflict with other branches.
- **Server lint** uses `prettier --write` (auto-formats). Frontend lint uses `eslint --fix`. Both modify files in place.
