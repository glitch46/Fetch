// Temporary script to seed placeholder photos from Dog CEO API
// Focuses on mixed breed / mutt photos
// Run with: npx tsx src/seed-photos.ts

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import axios from 'axios';

// Load env
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  console.error('[ENV] No .env found!');
  process.exit(1);
}

const DOG_CEO_BASE = 'https://dog.ceo/api';

// Mixed/mutt-like breeds to pull photos from (weighted toward mutts)
const BREEDS = [
  'mix',        // primary — actual mixed breed dogs
  'mix',        // double-weight
  'mix',        // triple-weight
  'pitbull',    // very common shelter mix
  'labrador',   // common shelter mix
  'hound',      // common shelter mix
  'terrier',    // common shelter mix
  'cattledog',  // common shelter mix
  'shepherd',   // common shelter mix
  'boxer',      // common shelter mix
  'retriever',  // common shelter mix
  'chihuahua',  // common shelter dog
  'husky',      // common shelter dog
  'collie',     // common shelter mix
  'beagle',     // common shelter dog
];

async function fetchBreedPhotos(breed: string, count: number): Promise<string[]> {
  try {
    // Handle sub-breeds (e.g., "shepherd" -> "german/shepherd")
    let url: string;
    if (breed === 'shepherd') {
      url = `${DOG_CEO_BASE}/breed/german/shepherd/images/random/${count}`;
    } else if (breed === 'retriever') {
      url = `${DOG_CEO_BASE}/breed/retriever/golden/images/random/${count}`;
    } else {
      url = `${DOG_CEO_BASE}/breed/${breed}/images/random/${count}`;
    }
    const { data } = await axios.get(url);
    return data.message || [];
  } catch {
    console.warn(`[PHOTOS] Failed to fetch ${breed} photos`);
    return [];
  }
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  // Get all dogs that have no photos
  const { data: dogs, error } = await supabase
    .from('dogs')
    .select('id, name, breed_primary, size')
    .eq('status', 'adoptable')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PHOTOS] Failed to fetch dogs:', error.message);
    process.exit(1);
  }

  console.log(`[PHOTOS] Found ${dogs.length} adoptable dogs to update with photos`);

  // Build a pool of mixed breed photos (fetch in bulk for efficiency)
  console.log('[PHOTOS] Fetching placeholder photos from Dog CEO API...');
  const photoPool: string[] = [];

  for (const breed of BREEDS) {
    const photos = await fetchBreedPhotos(breed, 15);
    photoPool.push(...photos);
  }

  // Deduplicate
  const uniquePhotos = [...new Set(photoPool)];
  console.log(`[PHOTOS] Collected ${uniquePhotos.length} unique photos`);

  if (uniquePhotos.length === 0) {
    console.error('[PHOTOS] No photos fetched — aborting');
    process.exit(1);
  }

  // Shuffle the photo pool
  for (let i = uniquePhotos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniquePhotos[i], uniquePhotos[j]] = [uniquePhotos[j], uniquePhotos[i]];
  }

  // Assign 2-4 photos to each dog (cycling through the pool)
  let photoIndex = 0;
  let updated = 0;

  for (const dog of dogs) {
    // Pick 2-4 random photos for this dog
    const numPhotos = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
    const dogPhotos = [];

    for (let i = 0; i < numPhotos; i++) {
      const url = uniquePhotos[photoIndex % uniquePhotos.length];
      dogPhotos.push({
        small: url,
        medium: url,
        large: url,
        full: url,
      });
      photoIndex++;
    }

    const { error: updateError } = await supabase
      .from('dogs')
      .update({ photos: JSON.stringify(dogPhotos) })
      .eq('id', dog.id);

    if (updateError) {
      console.error(`[PHOTOS] Failed to update ${dog.name} (${dog.id}):`, updateError.message);
    } else {
      updated++;
    }
  }

  console.log(`[PHOTOS] Updated ${updated}/${dogs.length} dogs with placeholder photos`);
  process.exit(0);
}

main();
