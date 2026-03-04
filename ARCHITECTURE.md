# Fetch — Architecture Document
**App:** Fetch — "Find your pawfect match!"
**Version:** 1.0
**Date:** 2026-02-27

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MOBILE APP                              │
│                    React Native + Expo                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Swipe   │  │  Liked   │  │ Profile  │  │  Auth Flow   │   │
│  │  Deck    │  │  Dogs    │  │ Settings │  │  (Supabase)  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       └─────────────┴─────────────┘               │            │
│                      │                            │            │
│              Axios API Client                 Supabase Client   │
└──────────────────────┼────────────────────────────┼────────────┘
                       │                            │
                       ▼                            ▼
┌──────────────────────────────────┐  ┌─────────────────────────┐
│         BACKEND API              │  │     SUPABASE              │
│      Node.js + Fastify           │  │  Auth + PostgreSQL DB    │
│                                  │  │                          │
│  /dogs     ← match scoring       │  │  users                   │
│  /swipes   ← record interactions │  │  user_preferences        │
│  /matches  ← adopt/foster action │  │  dogs                    │
│  /me       ← user profile/prefs  │  │  swipes                  │
│  /notifications ← push tokens    │  │  matches                 │
│                                  │  └─────────────────────────┘
│  ┌─────────────────────────┐     │
│  │  CRON JOB (every 72h)   │     │
│  │  DataSource Orchestrator│     │
│  └────────────┬────────────┘     │
└───────────────┼──────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
┌──────────────┐  ┌──────────────────────┐
│  SODA API    │  │  adopets.com         │
│  (Austin     │  │  Playwright scrape   │
│  Open Data)  │  │  photos + tags only  │
│              │  │  for known IDs       │
│  Intakes +   │  │                      │
│  Outcomes    │  │  Rate limited:       │
│  Hourly feed │  │  1 req per 5 sec     │
└──────────────┘  └──────────────────────┘

  ↑ PROTOTYPE DATA LAYER — Source-Agnostic Interface ↑
  Swap to ShelterBuddy API adapter once AAC grants access.
  Only the Data Agent files change. Rest of app is unaffected.
```

---

## 2. Monorepo Folder Structure

```
fetch/
├── apps/
│   ├── mobile/                          # Expo React Native app
│   │   ├── app/                         # Expo Router file-based routing
│   │   │   ├── _layout.tsx              # Root layout (auth guard)
│   │   │   ├── (auth)/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   └── verify-email.tsx
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx          # Bottom tab bar
│   │   │   │   ├── index.tsx            # Swipe deck (main screen)
│   │   │   │   ├── liked.tsx            # Liked dogs grid
│   │   │   │   └── profile.tsx          # User profile & settings
│   │   │   ├── preferences.tsx          # Preference selection (modal)
│   │   │   └── dog/[id].tsx             # Dog full profile (modal)
│   │   ├── components/
│   │   │   ├── DogCard.tsx              # Swipeable card component
│   │   │   ├── DogProfile.tsx           # Full profile modal content
│   │   │   ├── MatchCelebration.tsx     # Confetti + match overlay
│   │   │   ├── PreferenceChip.tsx       # Selectable preference button
│   │   │   ├── MatchScoreBadge.tsx      # Amber % badge
│   │   │   └── AuthGuard.tsx            # Route protection wrapper
│   │   ├── store/
│   │   │   ├── useAuthStore.ts          # Auth state (Zustand)
│   │   │   ├── useDogsStore.ts          # Dogs/swipe state (Zustand)
│   │   │   └── usePreferencesStore.ts   # User preferences (Zustand)
│   │   ├── lib/
│   │   │   ├── api.ts                   # Axios instance + interceptors
│   │   │   ├── auth.ts                  # Supabase auth functions
│   │   │   └── supabase.ts              # Supabase client init
│   │   ├── constants/
│   │   │   ├── colors.ts                # Brand color palette
│   │   │   └── preferences.ts           # Preference key list
│   │   ├── app.json                     # Expo config (scheme: "fetch")
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── backend/                         # Fastify Node.js API
│       ├── src/
│       │   ├── index.ts                 # Fastify server entry point
│       │   ├── routes/
│       │   │   ├── auth.ts              # Auth endpoints
│       │   │   ├── dogs.ts              # Dog listing + detail
│       │   │   ├── swipes.ts            # Record swipes, get liked
│       │   │   ├── matches.ts           # Record match action, get redirect URL
│       │   │   ├── users.ts             # Profile, preferences, delete account
│       │   │   └── notifications.ts     # Push token, settings
│       │   ├── services/
│       │   │   ├── datasource.ts        # DataSource interface (source-agnostic)
│       │   │   ├── sodaClient.ts        # Austin SODA API client + pagination
│       │   │   ├── adopetsScraper.ts    # Playwright scraper for photos + tags
│       │   │   ├── sodaAdopetsDataSource.ts # Prototype DataSource adapter
│       │   │   ├── dogSync.ts           # Sync orchestrator (fetch → upsert → notify)
│       │   │   ├── tagNormalization.ts  # Scraped tag → preference key map
│       │   │   ├── matching.ts          # Match score calculation
│       │   │   └── notifications.ts    # Expo push notification sender
│       │   ├── middleware/
│       │   │   └── auth.ts              # JWT validation preHandler
│       │   ├── db/
│       │   │   ├── schema.sql           # Full database schema
│       │   │   ├── client.ts            # PostgreSQL client (via Supabase)
│       │   │   └── migrations/          # Future schema migrations
│       │   └── cron/
│       │       └── dogSync.ts           # node-cron 72h schedule
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/
│       ├── types.ts                     # Shared TypeScript interfaces
│       └── package.json
│
├── .env.example                         # All required env vars
├── .gitignore
├── package.json                         # Root (workspaces config)
└── README.md
```

---

## 3. Database Schema

```sql
-- ================================================
-- USERS
-- ================================================
CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     VARCHAR(255) UNIQUE NOT NULL,
  display_name              VARCHAR(100),
  auth_provider             VARCHAR(20) NOT NULL CHECK (auth_provider IN ('email', 'google', 'facebook')),
  avatar_url                VARCHAR(500),
  expo_push_token           VARCHAR(200),
  notification_new_matches  BOOLEAN DEFAULT true,
  notification_urgent_dogs  BOOLEAN DEFAULT true,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- USER PREFERENCES
-- ================================================
CREATE TABLE user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences     TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ================================================
-- DOGS
-- ================================================
CREATE TABLE dogs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  petfinder_id    VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(100) NOT NULL,
  breed_primary   VARCHAR(100),
  breed_secondary VARCHAR(100),
  age             VARCHAR(20) CHECK (age IN ('Baby', 'Young', 'Adult', 'Senior')),
  size            VARCHAR(20) CHECK (size IN ('Small', 'Medium', 'Large', 'Extra Large')),
  gender          VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Unknown')),
  description     TEXT,
  photos          JSONB DEFAULT '[]',
  tags            TEXT[] DEFAULT '{}',
  attributes      JSONB DEFAULT '{}',
  environment     JSONB DEFAULT '{}',
  petfinder_url   VARCHAR(500),
  organization_id VARCHAR(20) NOT NULL DEFAULT 'TX514',
  status          VARCHAR(20) NOT NULL DEFAULT 'adoptable' CHECK (status IN ('adoptable', 'unavailable')),
  published_at    TIMESTAMP WITH TIME ZONE,
  last_synced_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_dogs_petfinder_id ON dogs(petfinder_id);
CREATE INDEX idx_dogs_status ON dogs(status);
CREATE INDEX idx_dogs_organization ON dogs(organization_id);
CREATE INDEX idx_dogs_synced ON dogs(last_synced_at);
CREATE INDEX idx_dogs_published ON dogs(published_at);

-- ================================================
-- SWIPES
-- ================================================
CREATE TABLE swipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id      UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  direction   VARCHAR(5) NOT NULL CHECK (direction IN ('left', 'right')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, dog_id)
);

CREATE INDEX idx_swipes_user ON swipes(user_id);
CREATE INDEX idx_swipes_dog ON swipes(dog_id);
CREATE INDEX idx_swipes_direction ON swipes(user_id, direction);

-- ================================================
-- MATCHES
-- ================================================
CREATE TABLE matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id      UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  action      VARCHAR(10) NOT NULL CHECK (action IN ('adopt', 'foster', 'pending')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, dog_id)
);

CREATE INDEX idx_matches_user ON matches(user_id);
```

---

## 4. Shared TypeScript Types (`packages/shared/types.ts`)

```typescript
// ================================================
// CORE DOMAIN TYPES
// ================================================

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  auth_provider: 'email' | 'google' | 'facebook';
  avatar_url: string | null;
  notification_new_matches: boolean;
  notification_urgent_dogs: boolean;
  created_at: string;
}

export interface DogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

export interface DogAttributes {
  spayed_neutered: boolean;
  house_trained: boolean;
  special_needs: boolean;
  shots_current: boolean;
}

export interface DogEnvironment {
  children: boolean | null;
  dogs: boolean | null;
  cats: boolean | null;
}

export interface Dog {
  id: string;
  petfinder_id: string;
  name: string;
  breed_primary: string | null;
  breed_secondary: string | null;
  age: 'Baby' | 'Young' | 'Adult' | 'Senior';
  size: 'Small' | 'Medium' | 'Large' | 'Extra Large';
  gender: 'Male' | 'Female' | 'Unknown';
  description: string | null;
  photos: DogPhoto[];
  tags: string[];
  attributes: DogAttributes;
  environment: DogEnvironment;
  petfinder_url: string;
  organization_id: string;
  status: 'adoptable' | 'unavailable';
  published_at: string | null;
  // Computed fields (added by backend before sending to mobile)
  match_score: number | null; // null means no preferences set → show "New Arrival"
  matched_preferences: string[]; // which of the user's preferences this dog satisfies
}

export interface Swipe {
  id: string;
  user_id: string;
  dog_id: string;
  direction: 'left' | 'right';
  created_at: string;
}

export interface Match {
  id: string;
  user_id: string;
  dog_id: string;
  action: 'adopt' | 'foster' | 'pending';
  created_at: string;
}

export type PreferenceKey =
  | 'active_lifestyle'
  | 'experienced_with_cats'
  | 'cat_selective'
  | 'cuddler'
  | 'experienced_with_dogs'
  | 'dog_selective'
  | 'housetrained'
  | 'independent'
  | 'knows_tricks'
  | 'laid_back'
  | 'leash_trained'
  | 'loves_car_rides'
  | 'loves_food_and_treats'
  | 'loves_the_water'
  | 'medium_energy'
  | 'experienced_with_older_kids'
  | 'playful'
  | 'experienced_with_young_kids'
  | 'foster_eligible'
  | 'indoor_only'
  | 'indoor_outdoor'
  | 'long_term_resident'
  | 'quiet_home';

export interface UserPreferences {
  user_id: string;
  preferences: PreferenceKey[];
  updated_at: string;
}

// ================================================
// API RESPONSE TYPES
// ================================================

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}
```

---

## 5. API Contract Reference

All endpoints require `Authorization: Bearer <supabase_jwt>` header unless noted.

### Auth Endpoints (no auth required)
```
POST /auth/register
  Body:    { email, password, display_name }
  Returns: { data: { user: User, session: Session } }

POST /auth/login
  Body:    { email, password }
  Returns: { data: { user: User, session: Session } }

POST /auth/oauth
  Body:    { provider: 'google' | 'facebook', token: string }
  Returns: { data: { user: User, session: Session } }

POST /auth/logout
  Returns: { data: { success: true } }

POST /auth/resend-verification
  Body:    { email }
  Returns: { data: { success: true } }
```

### User Endpoints
```
GET  /me
  Returns: { data: { user: User, preferences: UserPreferences } }

PUT  /me
  Body:    { display_name?: string }
  Returns: { data: { user: User } }

PUT  /me/preferences
  Body:    { preferences: PreferenceKey[] }
  Returns: { data: { preferences: UserPreferences } }

DELETE /me
  Returns: { data: { success: true } }
```

### Dog Endpoints
```
GET  /dogs?page=1&limit=20
  Returns: { data: PaginatedResponse<Dog> }
  Note: sorted by match_score DESC, excludes already-swiped dogs

GET  /dogs/:id
  Returns: { data: Dog }
```

### Swipe Endpoints
```
POST /swipes
  Body:    { dog_id: string, direction: 'left' | 'right' }
  Returns: { data: { matched: boolean, dog: Dog } }

GET  /swipes/liked
  Returns: { data: Dog[] }
  Note: includes unavailable dogs with status field
```

### Match Endpoints
```
POST /matches
  Body:    { dog_id: string, action: 'adopt' | 'foster' }
  Returns: { data: { redirect_url: string } }
```

### Notification Endpoints
```
POST /notifications/token
  Body:    { token: string }
  Returns: { data: { success: true } }

PUT  /notifications/settings
  Body:    { new_matches?: boolean, urgent_dogs?: boolean }
  Returns: { data: { user: User } }
```

---

## 6. Data Integration — Dual-Source Prototype

### 6.1 Source 1: Austin SODA API

**Confirmed Column Names (verified against live API)**

The new ShelterBuddy-backed dataset uses different column names than the legacy dataset. Always use these exact names:

| Assumed Name | ✅ Actual Column Name |
|---|---|
| `animal_type` | `type` |
| `name` | `name_at_intake` |
| `breed` | `primary_breed` |
| `color` | `primary_color` |
| `age` | *(not available — derive from `date_of_birth`)* |
| `intake_date_time` | `source_date` |

**Full column list:** `source_date`, `animal_id`, `type`, `source_name`, `name_at_intake`, `ispreviouslyspayedneutered`, `sex`, `primary_breed`, `primary_color`, `secondary_color`, `intake_health_condition`, `date_of_birth`, `found_address`

**Determining Currently Adoptable Dogs**

```
Step 1: Fetch all dog intakes
GET https://data.austintexas.gov/resource/pyqf-r2dc.json
  ?$where=type='Dog'
  &$limit=1000
  &$offset={page * 1000}
  Header: X-App-Token: {SODA_APP_TOKEN}   ← optional but recommended

Step 2: Fetch all dog outcomes
GET https://data.austintexas.gov/resource/9t4d-g238.json
  ?$where=type='Dog'
  &$limit=1000
  &$offset={page * 1000}

Step 3: Compute currently-sheltered set
  intakeIds = Set of all animal_id from intakes
  outcomeMap = Map<animal_id, most_recent_outcome_type>

  adoptable = intakeIds.filter(id => {
    const outcome = outcomeMap.get(id)
    const terminalOutcomes = ['Adoption', 'Euthanasia', 'Died', 'Missing']
    return !outcome || !terminalOutcomes.includes(outcome)
  })
```

**SODA Fields → Dog Schema**
```
animal_id        → dogs.external_id      (e.g., "A929698")
name_at_intake   → dogs.name             (NOT `name`)
primary_breed    → dogs.breed_primary    (NOT `breed`)
sex              → dogs.gender
date_of_birth    → dogs.age_group        (calculate from DOB, NOT a pre-parsed string)
primary_color    → dogs.color            (NOT `color`)
source_date      → dogs.intake_date      (NOT `intake_date_time`)
```

**Age Calculation from date_of_birth**
```typescript
function calculateAgeGroup(dateOfBirth: string): AgeGroup {
  const ageInYears =
    (Date.now() - new Date(dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageInYears < 0.5) return 'Baby';
  if (ageInYears < 2)   return 'Young';
  if (ageInYears < 7)   return 'Adult';
  return 'Senior';
}

// Days in shelter (for long-stay alert logic):
const daysInShelter = Math.floor(
  (Date.now() - new Date(source_date).getTime()) / (1000 * 60 * 60 * 24)
);
// daysInShelter > 21 → satisfies long_term_resident preference
```

### 6.2 Source 2: adopets.com Targeted Scrape

**Playwright Scraping Flow**

```typescript
// adopetsScraper.ts
async function scrapeAnimalProfile(animalId: string): Promise<ScrapedDogData | null> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to AAC shelter page and find this animal's listing
    await page.goto('https://adopt.adopets.com/shelter/austin-animal-center');
    await page.waitForLoadState('networkidle');

    // Find the pet card matching our animal ID
    // adopets.com shows AAC IDs on each card
    const petUrl = await findPetUrlByAnimalId(page, animalId);
    if (!petUrl) return null;

    // Navigate to individual pet profile
    await page.goto(petUrl);
    await page.waitForLoadState('networkidle');

    // Extract data
    const photos = await extractPhotos(page);
    const tags = await extractTags(page);
    const description = await extractDescription(page);

    return { photos, tags, description, adoption_url: petUrl };

  } catch (err) {
    logger.error(`Scrape failed for ${animalId}: ${err}`);
    return null;
  } finally {
    await browser.close();
    // Rate limit: wait 5s ± 2s jitter before next scrape
    await sleep(5000 + Math.random() * 2000);
  }
}
```

### 6.3 DataSource Interface (Future-Proof)

```typescript
// datasource.ts — the contract all data adapters must fulfill
export interface DataSource {
  name: string;
  fetchAdoptableDogs(): Promise<RawDog[]>;
}

// SodaAdopetsDataSource — used for the prototype
export class SodaAdopetsDataSource implements DataSource {
  name = 'soda-adopets-prototype';
  async fetchAdoptableDogs(): Promise<RawDog[]> {
    const sodaDogs = await fetchCurrentShelterDogs();      // Source 1
    const enriched = await enrichWithScrapedData(sodaDogs); // Source 2
    return enriched;
  }
}

// TODO: ShelterBuddyDataSource
// When AAC provides ShelterBuddy API credentials:
// 1. Create ShelterBuddyDataSource implements DataSource
// 2. Change one line in dogSync.ts: const source = new ShelterBuddyDataSource()
// 3. Delete SodaAdopetsDataSource — nothing else changes
export class ShelterBuddyDataSource implements DataSource {
  name = 'shelterbuddy';
  // POST {shelter_url}/api/v2/animal/list?page={n}&pageSize=100
  // SearchGroupId: configured in ShelterBuddy admin for "adoptable" animals
  async fetchAdoptableDogs(): Promise<RawDog[]> {
    throw new Error('Not yet implemented — awaiting AAC API credentials');
  }
}
```

### 6.4 Cron Sync Flow

```
[Cron fires every 72 hours]
         ↓
[DataSource.fetchAdoptableDogs()]
         ↓
[Step 1: SODA API → get current shelter dog list]
         ↓
[Step 2: For each dog not in DB or missing photos
         → Playwright scrape adopets.com profile]
         ↓
[Step 3: Upsert all dogs into PostgreSQL]
         ↓
[Step 4: Mark dogs no longer in shelter → status = 'unavailable']
         ↓
[Step 5: Collect newly-added dog IDs → trigger push notifications]
         ↓
[Step 6: Check long-stay dogs (intake_date > 21 days) → urgent alerts]
```

---

## 7. Match Score Algorithm

```typescript
function calculateMatchScore(
  dog: Dog,
  userPreferences: PreferenceKey[]
): { score: number | null; matched: PreferenceKey[] } {
  
  // No preferences → no score
  if (userPreferences.length === 0) return { score: null, matched: [] };

  const matched: PreferenceKey[] = [];

  for (const pref of userPreferences) {
    if (dogSatisfiesPreference(dog, pref)) {
      matched.push(pref);
    }
  }

  const score = Math.round((matched.length / userPreferences.length) * 100);
  return { score, matched };
}
```

The `dogSatisfiesPreference()` function uses the tag normalization map:

```typescript
// Example normalization entries
const TAG_MAP: Record<PreferenceKey, (dog: Dog) => boolean> = {
  active_lifestyle: (dog) =>
    dog.tags.some(t => ['active', 'high energy', 'energetic'].includes(t.toLowerCase())),
  
  housetrained: (dog) =>
    dog.attributes.house_trained === true,
  
  experienced_with_cats: (dog) =>
    dog.environment.cats === true,
  
  long_term_resident: (dog) =>
    dog.published_at
      ? Date.now() - new Date(dog.published_at).getTime() > 21 * 24 * 60 * 60 * 1000
      : false,

  // ... all 23 preferences mapped
};
```

---

## 8. Push Notification Flow

```
[Cron runs every 72h]
        ↓
[Fetch all dogs from Petfinder]
        ↓
[Upsert into DB — identify NEW dog IDs]
        ↓
        ├──→ [For each new dog]
        │        ↓
        │    [Find users where match_score > 0 AND notification_new_matches = true]
        │        ↓
        │    [Send Expo push: "🐾 New match alert! {name} just arrived"]
        │
        └──→ [Find dogs where published_at < 21 days ago AND status = adoptable]
                 ↓
             [For each urgent dog]
                 ↓
             [Find users who haven't swiped this dog AND notification_urgent_dogs = true]
                 ↓
             [Send Expo push: "❤️ {name} has been at the shelter for {days} days"]
```

**Expo Push API call:**
```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json

{
  "to": "{expo_push_token}",
  "title": "Fetch 🐾",
  "body": "New match alert! Biscuit just arrived and matches your preferences.",
  "data": { "dog_id": "..." }
}
```

---

## 9. Environment Variables

```env
# ── BACKEND ──────────────────────────────────────
DATABASE_URL=postgresql://...
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
JWT_SECRET=your_jwt_secret
PORT=3000
NODE_ENV=development
SODA_APP_TOKEN=your_optional_soda_app_token   # Free — register at data.austintexas.gov
                                               # Increases rate limits from 1000/hr to 10000/hr

# ── MOBILE (Expo public vars) ─────────────────────
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
FACEBOOK_APP_ID=your_facebook_app_id
```

---

## 10. Third-Party Services Setup Checklist

### Austin SODA API (No setup required)
- [ ] No API key needed for basic access
- [ ] Optional: Register a free app token at https://data.austintexas.gov/profile/app_tokens to increase rate limits
- [ ] Test intakes endpoint: `curl "https://data.austintexas.gov/resource/pyqf-r2dc.json?$where=animal_type='Dog'&$limit=5"`
- [ ] Test outcomes endpoint: `curl "https://data.austintexas.gov/resource/9t4d-g238.json?$where=animal_type='Dog'&$limit=5"`

### Playwright (adopets.com scraper)
- [ ] `npm install playwright` in backend
- [ ] `npx playwright install chromium` to download browser binary
- [ ] Run a test scrape against https://adopt.adopets.com/shelter/austin-animal-center to verify selectors work
- [ ] Note: If deploying to Railway, ensure Playwright chromium can run in the container (may need `--no-sandbox` flag)

### Supabase
- [ ] Create new project at https://supabase.com
- [ ] Copy Project URL and anon key → mobile env vars
- [ ] Copy service_role key → backend env vars
- [ ] Enable Email auth with "Confirm email" turned ON
- [ ] Enable Google OAuth provider
- [ ] Enable Facebook OAuth provider
- [ ] Add redirect URL: `fetch://auth/callback`
- [ ] Run `schema.sql` in Supabase SQL editor

### Google OAuth
- [ ] Create project in Google Cloud Console
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 credentials (iOS + Android client IDs)
- [ ] Add redirect URI: `fetch://auth/callback`

### Facebook OAuth
- [ ] Create app at https://developers.facebook.com
- [ ] Add Facebook Login product
- [ ] Add redirect URI: `fetch://auth/callback`
- [ ] Note App ID → mobile env vars

### Expo / EAS
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Run `eas build:configure`
- [ ] Add push notification credentials in EAS dashboard

### Railway (Backend Hosting)
- [ ] Connect GitHub repo
- [ ] Add backend service pointing to `apps/backend`
- [ ] Add all backend env vars in Railway dashboard
- [ ] Verify Playwright/Chromium works in Railway environment (test with a manual trigger)
- [ ] Enable automatic deploys on main branch push

---

## 11. Key Dependencies

### Mobile (`apps/mobile`)
```json
{
  "expo": "~51.0.0",
  "expo-router": "~3.5.0",
  "react-native": "0.74.x",
  "react-native-gesture-handler": "~2.16.0",
  "react-native-reanimated": "~3.10.0",
  "react-native-confetti-cannon": "^1.5.2",
  "@supabase/supabase-js": "^2.43.0",
  "expo-secure-store": "~13.0.0",
  "expo-auth-session": "~5.5.0",
  "expo-web-browser": "~13.0.0",
  "expo-image": "~1.12.0",
  "expo-notifications": "~0.28.0",
  "expo-linking": "~6.3.0",
  "@expo-google-fonts/nunito": "^0.2.3",
  "zustand": "^4.5.0",
  "axios": "^1.7.0"
}
```

### Backend (`apps/backend`)
```json
{
  "fastify": "^4.27.0",
  "@fastify/cors": "^9.0.0",
  "@fastify/jwt": "^8.0.0",
  "@supabase/supabase-js": "^2.43.0",
  "playwright": "^1.44.0",
  "node-cron": "^3.0.3",
  "axios": "^1.7.0",
  "dotenv": "^16.4.0"
}
```
