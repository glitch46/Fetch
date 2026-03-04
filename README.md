# Fetch — Find your pawfect match!

A mobile app that helps people find their ideal rescue dog through a swipe-based matching experience.

## Tech Stack

- **Mobile:** React Native + Expo (SDK 51), Expo Router, Zustand
- **Backend:** Node.js + Fastify
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth

## Monorepo Structure

```
fetch/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── backend/         # Fastify Node.js API
├── packages/
│   └── shared/          # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm
- Expo CLI (`npx expo`)
- A Supabase project

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in your Supabase credentials and other env vars in `.env`.

4. Run the database schema:
   - Open your Supabase SQL editor
   - Paste and run `apps/backend/src/db/schema.sql`

### Development

**Start the backend:**
```bash
npm run backend
```

**Start the mobile app:**
```bash
npm run mobile
```

## License

Private — All rights reserved.
