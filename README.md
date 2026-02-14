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

- Node.js 20+
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.example .env.local
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
npm run dashboard:dev -- -p 3001
```

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
├── db/                     # Drizzle schema + migrations
├── scripts/                # Project scripts
└── .github/workflows/      # CI/CD workflows
```

## Product Releases

See `slugswap-release.md` for the detailed release plan.

**Current Focus**: Release 1
- Donor onboarding with monthly preferences
- Requester weekly allowance visibility
- Claim code generation and redemption
- Basic impact and history views

## Contributing

For questions, issues, or contribution guidance, contact the development team.
