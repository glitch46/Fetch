// Dog sync orchestrator
// Fetches from DataSource, normalizes tags, upserts to PostgreSQL
// Currently using Cloudflare Browser Rendering API to scrape Adopt-a-Pet

import { CloudflarePetfinderDataSource } from './cloudflarePetfinderDataSource.js';
import { normalizeRawTags, inferPreferenceTagsFromText, filterToPreferenceTags } from './tagNormalization.js';
import { supabase } from '../db/client.js';
import type { RawDog } from './datasource.js';

const dataSource = new CloudflarePetfinderDataSource();

export async function syncDogs(limit?: number, _startPage?: number): Promise<string[]> {
  console.log(`[SYNC] Starting dog sync...${limit ? ` (limit: ${limit})` : ''}`);
  const startTime = Date.now();

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

  const currentExternalIds: string[] = [];
  const newDogIds: string[] = [];

  for (const raw of rawDogs) {
    try {
      const normalizedTags = normalizeRawTags(raw.tags);
      const inferredBioTags = inferPreferenceTagsFromText(raw.description);
      const finalTags = filterToPreferenceTags([...normalizedTags, ...inferredBioTags]);
      const photos = raw.photos;

      if (!Array.isArray(photos) || photos.length <= 1) {
        console.log(`[SYNC] Skipping ${raw.external_id}: insufficient photos (${photos?.length || 0})`);
        continue;
      }

      const attributes = {
        spayed_neutered: false,
        house_trained: finalTags.includes('housetrained'),
        special_needs: false,
        shots_current: false,
      };

      const environment = {
        children: finalTags.includes('experienced_with_older_kids') || finalTags.includes('experienced_with_young_kids') ? true : null,
        dogs: finalTags.includes('experienced_with_dogs') ? true : finalTags.includes('dog_selective') ? false : null,
        cats: finalTags.includes('experienced_with_cats') ? true : finalTags.includes('cat_selective') ? false : null,
      };

      const { data: existing } = await supabase
        .from('dogs')
        .select('id')
        .eq('petfinder_id', raw.external_id)
        .single();

      const isNew = !existing;

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
            tags: finalTags,
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
        console.log(`[SYNC] NEW: ${raw.name} (${raw.external_id}) - ${finalTags.length} tags, ${photos.length} photos`);
      } else {
        console.log(`[SYNC] UPDATED: ${raw.name} (${raw.external_id}) - ${finalTags.length} tags, ${photos.length} photos`);
      }
    } catch (err) {
      console.error(`[SYNC] Error processing dog ${raw.external_id}:`, err);
      continue;
    }
  }

  console.log(`[SYNC] Added ${newDogIds.length} new dogs (${currentExternalIds.length}/${rawDogs.length} processed)`);

  if (!limit && currentExternalIds.length > 0) {
    const { data: deletedDogs, error: deleteError } = await supabase
      .from('dogs')
      .delete()
      .not('petfinder_id', 'in', `(${currentExternalIds.map((id) => `"${id}"`).join(',')})`)
      .select('id');

    if (deleteError) {
      console.error('[SYNC] Error deleting old dogs:', deleteError.message);
    } else {
      console.log(`[SYNC] Deleted ${deletedDogs?.length || 0} dogs no longer available`);
    }
  } else if (limit) {
    console.log('[SYNC] Limited sync: skipping deletion pass');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Sync complete in ${elapsed}s. ${newDogIds.length} new dogs.`);

  return newDogIds;
}

export async function upsertDog(raw: RawDog): Promise<string | null> {
  const normalizedTags = normalizeRawTags(raw.tags);
  const inferredBioTags = inferPreferenceTagsFromText(raw.description);
  const finalTags = filterToPreferenceTags([...normalizedTags, ...inferredBioTags]);

  if (!Array.isArray(raw.photos) || raw.photos.length <= 1) {
    console.log(`[SYNC] Skipping ${raw.external_id}: insufficient photos (${raw.photos?.length || 0})`);
    return null;
  }

  const attributes = {
    spayed_neutered: false,
    house_trained: finalTags.includes('housetrained'),
    special_needs: false,
    shots_current: false,
  };

  const environment = {
    children: finalTags.includes('experienced_with_older_kids') || finalTags.includes('experienced_with_young_kids') ? true : null,
    dogs: finalTags.includes('experienced_with_dogs') ? true : finalTags.includes('dog_selective') ? false : null,
    cats: finalTags.includes('experienced_with_cats') ? true : finalTags.includes('cat_selective') ? false : null,
  };

  const { data: upserted, error } = await supabase
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
        photos: raw.photos,
        tags: finalTags,
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

  if (error) {
    console.error(`[SYNC] Upsert failed for ${raw.external_id}:`, error.message);
    return null;
  }

  return upserted?.id || null;
}
