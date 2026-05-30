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
