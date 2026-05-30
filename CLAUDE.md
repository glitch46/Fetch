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

## Cloudflare Tunnel & API Endpoint Setup (CRITICAL)

The mobile app connects to the backend via `EXPO_PUBLIC_API_URL`. This has broken multiple times due to Cloudflare tunnel URL changes. Follow these rules carefully:

### How It Works

- The backend runs on the home server at `192.168.1.253:3000`
- For **local/development builds**, the app connects directly via LAN IP: `http://192.168.1.253:3000`
- For **EAS builds** (beta APKs installed on phones outside the LAN), the backend must be exposed via a **Cloudflare Tunnel** so the phone can reach it over the internet

### Cloudflare Tunnel Setup

1. **Install cloudflared** on the backend server (the machine running the Fastify backend):
   ```bash
   # Windows (winget)
   winget install Cloudflare.cloudflared
   # Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   ```

2. **Start a quick tunnel** (no Cloudflare account needed — generates a random `.trycloudflare.com` URL):
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   This prints a URL like `https://some-random-words.trycloudflare.com`. This URL **changes every time** you restart cloudflared.

3. **Copy the tunnel URL** and update it in **all** of these locations:
   - `apps/mobile/eas.json` → `build.beta.env.EXPO_PUBLIC_API_URL`
   - `apps/mobile/eas.json` → `build.beta-ios.env.EXPO_PUBLIC_API_URL`

4. **Rebuild the APK** after updating eas.json (env vars are baked in at build time):
   ```bash
   cd apps/mobile
   eas build --platform android --profile beta
   ```

### When to Use Which URL

| Scenario | `EXPO_PUBLIC_API_URL` value |
|---|---|
| Expo dev server (`npm run mobile`) | `http://192.168.1.253:3000` (LAN IP) |
| EAS beta build (APK on phone) | `https://xxxxx.trycloudflare.com` (tunnel URL) |
| Production (future) | Your permanent domain |

### Common Pitfalls

- **Quick tunnel URLs are ephemeral** — they change every restart of `cloudflared`. If the app stops connecting, the tunnel URL probably expired. Re-run `cloudflared tunnel --url http://localhost:3000` and update eas.json.
- **EAS builds bake env vars at build time** — changing eas.json alone does NOT update an already-installed APK. You must rebuild.
- **Android cleartext traffic** — When using `http://` (not `https://`), Android blocks it by default. This is already handled via `expo-build-properties` in `app.json` with `usesCleartextTraffic: true`. Do not remove this.
- **Do NOT commit `.env` files** — they contain secrets. The `.env` at root and `apps/mobile/.env` are for local dev only.

### For a Permanent Setup (Recommended Future Work)

Instead of quick tunnels, create a **named Cloudflare Tunnel** tied to your account with a stable subdomain:
```bash
cloudflared tunnel login
cloudflared tunnel create fetch-backend
cloudflared tunnel route dns fetch-backend fetch-api.yourdomain.com
cloudflared tunnel run fetch-backend
```
This gives a permanent URL that never changes.

## Key Patterns

- **DataSource interface** (`services/datasource.ts`) — source-agnostic dog fetching, allows swapping providers
- **Route + Service separation** — routes handle HTTP concerns, services handle business logic
- **AuthGuard component** — wraps app, prevents unauthenticated navigation
- **Axios interceptor** — auto-attaches Bearer token from Supabase session
- **PM2 for production** — `ecosystem.config.cjs` at root
