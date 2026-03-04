// Script to seed supplemental dog photos from Dog CEO API
// Replaces any broken placedog.net URLs and adds photos for dogs with only 1
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

interface DogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

// Breeds to pull photos from (common shelter breeds)
const BREEDS = [
  'pitbull', 'labrador', 'hound', 'terrier', 'cattledog',
  'shepherd/german', 'boxer', 'retriever/golden', 'chihuahua',
  'husky', 'collie', 'beagle', 'rottweiler', 'poodle',
  'bulldog', 'mastiff', 'dane/great', 'doberman',
];

async function fetchBreedPhotos(breed: string, count: number): Promise<string[]> {
  try {
    const url = `${DOG_CEO_BASE}/breed/${breed}/images/random/${count}`;
    const { data } = await axios.get(url);
    return data.message || [];
  } catch {
    console.warn(`[PHOTOS] Failed to fetch ${breed} photos`);
    return [];
  }
}

function hasbrokenPhotos(photos: DogPhoto[]): boolean {
  return photos.some((p) => p.large?.includes('placedog.net'));
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  // Build a pool of real dog photos
  console.log('[PHOTOS] Fetching dog photos from Dog CEO API...');
  const photoPool: string[] = [];

  for (const breed of BREEDS) {
    const photos = await fetchBreedPhotos(breed, 20);
    photoPool.push(...photos);
  }

  const uniquePhotos = [...new Set(photoPool)];
  console.log(`[PHOTOS] Collected ${uniquePhotos.length} unique photos`);

  if (uniquePhotos.length === 0) {
    console.error('[PHOTOS] No photos fetched — aborting');
    process.exit(1);
  }

  // Shuffle
  for (let i = uniquePhotos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniquePhotos[i], uniquePhotos[j]] = [uniquePhotos[j], uniquePhotos[i]];
  }

  // Get all adoptable dogs
  const { data: dogs, error } = await supabase
    .from('dogs')
    .select('id, name, photos')
    .eq('status', 'adoptable')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PHOTOS] Failed to fetch dogs:', error.message);
    process.exit(1);
  }

  console.log(`[PHOTOS] Found ${dogs.length} adoptable dogs`);

  let updated = 0;
  let photoIdx = 0;

  function nextPhoto(): DogPhoto {
    const url = uniquePhotos[photoIdx % uniquePhotos.length];
    photoIdx++;
    return { small: url, medium: url, large: url, full: url };
  }

  for (const dog of dogs) {
    const existingPhotos: DogPhoto[] = typeof dog.photos === 'string'
      ? JSON.parse(dog.photos)
      : dog.photos || [];

    const broken = hasbrokenPhotos(existingPhotos);
    const needsMore = existingPhotos.length <= 1;

    if (!broken && !needsMore) continue;

    // Keep only the real (non-placedog) photos
    const realPhotos = existingPhotos.filter((p) => !p.large?.includes('placedog.net'));

    // Add 2-3 real dog photos from the pool
    const numExtra = 2 + Math.floor(Math.random() * 2);
    const supplemental: DogPhoto[] = [];
    for (let i = 0; i < numExtra; i++) {
      supplemental.push(nextPhoto());
    }

    const mergedPhotos = [...realPhotos, ...supplemental];

    const { error: updateError } = await supabase
      .from('dogs')
      .update({ photos: JSON.stringify(mergedPhotos) })
      .eq('id', dog.id);

    if (updateError) {
      console.error(`[PHOTOS] Failed to update ${dog.name} (${dog.id}):`, updateError.message);
    } else {
      updated++;
    }
  }

  console.log(`[PHOTOS] Updated ${updated} dogs with real dog photos`);
  process.exit(0);
}

main();
