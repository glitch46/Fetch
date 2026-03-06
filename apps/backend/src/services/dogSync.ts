// Dog sync orchestrator — owned by Data Agent
// Fetches from DataSource, normalizes tags, upserts to PostgreSQL,
// marks missing dogs as unavailable, and returns new dog IDs for notifications

import { PetfinderDataSource } from './petfinderDataSource.js';
import { normalizeRawTags } from './tagNormalization.js';
import { supabase } from '../db/client.js';
import type { RawDog } from './datasource.js';

const dataSource = new PetfinderDataSource();

/**
 * Main sync function called by the cron job.
 *
 * Flow:
 * 1. Fetch all adoptable dogs from the DataSource
 * 2. Normalize tags using the SCRAPED_TAG_MAP
 * 3. Convert raw photo URLs to DogPhoto objects for DB storage
 * 4. Upsert each dog into the dogs table
 * 5. Mark dogs NOT in the current fetch as 'unavailable'
 * 6. Return IDs of newly inserted dogs (for push notifications)
 */
export async function syncDogs(limit?: number): Promise<string[]> {
  console.log(`[SYNC] Starting dog sync...${limit ? ` (limit: ${limit})` : ''}`);
  const startTime = Date.now();

  // Step 1: Fetch from DataSource
  let rawDogs: RawDog[];
  try {
    rawDogs = await dataSource.fetchAdoptableDogs(limit);
  } catch (err) {
    console.error('[SYNC] DataSource fetch failed:', err);
    throw err;
  }

  if (rawDogs.length === 0) {
    console.warn('[SYNC] No dogs returned from DataSource — skipping upsert');
    return [];
  }

  console.log(`[SYNC] Processing ${rawDogs.length} dogs for upsert...`);

  // Step 2-4: Normalize and upsert each dog
  const currentExternalIds: string[] = [];
  const newDogIds: string[] = [];

  for (const raw of rawDogs) {
    try {
      // Permanent rule: if dog is already in app, skip processing it
      const { data: existing } = await supabase
        .from('dogs')
        .select('id')
        .eq('petfinder_id', raw.external_id)
        .single();

      if (existing) {
        currentExternalIds.push(raw.external_id);
        continue;
      }

      // Normalize tags from raw scraped strings to canonical keys
      const normalizedTags = normalizeRawTags(raw.tags);

      // Photos already come as proper objects with size variants from the data source
      const photos = raw.photos;

      // Build attributes from available data
      const attributes = {
        spayed_neutered: false,  // SODA provides this but it's on ShelterDog, not RawDog
        house_trained: normalizedTags.includes('housetrained'),
        special_needs: false,
        shots_current: false,
      };

      // Build environment from normalized tags
      const environment = {
        children: normalizedTags.includes('experienced_with_older_kids') || normalizedTags.includes('experienced_with_young_kids') ? true : null,
        dogs: normalizedTags.includes('experienced_with_dogs') ? true : normalizedTags.includes('dog_selective') ? false : null,
        cats: normalizedTags.includes('experienced_with_cats') ? true : normalizedTags.includes('cat_selective') ? false : null,
      };

      const isNew = true;

      // Upsert into dogs table
      const { data: upserted, error: upsertError } = await supabase
        .from('dogs')
        .upsert(
          {
            petfinder_id: raw.external_id,
            name: raw.name,
            breed_primary: raw.breed_primary,
            breed_secondary: raw.breed_secondary,
            color: raw.color,
            age: raw.age_group,
            size: raw.size || 'Medium',
            gender: raw.gender,
            description: raw.description,
            photos: photos,
            tags: normalizedTags,
            attributes,
            environment,
            petfinder_url: raw.adoption_url,
            status: 'adoptable',
            intake_date: raw.intake_date?.toISOString() || null,
            published_at: raw.intake_date?.toISOString() || null,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'petfinder_id' }
        )
        .select('id')
        .single();

      if (upsertError) {
        console.error(`[SYNC] Upsert failed for ${raw.external_id}:`, upsertError.message);
        continue;
      }

      currentExternalIds.push(raw.external_id);

      if (isNew && upserted) {
        newDogIds.push(upserted.id);
      }
    } catch (err) {
      // Individual dog upsert failure must NOT crash the entire sync
      console.error(`[SYNC] Error processing dog ${raw.external_id}:`, err);
      continue;
    }
  }

  console.log(`[SYNC] Added ${newDogIds.length} new dogs (${currentExternalIds.length}/${rawDogs.length} active profiles retained)`);

  // Step 5: DELETE dogs NOT in current fetch (no longer on Petfinder)
  // Only do this on full syncs. Limited sync runs are incremental and should not prune.
  // Cascade deletes will remove associated swipes and matches automatically.
  if (!limit && currentExternalIds.length > 0) {
    const { data: deletedDogs, error: deleteError } = await supabase
      .from('dogs')
      .delete()
      .not('petfinder_id', 'in', `(${currentExternalIds.map((id) => `"${id}"`).join(',')})`)
      .select('id');

    if (deleteError) {
      console.error('[SYNC] Error deleting old dogs:', deleteError.message);
    } else {
      console.log(`[SYNC] Deleted ${deletedDogs?.length || 0} dogs no longer on Petfinder`);
    }
  } else if (limit) {
    console.log('[SYNC] Limited sync: skipping deletion pass');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Sync complete in ${elapsed}s. ${newDogIds.length} new dogs.`);

  return newDogIds;
}
