# Fetch — Product Requirements Document
**Tagline:** Find your pawfect match!
**Version:** 1.0
**Date:** 2026-02-27
**Status:** Ready for Development

---

## 1. Product Overview

### 1.1 Vision
Fetch is a mobile application that helps people find their ideal rescue dog through a swipe-based matching experience inspired by Tinder. Users set their lifestyle preferences, then swipe through adoptable dogs from the Austin Animal Center. A real-time match score on each card shows how well each dog fits the user's preferences. When a user swipes right and "matches," they are guided seamlessly into either a foster or adoption inquiry flow.

### 1.2 Mission
To increase dog adoption rates at Austin Animal Center by making the discovery process joyful, personalized, and frictionless — getting more dogs out of shelters and into loving homes.

### 1.3 Tagline
**"Find your pawfect match!"**

### 1.4 Target Platforms
- iOS (iPhone, iPad)
- Android (phone and tablet)
- Built with React Native + Expo for cross-platform coverage

### 1.5 MVP Scope
- Single shelter: Austin Animal Center, Austin TX
- Dog species only (cats and other animals are out of scope for v1)
- English language only

---

## 2. Goals & Success Metrics

| Goal | Metric | Target (6 months post-launch) |
|------|--------|-------------------------------|
| Drive adoption inquiries | # of adopt/foster actions completed in app | 200/month |
| Engagement | Average swipes per session | 15+ |
| Retention | Week-2 retention rate | 35% |
| Data freshness | Dog data staleness | Never older than 3 days |
| Auth conversion | % of visitors who create an account | 60% |

---

## 3. User Personas

### 3.1 Active Adopter — "Maya"
- 28 years old, Austin local, active lifestyle (runs, hikes)
- Knows she wants a dog but overwhelmed by shelter website listings
- Wants a quick, fun way to find a dog that fits her energy level
- Will complete adoption if the flow is simple

### 3.2 Consideration Browser — "James"
- 35 years old, family with two kids
- Not sure if the timing is right, browsing casually
- Needs to see lifestyle compatibility before he'll commit to visiting
- Push notifications about urgent dogs could tip him into action

### 3.3 Foster-First — "Priya"
- 24 years old, renting, uncertain about long-term commitment
- Wants to foster to test the experience before adopting
- Needs a clear, low-friction path to the foster application

---

## 4. User Flows

### 4.1 Onboarding Flow
1. Splash screen — Fetch logo + tagline animation
2. "Get Started" CTA
3. Auth screen — options: **Email + verification**, **Continue with Google**, **Continue with Facebook**
4. Email verification gate (if email registration selected)
5. Preference Selection screen (see Section 6.2) — user selects all that apply
6. Transition to main Swipe Deck

### 4.2 Swipe Flow
1. User sees a card stack of dogs, sorted by match score (highest first)
2. Each card displays:
   - Primary dog photo (full-bleed, swipeable photo gallery within card)
   - Dog name, breed, age, size
   - Match score badge (e.g., "92% Match 🐾")
   - Top 3 matching preference tags highlighted
3. Swipe RIGHT = Like / Match
4. Swipe LEFT = Pass
5. Tap card = Expand to full dog profile (all photos, full description, all characteristics)

### 4.3 Match Flow (Right Swipe)
1. Full-screen confetti animation fires
2. Bold overlay text: **"You matched with [Dog Name]! 🎉"**
3. Modal appears with two buttons:
   - 🏠 **Adopt** → Opens Austin Animal Center's specific dog adoption page (Petfinder URL from API)
   - 💛 **Foster** → Opens in-app browser to `https://www.austintexas.gov/page/foster-care-application`
4. "Maybe Later" dismisses modal and returns to swipe deck (dog is saved to Liked Dogs list)

### 4.4 Liked Dogs Flow
1. Bottom nav tab: ❤️ Liked Dogs
2. Grid view of all right-swiped dogs
3. Tap any dog to view full profile
4. "Adopt" and "Foster" buttons available on every profile
5. If a dog is no longer available (removed from Petfinder), card shows "No Longer Available" state gracefully

### 4.5 Profile & Preferences Flow
1. Bottom nav tab: 👤 Profile
2. Displays user name, email, auth method
3. "Edit My Preferences" — re-opens preference selection screen
4. "Notification Settings"
5. "Log Out"

---

## 5. Data Architecture

### 5.1 Data Sources — Dual-Source Prototype Strategy

> **Context:** The Petfinder API was decommissioned in December 2024. The app uses a two-source approach for the prototype: the City of Austin's free public SODA API for the authoritative list of currently-in-shelter animals, combined with targeted scraping of adopets.com for photos and behavioral tags. This approach is intentionally designed for easy migration to the ShelterBuddy API once AAC grants access.

**Source 1 — Austin Open Data SODA API (No key required, public domain)**
- Intakes dataset (current, ShelterBuddy-backed, refreshed hourly): `GET https://data.austintexas.gov/resource/pyqf-r2dc.json`
- Outcomes dataset: `GET https://data.austintexas.gov/resource/9t4d-g238.json`
- Logic: A dog is "currently adoptable" if it appears in Intakes but has NO corresponding outcome record, or its last outcome was a return to shelter
- Fields available: `animal_id`, `name`, `species`, `breed`, `color`, `sex`, `age`, `intake_type`, `intake_date`
- Fields NOT available: photos, behavioral tags — these come from Source 2

**Source 2 — Targeted adopets.com Scrape (photos + behavioral tags only)**
- adopets.com is AAC's official public adoption portal — data is intended to be publicly viewed
- Scraping scope is intentionally **narrow**: only fetch the profile page for each animal ID already known from Source 1 (not a full site crawl)
- Use Playwright (headless Chromium) since the site is a JavaScript-rendered React SPA
- Fields to extract per animal: primary photo, all photos, behavioral tags/characteristics, full description, adoption page URL
- Polite scraping rules: max 1 request per 5 seconds, randomized jitter, respect any `Retry-After` headers

**Why this is viable for a prototype:**
- The SODA data is 100% legal, public domain, and city-published
- The adopets.com scrape is narrow and rate-limited — fetching publicly displayed information for known animal IDs only
- AAC animal IDs (`A929698` format) are consistent across both sources, making joins trivial
- When AAC grants ShelterBuddy API access, ONLY the Data Agent changes — zero changes needed to backend routes or mobile app

### 5.2 Data Refresh Strategy
- Backend cron job runs every **72 hours** (3 days)
- Step 1: Fetch latest intakes + outcomes from SODA API → compute currently-available dog list
- Step 2: For each dog not yet in the local DB (or missing photos/tags), scrape adopets.com profile
- Step 3: Upsert all data into local PostgreSQL `dogs` table
- Dogs no longer in shelter are marked `status = 'unavailable'` (not deleted, for liked list UX)
- Photos stored as URLs pointing to adopets.com CDN (not re-hosted)
- Rate limiter: max 1 request/5 seconds with random jitter (±2s)

### 5.3 Database Schema

#### `users`
```
id              UUID PRIMARY KEY
email           VARCHAR UNIQUE
display_name    VARCHAR
auth_provider   ENUM('email', 'google', 'facebook')
avatar_url      VARCHAR
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### `user_preferences`
```
id              UUID PRIMARY KEY
user_id         UUID FK → users.id
preferences     TEXT[] (array of preference keys, e.g. ['active_lifestyle', 'cuddler'])
updated_at      TIMESTAMP
```

#### `dogs`
```
id              UUID PRIMARY KEY
petfinder_id    VARCHAR UNIQUE
name            VARCHAR
breed_primary   VARCHAR
breed_secondary VARCHAR
age             ENUM('Baby', 'Young', 'Adult', 'Senior')
size            ENUM('Small', 'Medium', 'Large', 'Extra Large')
gender          ENUM('Male', 'Female')
description     TEXT
photos          JSONB   -- array of {small, medium, large, full} URL objects
tags            TEXT[]  -- e.g. ['Playful', 'Cuddler', 'Housetrained']
attributes      JSONB   -- house_trained, special_needs, shots_current, etc.
environment     JSONB   -- {children: bool, dogs: bool, cats: bool}
petfinder_url   VARCHAR -- direct link to the dog's Petfinder/AAC adoption page
organization_id VARCHAR -- 'TX514' for Austin Animal Center
status          ENUM('adoptable', 'unavailable')
last_synced_at  TIMESTAMP
created_at      TIMESTAMP
```

#### `swipes`
```
id              UUID PRIMARY KEY
user_id         UUID FK → users.id
dog_id          UUID FK → dogs.id
direction       ENUM('left', 'right')
created_at      TIMESTAMP
UNIQUE(user_id, dog_id)
```

#### `matches`
```
id              UUID PRIMARY KEY
user_id         UUID FK → users.id
dog_id          UUID FK → dogs.id
action          ENUM('adopt', 'foster', 'pending')  -- 'pending' = modal dismissed without choosing
created_at      TIMESTAMP
```

---

## 6. Features Specification

### 6.1 Authentication

| Method | Notes |
|--------|-------|
| Email + Password | Requires email verification before access |
| Google OAuth | One-tap sign-in via Google |
| Facebook OAuth | One-tap sign-in via Facebook |

All auth handled via **Supabase Auth**. JWT tokens stored securely in device keychain (not AsyncStorage).

### 6.2 Preference Selection

Users select any combination of the following preferences at onboarding (and can update anytime in Profile). Each maps to a Petfinder tag or attribute:

| User-Facing Label | Petfinder Mapping |
|---|---|
| Active Lifestyle | tag: "Active" or "Energetic" |
| Experienced with Cats | environment.cats = true |
| Cat Selective | tag: "Cat Selective" |
| Cuddler | tag: "Affectionate" or "Cuddly" |
| Experienced with Dogs | environment.dogs = true |
| Dog Selective | tag: "Dog Selective" |
| Housetrained | attributes.house_trained = true |
| Independent | tag: "Independent" |
| Knows Tricks | tag: "Trained" or "Knows Commands" |
| Laid Back | tag: "Calm" or "Mellow" |
| Leash Trained | tag: "Leash Trained" |
| Loves Car Rides | tag: "Loves Car Rides" |
| Loves Food & Treats | tag: "Food Motivated" |
| Loves The Water | tag: "Loves Water" |
| Medium Energy | tag: "Medium Energy" |
| Experienced with Older Kids | environment.children = true + tag context |
| Playful | tag: "Playful" |
| Experienced with Young Kids | environment.children = true |
| Foster Eligible | tag: "Foster" or organization-specific status |
| Indoor Only | tag: "Indoor Only" |
| Indoor/Outdoor | tag: "Indoor/Outdoor" |
| Long-term Resident | derived from: days in shelter > threshold |
| Quiet Home | tag: "Quiet Home" |

> **Note:** Tag matching is case-insensitive and fuzzy. The Data Agent should build a normalization map during the Petfinder sync to align Petfinder's variable tagging to these canonical preference keys.

### 6.3 Match Score Algorithm

```
match_score = (matched_preferences / total_user_preferences) * 100
```

- Calculated server-side on each API call and returned with each dog object
- Dogs sorted by match_score descending in the swipe deck
- Score displayed as a badge on every card: e.g., **"87% Match 🐾"**
- Dogs with 0% still appear at the bottom of the deck — no dog is hidden entirely
- If user has set 0 preferences, all dogs show "New Arrival" badge instead of a score

### 6.4 Swipe Deck

- Maximum 50 dogs loaded per session (paginated from server)
- Within a session, already-swiped dogs are excluded from the deck
- Across sessions, dogs the user has previously swiped do NOT re-appear (server-side exclusion via `swipes` table)
- Card supports horizontal swipe gesture with directional color hint (green tint = right, red tint = left)
- Tap and hold to peek at more photos within card
- Tap card to expand full profile modal
- When deck is empty: "You've seen all available dogs! Check back after our next refresh 🐾" screen with option to revisit Liked Dogs

### 6.5 Dog Profile (Full View)

- Full photo gallery (swipeable)
- Name, breed, age, size, gender
- Match score + which of the user's preferences this dog satisfies (highlighted chips)
- Full description
- All tags/characteristics
- "Adopt" and "Foster" CTA buttons always visible
- Share button (share dog profile link to Petfinder)

### 6.6 Push Notifications

| Trigger | Message Example |
|---------|-----------------|
| New dog added that matches ≥1 user preference | "🐾 New match alert! Biscuit just arrived and matches your preferences." |
| Urgent/long-stay dog | "❤️ Rufus has been at the shelter for 30 days and needs a home. He's a great match for you." |

- Powered by **Expo Push Notifications** (wraps APNs + FCM)
- Users can opt out per-category in notification settings
- Urgent dog threshold: dog has been at shelter > 21 days (derived from `created_at` in dogs table or Petfinder's `published_at` field)

### 6.7 Liked Dogs List

- Accessible from bottom navigation at all times
- Grid of right-swiped dogs, newest first
- "Adopt" and "Foster" buttons on each card
- If dog is marked `unavailable`, show greyed-out card with "No Longer Available" badge
- No rewind/undo for left swipes (intentional — keeps the experience clean)

---

## 7. UX & Design Guidelines

### 7.1 Brand
- **App Name:** Fetch
- **Tagline:** Find your pawfect match!
- **Primary Color:** Warm amber/golden (`#F5A623`) — warm, dog-friendly, joyful
- **Secondary Color:** Deep teal (`#1A7F74`) — trustworthy, shelter-aligned
- **Background:** Off-white (`#FAFAF8`)
- **Font:** Nunito (rounded, friendly, highly legible on mobile)
- **Iconography:** Rounded, playful, paw-themed where appropriate

### 7.2 Card Design
- Full-bleed photo (no letterboxing)
- Name + breed overlaid at bottom with subtle gradient scrim
- Match score badge top-right (amber pill)
- Swipe interaction: card tilts 15° in direction of swipe, color tint appears

### 7.3 Confetti Match Animation
- Library: `react-native-confetti-cannon` or equivalent
- Colors: brand amber + teal + white
- Duration: 2 seconds
- Overlay text: large, bold, centered — animated scale-in

### 7.4 Accessibility
- All images have `accessibilityLabel` with dog name and breed
- Text meets WCAG AA contrast ratio minimums
- Swipe gestures have tap-based alternatives (Like / Pass buttons below card)

---

## 8. Technical Architecture

### 8.1 Stack Summary

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo (SDK 51+) |
| Navigation | Expo Router (file-based) |
| State Management | Zustand |
| Backend API | Node.js + Fastify |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Push Notifications | Expo Push Notifications (APNs + FCM) |
| Hosting | Railway (backend) + Supabase (DB/Auth) |
| Animal Data (Source 1) | Austin SODA API — no key required |
| Animal Data (Source 2) | Playwright headless scraper (adopets.com — photos + tags only) |
| Cron | node-cron (within backend process) |

### 8.2 API Endpoints (Backend → Mobile)

```
POST   /auth/register          Register with email
POST   /auth/login             Login with email
POST   /auth/oauth             OAuth token exchange (Google/Facebook)

GET    /me                     Get current user profile
PUT    /me/preferences         Update user preferences

GET    /dogs                   Get paginated dog list with match scores
       ?page=1&limit=20
GET    /dogs/:id               Get single dog full profile

POST   /swipes                 Record a swipe {dog_id, direction}
GET    /swipes/liked           Get all right-swiped dogs for current user

POST   /matches                Record match action {dog_id, action}

POST   /notifications/token    Register Expo push token
PUT    /notifications/settings Update notification preferences
```

### 8.3 Environment Variables

```env
# Backend
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
JWT_SECRET=
SODA_APP_TOKEN=           # Optional — increases SODA rate limits, free to register at data.austintexas.gov

# Mobile (Expo)
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_CLIENT_ID=
FACEBOOK_APP_ID=
```

---

## 9. Out of Scope for v1

- Cats and other animals
- Multiple shelter support (planned for v2)
- In-app messaging or chat
- User photo upload / profile customization beyond name
- Breed-based filtering UI (preference system covers this indirectly)
- Web version
- Payments or premium subscription tier

---

## 10. Future Roadmap (v2+)

- Multi-shelter support (add any Petfinder organization ID)
- Cats and small animals
- "Super Like" feature — flags user interest to shelter staff
- In-app breed education cards
- Foster-to-adopt tracking
- Shelter admin dashboard
- Web companion app

---

## 11. Legal & Compliance

- **Privacy Policy** required before App Store / Play Store submission
- **Terms of Service** required
- **GDPR / CCPA:** User data deletion endpoint required (`DELETE /me`)
- **Petfinder API ToS:** Attribution to Petfinder required on any screen displaying their data — include small "Powered by Petfinder" footer on dog cards
- **App Store / Play Store:** App category = Lifestyle; no age restriction required
