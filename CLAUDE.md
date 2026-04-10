
If you do not have a write tool available (that is to say you are in ask mode), that means I want you to explain the changes to me, so I can make the changes myself.

## Project Overview

SlugSwap is a mobile app that helps university students share dining points. Donors contribute to a shared weekly pool; requesters draw from a weekly allowance via short-lived claim codes generated through the school's GET Tools API.

## Commands

an run `npm run` to see available run commands.

### Troubleshooting
```bash
npx expo-doctor                # Check for dependency issues, version mismatches, and configuration problems
```

Run `expo-doctor` when you encounter build errors or after upgrading packages to validate the setup.






## Environment Setup
If setting up a new environment (such as on the cloud or worktree) make sure that the .env files are copied over.


## Post-Change Actions

After making changes, always tell the user what they need to do to give the changes effect. Common actions:

- **Schema changes** (`db/schema.ts` or `apps/dashboard/lib/server/schema.ts`): Run `npm run db:push` to apply to Neon
- **Server / API changes** (`apps/dashboard/`): Run `npm run dashboard:deploy` (preview) or `npm run dashboard:deploy:prod` (production) to deploy to Vercel
- **Mobile changes** (`apps/mobile/`): Run `npm run mobile:eas:update` for OTA update, or `npm run mobile:eas:testflight` for a new build
- **Environment variable changes**: Update `.env` locally and/or set in Vercel dashboard / EAS secrets
- **New dependencies**: Run `npm install` from the repo root

If a change spans multiple layers (e.g. schema + API + mobile), list all required steps in order. Never assume the user knows what to run — always be explicit.
