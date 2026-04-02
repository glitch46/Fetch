-- ================================================
-- Fetch Database Schema
-- Run this in Supabase SQL Editor
-- ================================================

-- USERS
-- The id column maps directly to Supabase Auth auth.users.id
-- This ensures a 1:1 mapping between auth and app user records
CREATE TABLE users (
  id                        UUID PRIMARY KEY,  -- Supabase Auth user ID (auth.users.id)
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

CREATE INDEX idx_users_email ON users(email);

-- USER PREFERENCES
CREATE TABLE user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences     TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- DOGS
-- external_id stores the shelter animal ID (e.g., Austin Paws animal_id "19138")
-- adoption_url stores the adoption deep-link URL (e.g., adopets.com pet page)
-- published_at stores the intake date — used for long_term_resident check and days_in_shelter
CREATE TABLE dogs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id       VARCHAR(50) UNIQUE NOT NULL,
  name              VARCHAR(100) NOT NULL,
  breed_primary     VARCHAR(100),
  breed_secondary   VARCHAR(100),
  color             VARCHAR(100),
  age               VARCHAR(20) CHECK (age IN ('Baby', 'Young', 'Adult', 'Senior')),
  size              VARCHAR(20) CHECK (size IN ('Small', 'Medium', 'Large', 'Extra Large')),
  gender            VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Unknown')),
  description       TEXT,
  description_html  TEXT,                                   -- raw HTML description from Austin Paws
  photos            JSONB DEFAULT '[]',
  tags              TEXT[] DEFAULT '{}',
  attributes        JSONB DEFAULT '{}',
  environment       JSONB DEFAULT '{}',
  adoption_url      VARCHAR(500),                           -- adopets.com pet page URL
  organization_id   VARCHAR(20) NOT NULL DEFAULT 'TX514',
  status            VARCHAR(20) NOT NULL DEFAULT 'adoptable' CHECK (status IN ('adoptable', 'unavailable')),
  intake_date       TIMESTAMP WITH TIME ZONE,
  published_at      TIMESTAMP WITH TIME ZONE,
  last_synced_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Austin Paws Portal-specific fields
  dot_color         VARCHAR(20),                            -- color-coded handling indicator (blue/purple/orange/yellow/red/green)
  kennel_number     VARCHAR(20),                            -- kennel assignment
  location          VARCHAR(100),                           -- physical location string
  is_urgent         BOOLEAN DEFAULT false,                  -- flagged as urgent
  eligible_for_foster BOOLEAN,                              -- eligible for foster placement
  adopter_notes     TEXT,                                   -- notes visible to adopters
  foster            BOOLEAN DEFAULT false,                  -- currently in foster care
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_dogs_external_id ON dogs(external_id);
CREATE INDEX idx_dogs_status ON dogs(status);
CREATE INDEX idx_dogs_organization ON dogs(organization_id);
CREATE INDEX idx_dogs_synced ON dogs(last_synced_at);
CREATE INDEX idx_dogs_published ON dogs(published_at);

-- SWIPES
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

-- MATCHES
CREATE TABLE matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id      UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  action      VARCHAR(10) NOT NULL CHECK (action IN ('adopt', 'foster', 'pending')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, dog_id)
);

CREATE INDEX idx_matches_user ON matches(user_id);

-- ================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
