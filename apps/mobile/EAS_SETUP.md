# EAS Setup (First-Time)

Before your first TestFlight build, run these from the repo root (or `cd apps/mobile`):

1. **Login**: `eas login`

2. **Link project**: `npm run mobile:eas:init` (creates/links Expo project, adds projectId to app.json)

3. **Configure EAS Update**: `npx eas-cli update:configure` (from apps/mobile)  
   - Adds updates.url and completes EAS Update config in app.json

4. **App Store Connect**: Create the app at [appstoreconnect.apple.com](https://appstoreconnect.apple.com) with bundle ID `com.anonymous.slugswap`

5. **Optional (skip prompts)**: Set env vars:
   - `EXPO_APPLE_ID` — your Apple ID email
   - `EXPO_APPLE_TEAM_ID` — from `eas init` or Apple Developer
   - Add `ascAppId` to `submit.production.ios` in eas.json after first build
