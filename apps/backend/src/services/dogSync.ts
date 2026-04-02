// Dog sync orchestrator — owned by Data Agent
// Fetches from Austin Paws Portal API, normalizes tags, upserts to PostgreSQL,
// marks missing dogs as unavailable, and returns new dog IDs for notifications

import { AustinPawsDataSource } from './austinPawsDataSource.js';
import { supabase } from '../db/client.js';
import type { RawDog } from './datasource.js';

const dataSource = new AustinPawsDataSource();

/**
 * Main sync function called by the cron job.
 *
 * Flow:
 * 1. Fetch all adoptable dogs from the Austin Paws Portal API
 * 2. Upsert each dog into the dogs table (new dogs inserted, existing dogs updated)
 * 3. Return IDs of newly inserted dogs (for push notifications)
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

  // Step 2: Upsert each dog
  const newDogIds: string[] = [];

  for (const raw of rawDogs) {
    try {
      // Check if dog already exists
      const { data: existing } = await supabase
        .from('dogs')
        .select('id')
        .eq('external_id', raw.external_id)
        .single();

      if (existing) {
        // Dog already exists — update with latest data
        const austinPaws = (raw as any)._austin_paws || {};

        const { error: updateError } = await supabase
          .from('dogs')
          .update({
            name: raw.name,
            breed_primary: raw.breed_primary,
            breed_secondary: raw.breed_secondary,
            color: raw.color,
            age: raw.age_group,
            size: raw.size || 'Medium',
            gender: raw.gender,
            description: raw.description,
            photos: raw.photos,
            tags: raw.tags,
            attributes: buildAttributes(raw),
            environment: buildEnvironment(raw),
            adoption_url: raw.adoption_url,
            status: 'adoptable',
            intake_date: raw.intake_date?.toISOString() || null,
            published_at: raw.intake_date?.toISOString() || null,
            last_synced_at: new Date().toISOString(),
            // Austin Paws-specific fields
            dot_color: austinPaws.dot_color || null,
            kennel_number: austinPaws.kennel_number || null,
            location: austinPaws.location || null,
            is_urgent: austinPaws.is_urgent || false,
            eligible_for_foster: austinPaws.eligible_for_foster || null,
            adopter_notes: austinPaws.adopter_notes || null,
            description_html: austinPaws.description_html || null,
            foster: austinPaws.foster || false,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[SYNC] Update failed for ${raw.external_id}:`, updateError.message);
        }
        continue;
      }

      // New dog — insert
      const austinPaws = (raw as any)._austin_paws || {};

      const { data: inserted, error: insertError } = await supabase
        .from('dogs')
        .insert({
          external_id: raw.external_id,
          name: raw.name,
          breed_primary: raw.breed_primary,
          breed_secondary: raw.breed_secondary,
          color: raw.color,
          age: raw.age_group,
          size: raw.size || 'Medium',
          gender: raw.gender,
          description: raw.description,
          photos: raw.photos,
          tags: raw.tags,
          attributes: buildAttributes(raw),
          environment: buildEnvironment(raw),
          adoption_url: raw.adoption_url,
          organization_id: raw.org_id || 'TX514',
          status: 'adoptable',
          intake_date: raw.intake_date?.toISOString() || null,
          published_at: raw.intake_date?.toISOString() || null,
          last_synced_at: new Date().toISOString(),
          // Austin Paws-specific fields
          dot_color: austinPaws.dot_color || null,
          kennel_number: austinPaws.kennel_number || null,
          location: austinPaws.location || null,
          is_urgent: austinPaws.is_urgent || false,
          eligible_for_foster: austinPaws.eligible_for_foster || null,
          adopter_notes: austinPaws.adopter_notes || null,
          description_html: austinPaws.description_html || null,
          foster: austinPaws.foster || false,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`[SYNC] Insert failed for ${raw.external_id}:`, insertError.message);
        continue;
      }

      if (inserted) {
        newDogIds.push(inserted.id);
      }
    } catch (err) {
      // Individual dog failure must NOT crash the entire sync
      console.error(`[SYNC] Error processing dog ${raw.external_id}:`, err);
      continue;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Sync complete in ${elapsed}s. ${newDogIds.length} new dogs added.`);

  return newDogIds;
}

/**
 * Verify existing dogs in our database are still active/available.
 * Instead of fetching full dog data for each one, we fetch the full list from
 * the Austin Paws API once and compare external_ids.
 *
 * Dogs that are no longer active or available are marked as 'unavailable'.
 * Returns the count of dogs marked unavailable.
 */
export async function verifyExistingDogs(): Promise<number> {
  console.log('[VERIFY] Starting verification of existing dogs...');
  const startTime = Date.now();

  // Fetch all dogs from Austin Paws (we already have this data from the sync call;
  // the cron job should pass it in, but this is a fallback)
  const allApiDogs = await dataSource.fetchAllDogsRaw();

  // Build a set of animal_ids that are currently active + available
  const activeAnimalIds = new Set<string>();
  for (const dog of allApiDogs) {
    if (dog.is_active && dog.status === 'AVAILABLE') {
      activeAnimalIds.add(dog.animal_id);
    }
  }

  console.log(`[VERIFY] ${activeAnimalIds.size} active/available dogs in Austin Paws API`);

  // Fetch all our currently adoptable dogs' external_ids
  const { data: ourDogs, error } = await supabase
    .from('dogs')
    .select('id, external_id')
    .eq('status', 'adoptable');

  if (error || !ourDogs) {
    console.error('[VERIFY] Failed to fetch our dogs:', error?.message);
    return 0;
  }

  // Find dogs in our DB that are no longer active in the API
  const toMarkUnavailable: string[] = [];
  for (const dog of ourDogs) {
    if (!activeAnimalIds.has(dog.external_id)) {
      toMarkUnavailable.push(dog.id);
    }
  }

  if (toMarkUnavailable.length > 0) {
    const { error: updateError } = await supabase
      .from('dogs')
      .update({ status: 'unavailable', last_synced_at: new Date().toISOString() })
      .in('id', toMarkUnavailable);

    if (updateError) {
      console.error('[VERIFY] Failed to mark dogs unavailable:', updateError.message);
    } else {
      console.log(`[VERIFY] Marked ${toMarkUnavailable.length} dogs as unavailable`);
    }
  } else {
    console.log('[VERIFY] All existing dogs are still active');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[VERIFY] Verification complete in ${elapsed}s`);

  return toMarkUnavailable.length;
}

// ── Helpers ──────────────────────────

function buildAttributes(raw: RawDog) {
  return {
    spayed_neutered: false,
    house_trained: raw.tags.includes('housetrained'),
    special_needs: false,
    shots_current: false,
  };
}

function buildEnvironment(raw: RawDog) {
  return {
    children: raw.tags.includes('experienced_with_older_kids') || raw.tags.includes('experienced_with_young_kids') ? true : null,
    dogs: raw.tags.includes('experienced_with_dogs') ? true : raw.tags.includes('dog_selective') ? false : null,
    cats: raw.tags.includes('experienced_with_cats') ? true : raw.tags.includes('cat_selective') ? false : null,
  };
}
