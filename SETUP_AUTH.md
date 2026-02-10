# Authentication Setup Guide

This guide walks you through setting up Google OAuth authentication with Supabase for SlugSwap.

## Prerequisites

- A Supabase project (already created)
- A Google Cloud Platform account

## Step 1: Configure Google OAuth

### 1.1 Create OAuth Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen first:
   - Choose "External" user type
   - Fill in app name: "SlugSwap"
   - Add your email as developer contact
   - Skip optional fields and save

### 1.2 Configure OAuth Client

1. Application type: **Web application**
2. Name: "SlugSwap Auth"
3. Add Authorized redirect URIs:
   ```
   https://htaktvkkxeylaelyvxoz.supabase.co/auth/v1/callback
   ```
4. Click **Create**
5. Copy the **Client ID** and **Client Secret** - you'll need these next

## Step 2: Configure Supabase

### 2.1 Enable Google Provider

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `htaktvkkxeylaelyvxoz`
3. Navigate to **Authentication** > **Providers**
4. Find **Google** in the list and click to expand
5. Enable the Google provider
6. Paste your **Client ID** and **Client Secret** from Google Cloud Console
7. Click **Save**

### 2.2 Configure Deep Linking (Important!)

The app uses the custom URL scheme `slugswap://` for OAuth callbacks.

**For iOS:**
1. In Xcode, this is already configured in `app.json` under the `scheme` property
2. No additional setup needed for development

**For Android:**
1. The scheme is configured in `app.json`
2. No additional setup needed for development

**For Production:**
You may need to add additional redirect URLs in Google Cloud Console:
- `slugswap://auth/callback`
- Your production app URL scheme

## Step 3: Get Service Role Key (for API routes)

1. In Supabase Dashboard, go to **Settings** > **API**
2. Under **Project API keys**, find the **service_role** key
3. Copy this key
4. Add it to your `.env` file:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

⚠️ **Important**: The service role key bypasses Row Level Security. Keep it secret and only use it in secure server environments (API routes), never in client code.

## Step 4: Test Authentication

1. Start the Expo development server:
   ```bash
   npm start
   ```

2. Open the app on your device or simulator

3. Try signing in with Google - you should be redirected to Google's OAuth consent screen

4. After approving, you'll be redirected back to the app and signed in

## Troubleshooting

### "redirect_uri_mismatch" error

This means the redirect URI in your OAuth request doesn't match what's configured in Google Cloud Console.

**Fix:**
1. Check the exact URI in the error message
2. Go to Google Cloud Console > Credentials
3. Add that exact URI to Authorized redirect URIs
4. Wait a few minutes for changes to propagate
5. Try again

### OAuth popup doesn't close

This can happen if the deep link isn't properly configured.

**Fix:**
1. Verify the `scheme` in `app.json` is set to `"slugswap"`
2. Restart the Expo dev server
3. Rebuild the app if on a physical device

### User created in auth.users but not in public.users

The database trigger should automatically create a record. If it doesn't:

**Check:**
1. Go to Supabase Dashboard > Database > Functions
2. Verify `handle_new_user` function exists
3. Check Database > Triggers
4. Verify `on_auth_user_created` trigger exists on `auth.users`

**Test manually:**
```sql
-- Run in Supabase SQL Editor to check trigger
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
```

## Database Schema

The authentication system uses these tables:

- **auth.users** (managed by Supabase) - stores authentication data
- **public.users** - stores app-specific user profile data
  - Automatically synced via database trigger
  - Fields: id, email, name, avatar_url, created_at, updated_at

## Next Steps

Once authentication is working:

1. ✅ Users can sign in with Google
2. ✅ User profiles are automatically created
3. ✅ Protected routes redirect to sign-in if not authenticated
4. ⬜ Build out donor and requester flows
5. ⬜ Integrate GET Tools API for claim code generation

## Security Notes

- All tables have Row Level Security (RLS) enabled
- Users can only read/write their own data
- Service role key is used only in API routes, never exposed to client
- OAuth tokens are stored securely in AsyncStorage (encrypted on iOS)
