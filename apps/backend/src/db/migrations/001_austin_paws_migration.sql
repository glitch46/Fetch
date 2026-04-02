-- ================================================
-- Migration: Replace Petfinder/SODA data sources with Austin Paws Portal API
-- This migration:
--   1. Deletes all existing dog data (and cascading swipes/matches)
--   2. Renames petfinder_id -> external_id
--   3. Renames petfinder_url -> adoption_url
--   4. Adds new Austin Paws-specific columns
--   5. Recreates indexes
-- ================================================

-- Step 1: Delete all existing dogs (cascades to swipes and matches via FK)
DELETE FROM matches;
DELETE FROM swipes;
DELETE FROM dogs;

-- Step 2: Rename columns
ALTER TABLE dogs RENAME COLUMN petfinder_id TO external_id;
ALTER TABLE dogs RENAME COLUMN petfinder_url TO adoption_url;

-- Step 3: Drop old indexes and recreate with new names
DROP INDEX IF EXISTS idx_dogs_petfinder_id;
CREATE UNIQUE INDEX idx_dogs_external_id ON dogs(external_id);

-- Step 4: Add new columns for Austin Paws Portal data
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS description_html TEXT;
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS dot_color VARCHAR(20);
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS kennel_number VARCHAR(20);
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS location VARCHAR(100);
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS eligible_for_foster BOOLEAN;
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS adopter_notes TEXT;
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS foster BOOLEAN DEFAULT false;

-- Verify: list columns on dogs table
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dogs' ORDER BY ordinal_position;
