# SlugSwap

A mobile app that helps university students share dining points.

## Tech Stack

- **Frontend (mobile)**: Expo Router (React Native)
- **Frontend + API (web)**: Next.js (`apps/dashboard`)
- **Database**: Neon (serverless Postgres) + Drizzle ORM
- **Auth**: Supabase Auth with Google OAuth
- **Hosting**: Vercel
- **External**: GET Tools API (school point system)

## Getting Started

### Prerequisites

- Node.js 20.19–24 (24 recommended)
- npm
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

### Development

Start the mobile app:
```bash
npm run mobile:dev
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

Start the dashboard app:

```bash
npm run dashboard:dev
```

Route map (dashboard app):
- `/` -> public landing page
- `/app` -> Expo web app (same domain)
- `/admin/login` -> admin login
- `/admin` -> admin dashboard
- `/api/*` -> backend API routes

Deploy dashboard preview:

```bash
npm run dashboard:deploy
```

Deploy dashboard production:

```bash
npm run dashboard:deploy:prod
```

### Project Structure (Current)

```
slugswap/
├── apps/
│   ├── mobile/             # Expo mobile app
│   └── dashboard/          # Next.js dashboard + API routes
├── db/                     # Authoritative Drizzle schema + migrations
├── scripts/                # Project scripts
└── .github/workflows/      # CI/CD workflows
```

### Instagram Story Assets

Instagram story generation now lives in `scripts/instagram-stories/` and the preview route is served from `apps/dashboard/app/ig-stories/`.

### Database Integrity Audit

Run the read-only aggregate audit before and after database work:

```bash
npm run db:audit
```

`scripts/repair-db.ts` is an exceptional, explicitly gated production repair. It does nothing unless both `--apply` and the confirmation token printed by the script are supplied. Review it and create a Neon backup or branch before authorizing it.

**Current Focus**: Release 1

- Donor onboarding with weekly contribution preferences
- Requester weekly allowance visibility
- Claim code generation and redemption
- Basic impact and history views

## Contributing

For questions, issues, or contribution guidance, contact the development team.

## GET API integration notes

The GET barcode flow currently **does not use a server-side session cache**. Each barcode fetch re-authenticates with GET using the stored device credentials/PIN and then requests the latest payload.

`GET /api/get/barcode` returns a fresh barcode payload. `GET /api/get/wallet`
returns the linked account balances and a fresh barcode together for the wallet
screen.
