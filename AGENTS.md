# AGENTS.md

## Cursor Cloud specific instructions

### Codebase overview

SlugSwap is a monorepo with npm workspaces. See `CLAUDE.md` for architecture details and all available scripts.

| Service | Command | Port | Notes |
|---|---|---|---|
| Dashboard (Next.js API + Admin UI) | `npm run dashboard:dev` | 3000 | All API routes live here; uses `dotenv -e .env` |
| Mobile (Expo/React Native) | `npm run mobile:start` | 8081 | Metro bundler; requires physical device or simulator for full testing |
| Landing pages | `cd landing-pages-react && npx next dev -p 3001` | 3001 | **Not** in npm workspaces; requires separate `npm install` |

### Running services

- The dashboard uses `dotenv -e .env` to load environment variables. A `.env` file must exist at the repo root (copy from `.env.example`).
- The mobile Expo dev server starts with `--dev-client` by default. In CI/headless environments, prefix with `CI=1` to disable watch mode.
- The mobile app is native-only (no `react-native-web`), so `--web` mode does not work.
- Landing pages run on Next.js 16 (Turbopack) — a separate version from the main app's Next.js 15. Run `npm install` inside `landing-pages-react/` separately.

### Type checking

`npm run typecheck` runs TypeScript checks across root, dashboard, and mobile workspaces. This is the CI check (`npm run ci:check`).

### Linting

- No linter is configured for the main monorepo.
- ESLint is available in `landing-pages-react/` via `cd landing-pages-react && npx eslint .` (pre-existing lint errors exist in that codebase).

### Testing

No test framework is configured for any workspace.

### External dependencies

All API routes require external services (Neon DB, Supabase) via environment variables. With placeholder `.env` values, the dashboard still starts and the `/api/health` endpoint returns `{"status":"ok"}`, but authenticated routes will fail.

### Gotchas

- The `dotenv` CLI is installed as `dotenv-cli` (devDependency) and invoked via npm scripts. Running `dotenv` directly in the shell won't work — use `npx dotenv` or the npm scripts.
- When running both dashboard and landing pages locally, use different ports (dashboard default 3000, landing pages on 3001+).
