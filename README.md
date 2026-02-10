# SlugSwap

A mobile app that helps university students share dining points.

## Tech Stack

- **Frontend**: Expo Router (React Native) - iOS/Android mobile app
- **Database**: Neon (serverless Postgres) + Drizzle ORM
- **Auth**: Supabase Auth with Google OAuth
- **API Layer**: Vercel serverless functions
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

Start the Expo development server:
```bash
npm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

### Project Structure

```
slugswap/
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── donor.tsx      # Donor flow
│   │   └── requester.tsx  # Requester flow
│   ├── auth/              # Authentication screens
│   ├── components/        # Shared components
│   ├── lib/               # Utilities and helpers
│   └── types/             # TypeScript types
├── api/                    # Vercel serverless functions
│   ├── auth/              # Auth endpoints
│   ├── pool/              # Pool management
│   └── claims/            # Claim code generation/redemption
├── assets/                # Images, fonts, etc.
└── CLAUDE.md             # Project instructions for AI assistants
```

## Product Releases

See `slugswap-release.md` for the detailed release plan.

**Current Focus**: Release 1 (Private Alpha)
- Donor onboarding with monthly preferences
- Requester weekly allowance visibility
- Claim code generation and redemption
- Basic impact and history views

## Contributing

This is a university project. For questions, contact the development team.
