# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) (or other Agents!) when working with code in this repository.

## Project Overview

SlugSwap is a mobile app that helps university students share dining points. Donors contribute to a shared weekly pool; requesters draw from a weekly allowance via short-lived claim codes generated through the school's GET Tools API.

The product spec lives in `slugswap-release.md`. It defines user stories, release strategy (Releases 0–3), KPIs, and prioritization framework. Treat it as the source of truth for product requirements.

## Commands

### Development
```bash
npm run mobile:start          # Start Expo dev server (mobile app)
npm run mobile:ios             # Run on iOS simulator
npm run mobile:android         # Run on Android emulator
npm run dashboard:dev          # Start Next.js dashboard (port 3000)
npm run dashboard:dev -- -p 3001  # Dashboard on custom port (useful when mobile needs 3000)
```

### Web Routes (single-domain deployment)
- `/` — public landing page
- `/app` — Expo web client (exported static bundle served by Next.js)
- `/admin/login` — admin login
- `/admin` — admin dashboard
- `/api/*` — API endpoints

### Database (Drizzle)
```bash
npm run db:generate            # Generate migrations from schema changes
npm run db:push                # Push schema directly to Neon (no migration files)
npm run db:studio              # Open Drizzle Studio GUI
```

### Type Checking & CI
```bash
npm run typecheck              # All workspaces (root + dashboard + mobile)
npm run dashboard:typecheck    # Dashboard only
npm run mobile:typecheck       # Mobile only
npm run ci:check               # Same as typecheck (used in CI)
```

### Deployment
```bash
npm run dashboard:deploy       # Vercel preview deployment
npm run dashboard:deploy:prod  # Vercel production deployment
npm run mobile:eas:testflight  # Build iOS + submit to TestFlight
npm run mobile:eas:update      # OTA update to production channel
```
You can run `npm run` to see available run commands.

`apps/dashboard` build now exports Expo web assets into `apps/dashboard/public/app` before `next build`.

### Troubleshooting
```bash
npx expo-doctor                # Check for dependency issues, version mismatches, and configuration problems
```

Run `expo-doctor` when you encounter build errors or after upgrading packages to validate the setup.

## Architecture

### Monorepo Structure (npm workspaces)
- `apps/mobile/` — Expo Router (React Native) mobile app
- `apps/dashboard/` — Next.js 15 App Router: public landing, admin UI, Expo web host (`/app`), and all API routes
- `db/` — Drizzle ORM schema (`schema.ts`), migrations, and DB connection (`index.ts`)
- `lib/` — Shared client-side code (Supabase client, auth context, mobile API client)
- `packages/` — Empty (reserved for future shared packages)
- `landing-pages-react/` — Design lab/reference pages (not production-routed)

### API Layer
All API routes live in `apps/dashboard/app/api/`. They use a **dynamic route segment + dispatcher** pattern:

```
apps/dashboard/app/api/[resource]/[action]/route.ts
```

Each route file exports HTTP methods (GET, POST, etc.) that all call a single `dispatch()` function. The dispatcher switches on the `action` param to call handler functions. Server-only utilities live in `apps/dashboard/lib/server/`.

API route groups: `donations`, `claims`, `requesters`, `users`, `admin`, `get` (GET Tools integration), `health`.

### Database
- **Drizzle ORM** with **Neon serverless** HTTP driver (`neon-http`)
- Schema in `db/schema.ts`, config in `drizzle.config.ts` (root)
- Tables: `users`, `donations`, `weeklyPools`, `claimCodes`, `redemptions`, `userAllowances`, `getCredentials`
- Connection created in `db/index.ts`; also mirrored in `apps/dashboard/lib/server/db.ts` for server-side use

### Auth
- **Mobile**: Supabase Auth with Google OAuth → session stored in AsyncStorage. `AuthProvider` in `lib/auth-context.tsx` manages global state and navigation guards.
- **Dashboard**: Supabase OAuth login → server validates via service role key → HMAC-signed session cookie (`slugswap_admin_session`). Admin access restricted by `ADMIN_EMAIL_ALLOWLIST` env var.
- **GET Tools**: PIN-based device auth. PINs encrypted with AES-256-GCM (`GET_CREDENTIAL_SECRET`), stored in `getCredentials` table.

### Mobile App Navigation
Expo Router file-based routing:
- `app/_layout.tsx` — Root layout with `AuthProvider`
- `app/auth/sign-in.tsx` — Google OAuth login
- `app/auth/callback.tsx` — OAuth callback handler
- `app/(tabs)/donor.tsx` — Donor screen (set contribution, link GET account, view impact)
- `app/(tabs)/requester.tsx` — Requester screen (generate claim codes, PDF417 barcode, history)

Mobile API client (`lib/api.ts`) injects Supabase bearer tokens into all requests.

### Key Domain Flow: Claim Code Lifecycle
1. Requester hits `/api/claims/generate`
2. Server finds active donor with linked GET credentials
3. Calls GET API `retrievePatronBarcodePayload` for a live barcode
4. Stores code in DB with 60-second expiry
5. Mobile renders as PDF417 barcode, auto-refreshes every 5 seconds
6. Code redeemed at GET terminal or expires

## Operational Notes (Redemptions / Donors)

### Timestamp handling (important)
- `claim_codes` and `redemptions` use `timestamp without time zone`.
- When investigating "today" spikes, do not assume UTC display values reflect Pacific local day boundaries.
- For SQL investigation, treat stored values consistently and explicitly convert when grouping by local day.

### Donor pause semantics
- Pausing a donor (`/api/donations/pause`) updates `donations.status` and removes that donor from **new** donor selection (`rankDonorCandidatesForClaim` filters `donations.status = 'active'`).
- Pausing does **not** invalidate previously issued `claim_codes` with status `active`.
- Result: pre-existing active claim codes from a donor can still redeem after donor pause unless additional invalidation logic is added.

### Known integrity risks
- `redemptions` currently has no uniqueness constraint on `claim_code_id`, so duplicate redemption rows are possible.
- Redemption reconciliation in `apps/dashboard/app/api/claims/[action]/route.ts` infers redemption from donor balance deltas and records `get_tools_transaction_id` as `balance_delta:<account_id>`, which is not a guaranteed unique external transaction id.
- If hard guarantees are needed, add:
  - DB uniqueness on `redemptions.claim_code_id`
  - idempotency checks before insert
  - explicit invalidation of active claim codes when a donor is paused

### Incident snapshot (Mar 2-3, 2026)
- Donor `lmacvaug@ucsc.edu` was paused at `2026-03-03T07:43:24.454Z`.
- A burst of 12 Lizzie-backed redemptions occurred before that pause (`last_redemption_at = 2026-03-03T06:31:42.965Z`).
- No Lizzie claim creations or redemptions were recorded after pause timestamp.

## Environment Setup
If setting up a new environment (such as on the cloud or worktree) make sure that the .env files are copied over.
Copy `.env to `.env` and fill in values. Key groups:
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side Supabase calls
- `DATABASE_URL` — Neon Postgres connection string
- `EXPO_PUBLIC_API_URL` — Mobile → API base URL (default `http://localhost:3000`)
- `GET_*` — GET Tools API credentials and encryption secret
- `ADMIN_EMAIL_ALLOWLIST` / `ADMIN_SESSION_SECRET` — Dashboard admin auth


## Post-Change Actions

After making changes, always tell the user what they need to do to give the changes effect. Common actions:

- **Schema changes** (`db/schema.ts` or `apps/dashboard/lib/server/schema.ts`): Run `npm run db:push` to apply to Neon
- **Server / API changes** (`apps/dashboard/`): Run `npm run dashboard:deploy` (preview) or `npm run dashboard:deploy:prod` (production) to deploy to Vercel
- **Mobile changes** (`apps/mobile/`): Run `npm run mobile:eas:update` for OTA update, or `npm run mobile:eas:testflight` for a new build
- **Environment variable changes**: Update `.env` locally and/or set in Vercel dashboard / EAS secrets
- **New dependencies**: Run `npm install` from the repo root

If a change spans multiple layers (e.g. schema + API + mobile), list all required steps in order. Never assume the user knows what to run — always be explicit.
