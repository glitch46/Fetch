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

The backend is deployed on Hostinger shared hosting at **`https://api.llmgames.org`**. This is a permanent URL — no more ephemeral Cloudflare tunnel URLs.

### Server Details

- **Host:** Hostinger shared hosting (hPanel)
- **SSH:** `ssh u316347496@145.223.104.241 -p 65002`
- **App root:** `/home/u316347496/fetch-api/apps/backend`
- **Entry file:** `server.js` (Passenger wrapper that loads tsx → `src/index.ts`)
- **Node.js version:** 20.x (managed via hPanel)

### How It Works

- Hostinger uses **Phusion Passenger** to run Node.js apps
- `server.js` is the Passenger entry point — it `require('tsx/cjs')` then loads `src/index.ts`
- `.htaccess` tells Passenger which file to start
- Environment variables are set in hPanel UI (Website → Node.js → Environment Variables)

### Deploying Updates

```bash
# SSH into Hostinger
ssh u316347496@145.223.104.241 -p 65002

# Pull latest changes
cd /home/u316347496/fetch-api
git pull origin main

# Install any new dependencies
npm install --production

# Restart the app (via hPanel UI, or touch restart.txt if configured)
```

### API URL Configuration

| Scenario | `EXPO_PUBLIC_API_URL` value |
|---|---|
| Expo dev server (`npm run mobile`) | `http://192.168.1.253:3000` (LAN IP) |
| EAS beta/production build (APK on phone) | `https://api.llmgames.org` |

### Important Notes

- **EAS builds bake env vars at build time** — changing eas.json alone does NOT update an already-installed APK. You must rebuild.
- **Android cleartext traffic** — When using `http://` (not `https://`), Android blocks it by default. This is already handled via `expo-build-properties` in `app.json` with `usesCleartextTraffic: true`. Do not remove this.
- **Do NOT commit `.env` files** — they contain secrets. The `.env` at root and `apps/mobile/.env` are for local dev only.
- **Hostinger env vars** are set in hPanel, NOT in a `.env` file on disk (though the app will read `.env` if present as a fallback).

## Key Patterns

- **DataSource interface** (`services/datasource.ts`) — source-agnostic dog fetching, allows swapping providers
- **Route + Service separation** — routes handle HTTP concerns, services handle business logic
- **AuthGuard component** — wraps app, prevents unauthenticated navigation
- **Axios interceptor** — auto-attaches Bearer token from Supabase session
- **PM2 for production** — `ecosystem.config.cjs` at root
