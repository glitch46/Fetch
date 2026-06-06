# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fetch** is a Tinder-style dog adoption matching app. Users swipe on rescue dogs, set preferences, and get matched based on compatibility scoring. Monorepo with React Native mobile app and Node.js backend.

## Commands

```bash
# Install all dependencies (run from root)
npm install

# Start mobile app (Expo dev server)
npm run mobile

# Start backend (Fastify with tsx watch, hot reload)
npm run backend

# Start backend in production mode
npm run backend:start

# Type-check both apps
npm run typecheck
```

No test suite or linter is configured.

## Architecture

### Monorepo Layout

- `apps/mobile/` — React Native + Expo (SDK 54), Expo Router (file-based), Zustand state
- `apps/backend/src/` — Fastify API with JWT auth, PostgreSQL via Supabase
- `packages/shared/` — Shared TypeScript types (User, Dog, Swipe, Match, PreferenceKey)

### Mobile (`apps/mobile/`)

- **Routing:** Expo Router file-based — `app/(auth)/` for login/register, `app/(tabs)/` for main screens, `app/dog/[id].tsx` for dog detail modal
- **State:** Zustand stores in `store/` — `useAuthStore`, `useDogsStore`, `usePreferencesStore`
- **API client:** Axios instance in `lib/api.ts` with JWT interceptor
- **Auth:** Supabase Auth with OAuth deep links (`fetch://auth/callback`)
- **Entry point:** `app/_layout.tsx` (auth listener, deep links, AuthGuard)

### Backend (`apps/backend/src/`)

- **Routes:** `routes/` — auth, dogs, swipes, matches, users, notifications
- **Services:** `services/` — austinPawsDataSource (dog fetching), matching (score calc), notifications (Expo Push), dogSync (cron orchestrator)
- **DB:** PostgreSQL via Supabase client. Schema in `db/schema.sql`
- **Cron:** 12-hour dog sync from Austin Paws Portal API
- **Entry point:** `index.ts`

### Data Flow

1. Cron fetches dogs from Austin Paws Portal API → upserts to PostgreSQL
2. GET /dogs calculates match_score per dog based on user preferences vs dog tags
3. Mobile displays dogs sorted by score in swipe deck
4. Swipe right → POST /swipes → potential match → adopt/foster redirect

## Video/YouTube Handling (CRITICAL)

**NEVER render YouTube videos in-app.** Android WebView causes Error 153.

Correct approach:
1. Extract video ID with regex
2. Show YouTube thumbnail (`https://img.youtube.com/vi/{ID}/hqdefault.jpg`) with play button overlay
3. On tap, open YouTube URL externally via `Linking.openURL()`

## Environment

- `.env` at root contains all config (Supabase, JWT, Austin Paws API, OAuth credentials)
- Mobile uses `EXPO_PUBLIC_*` prefix for client-side vars
- Backend uses `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`

## Backend Deployment (Hostinger — api.llmgames.org)

The backend is deployed on Hostinger shared hosting at **`https://api.llmgames.org`**. This is a permanent URL. Cloudflare tunnels are **no longer used** — do NOT revert to Cloudflare or LAN IPs.

### Server Details

- **Host:** Hostinger shared hosting (hPanel)
- **SSH:** `ssh u316347496@145.223.104.241 -p 65002`
- **App root:** `/home/u316347496/fetch-api/apps/backend`
- **Entry file:** `server.js` (Passenger wrapper that loads tsx → `src/index.ts`)
- **Node.js version:** 20.x (managed via hPanel)

### How It Works

- Hostinger uses **Phusion Passenger** to run Node.js apps
- `server.js` is the Passenger entry point — it `require('tsx')` then dynamically imports `src/index.ts`
- `.htaccess` tells Passenger which file to start
- Environment variables are set in hPanel UI (Website → Node.js → Environment Variables)

### Deploying Updates

```bash
# SSH into Hostinger
ssh u316347496@145.223.104.241 -p 65002

# Pull latest changes
cd /home/u316347496/fetch-api
git pull origin main

# Install dependencies (do NOT use --production; tsx is a devDependency)
npm install

# Restart the app (via hPanel UI, or touch restart.txt if configured)
```

### API URL — Always Use `https://api.llmgames.org`

**All environments** (local dev, EAS builds, production) should use `https://api.llmgames.org`. There is no reason to use a LAN IP or Cloudflare tunnel anymore.

- `EXPO_PUBLIC_API_URL` in `eas.json` (beta, beta-ios): `https://api.llmgames.org`
- `EXPO_PUBLIC_API_URL` in `.env` files: `https://api.llmgames.org`
- **Do NOT** change this to a LAN IP, localhost, or Cloudflare tunnel URL

### Important Notes

- **EAS builds bake env vars at build time** — changing eas.json alone does NOT update an already-installed APK. You must rebuild.
- **Do NOT commit `.env` files** — they contain secrets. The `.env` at root and `apps/mobile/.env` are for local dev only.
- **Hostinger env vars** — The server reads from `.env` on disk at `/home/u316347496/fetch-api/.env`. These can also be set in hPanel UI.

## Key Patterns

- **DataSource interface** (`services/datasource.ts`) — source-agnostic dog fetching, allows swapping providers
- **Route + Service separation** — routes handle HTTP concerns, services handle business logic
- **AuthGuard component** — wraps app, prevents unauthenticated navigation
- **Axios interceptor** — auto-attaches Bearer token from Supabase session
- **PM2 for production** — `ecosystem.config.cjs` at root

## Authentication — Third-Party OAuth Setup

All OAuth flows go through **Supabase Auth**. The mobile app opens a browser to Supabase's OAuth URL, Supabase handles the provider handshake, then redirects back to `fetch://auth/callback` which the app's deep link handler catches.

### Supabase Dashboard Config (REQUIRED)

- **Authentication → URL Configuration → Redirect URLs:** Must include `fetch://auth/callback`
- **Authentication → Providers → Email:** Enabled, "Confirm email" ON, min password 8
- **Authentication → Providers → Google:** Enabled with Google OAuth Client ID + Secret
- **Authentication → Providers → Facebook:** Enabled with Facebook App ID + Secret
- **Settings → API → JWT Secret:** Copy to backend `.env` as `JWT_SECRET`

### Google OAuth (Google Cloud Console)

- **Console:** https://console.cloud.google.com → APIs & Services → Credentials
- **Type:** OAuth 2.0 Client ID (Web application)
- **Authorized redirect URI:** `https://ruushiqquescvfhdbodi.supabase.co/auth/v1/callback`
- **Client ID:** `442294815609-hfnlfapfbihbaa10o6d1tj9c6o8akij3.apps.googleusercontent.com`
- Paste Client ID + Secret into Supabase Dashboard → Providers → Google

### Facebook OAuth (Meta Developer Portal)

- **Portal:** https://developers.facebook.com
- **App type:** Consumer
- **Facebook App ID:** `4375433776063530`
- **Status:** Live (MUST be Live mode for non-developer users)

**Required Facebook App Settings:**
1. **Products → Facebook Login → Settings:**
   - "Client OAuth Login" → ON
   - "Web OAuth Login" → ON
   - "Valid OAuth Redirect URIs" → `https://ruushiqquescvfhdbodi.supabase.co/auth/v1/callback`
2. **App Settings → Basic:**
   - App Domains: `ruushiqquescvfhdbodi.supabase.co`
   - Privacy Policy URL: must be set (use `https://api.llmgames.org/privacy`)
   - User Data Deletion: Data Deletion Instructions URL → `https://api.llmgames.org/data-deletion`
   - Website → Site URL: `https://ruushiqquescvfhdbodi.supabase.co`
3. **App Review → Permissions and Features:**
   - `email` permission must have **Advanced Access** (not just Standard)

**Troubleshooting Facebook OAuth:**
- "Sorry, something went wrong" immediately → Check App ID matches in Supabase + Meta portal, check app is Live
- "Invalid Scopes: email" → `email` permission needs Advanced Access in App Review
- "Domain not included" → Add `ruushiqquescvfhdbodi.supabase.co` to App Domains
- Error after entering password → Redirect URI missing from Valid OAuth Redirect URIs

### Deep Linking (Mobile)

- **Scheme:** `fetch://` (defined in `apps/mobile/app.json` → `expo.scheme`)
- **Callback URL:** `fetch://auth/callback`
- **Android:** Intent filter in `app.json` → `android.intentFilters`
- **iOS:** `CFBundleURLSchemes` in `app.json` → `ios.infoPlist`
- **Handler:** `apps/mobile/app/_layout.tsx` listens for deep link URLs, extracts tokens, calls `supabase.auth.setSession()`

## Mobile App Building & Deployment (EAS)

### Prerequisites

- **Expo account:** Logged in via `npx eas-cli login`
- **EAS project ID:** `182b9f7a-700b-4b26-bf56-dfdd1a9ab86e` (in `app.json`)
- **Expo owner:** `glitch32`
- **Bundle ID / Package:** `com.pawfect.fetch`

### EAS Build Profiles (in `apps/mobile/eas.json`)

| Profile | Output | Use Case |
|---------|--------|----------|
| `development` | APK | Local dev with dev client |
| `preview` | APK | Internal testing |
| `beta` | APK (Android) | Beta testers, internal distribution |
| `beta-ios` | Simulator build | iOS simulator testing |
| `production` | AAB (Android) | Google Play Store submission |

### Building

```bash
cd apps/mobile

# Beta APK for internal testing
npx eas-cli build --profile beta --platform android

# Production AAB for Google Play Store
npx eas-cli build --profile production --platform android

# iOS build (requires Apple Developer account)
npx eas-cli build --profile production --platform ios
```

**CRITICAL:** EAS builds bake environment variables at build time from the `env` block in `eas.json`. If you change env vars, you MUST rebuild — updating `eas.json` alone does NOT update installed apps.

### Current Build State (as of June 2026)

- **Latest production AAB:** https://expo.dev/artifacts/eas/6pYaufkYu41CVTShFQ2iwK.aab (built June 1, 2026)
- **Latest beta APK:** https://expo.dev/artifacts/eas/7TrEdTBaocxMWoQ7YHLszB.apk (built June 1, 2026)
- **Android versionCode:** 2 (increment before each Play Store upload)
- **App version:** 1.0.0

### Versioning for Store Uploads

Before each Play Store upload, increment `versionCode` in `apps/mobile/app.json`:
```json
"android": { "versionCode": 3 }
```
Google Play rejects uploads with a versionCode that already exists. The `version` field (1.0.0) is the user-facing version string.

## Google Play Store Deployment

### Current Status

- **App name:** Fetch
- **Package:** `com.pawfect.fetch`
- **Console:** https://play.google.com/console
- **Build type:** AAB (Android App Bundle) via `production` EAS profile

### Upload Process

1. Build production AAB: `npx eas-cli build --profile production --platform android`
2. Download the `.aab` file from the EAS build URL
3. Go to Google Play Console → Your App → Production (or Internal Testing)
4. Create new release → Upload the `.aab` file
5. Fill in release notes → Review → Roll out

### Requirements for Play Store

- Privacy Policy URL: `https://api.llmgames.org/privacy` (served by backend)
- Data Deletion page: `https://api.llmgames.org/data-deletion` (served by backend)
- Content rating questionnaire completed
- Target API level meets Google's current requirements
- App icons and screenshots uploaded

## iOS App Store Deployment

### Prerequisites (NOT YET SET UP)

1. **Apple Developer Account** ($99/year) — https://developer.apple.com
2. **App Store Connect** — Create app with bundle ID `com.pawfect.fetch`
3. **EAS credentials** — Run `npx eas-cli credentials` to set up iOS signing

### iOS-Specific Configuration

- Bundle ID: `com.pawfect.fetch` (in `app.json` → `ios.bundleIdentifier`)
- Deep link scheme: `fetch://` (via `CFBundleURLSchemes` in `app.json`)
- Supports tablet: `true`

### Steps to Deploy to iOS

1. **Set up Apple Developer account** and create App ID with bundle ID `com.pawfect.fetch`
2. **Create app in App Store Connect** with matching bundle ID
3. **Configure EAS for iOS signing:**
   ```bash
   cd apps/mobile
   npx eas-cli credentials --platform ios
   # Follow prompts to create/link distribution certificate + provisioning profile
   ```
4. **Build for iOS:**
   ```bash
   npx eas-cli build --profile production --platform ios
   ```
5. **Submit to App Store:**
   ```bash
   npx eas-cli submit --platform ios
   ```
   Or download the `.ipa` from EAS and upload via Transporter app.
6. **App Store requirements:**
   - Privacy Policy URL
   - App screenshots (iPhone 6.7", 6.5", 5.5" + iPad if supporting)
   - App description, keywords, categories
   - Data privacy questionnaire (declare Supabase data collection)

### iOS OAuth Notes

- Google OAuth on iOS may require a separate iOS Client ID from Google Cloud Console (type: "iOS application" with bundle ID `com.pawfect.fetch`)
- Facebook OAuth should work with the same Web OAuth setup since it goes through Supabase's browser flow
- Deep link `fetch://auth/callback` is already configured in `app.json` for iOS via `CFBundleURLSchemes`

## Static Pages (Served by Backend)

The backend serves static HTML pages from `apps/backend/public/`:

- **Privacy Policy:** `https://api.llmgames.org/privacy` — Required by Google Play + App Store
- **Data Deletion:** `https://api.llmgames.org/data-deletion` — Required by Facebook OAuth
- These are referenced in Google Play Console, App Store Connect, and Meta Developer Portal
