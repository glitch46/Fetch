// RescueGroups v5 DataSource — owned by Data Agent
// Drop-in replacement for SodaAdopetsDataSource using the RescueGroups.org API
// All adoptable dog data (photos, tags, breed, age) comes from a single API source

import type { DataSource, RawDog, RawDogPhoto, AgeGroup, DogSize, DogGender } from './datasource.js';
import {
  fetchAdoptableDogs,
  fetchAnimalPhotos,
  type RescueGroupsAnimal,
  type RescueGroupsPicture,
  type RescueGroupsBreed,
  type RescueGroupsColor,
} from './rescueGroupsClient.js';
import { SCRAPED_TAG_MAP } from './tagNormalization.js';

// ── Text Sanitization ──────────────────────────

/**
 * Sanitize text from RescueGroups API to fix encoding issues.
 * Smart quotes, em dashes, and ellipses get replaced with ASCII equivalents.
 * Garbled UTF-8 sequences (â followed by control chars) are stripped.
 */
function sanitizeText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    // Smart quotes → straight quotes
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    // Em dash / en dash → regular hyphen
    .replace(/[\u2013\u2014]/g, '-')
    // Ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Remove replacement characters
    .replace(/\uFFFD/g, '')
    // Remove garbled multi-byte sequences (â followed by two bytes in 0x80-0xBF range)
    .replace(/\u00E2[\u0080-\u00BF][\u0080-\u00BF]/g, '')
    .trim();
}

// ── Tag Extraction ──────────────────────────

/**
 * Extract behavioral tags from RescueGroups animal attributes.
 * Maps boolean flags and string fields to canonical preference keys.
 */
function extractTags(animal: RescueGroupsAnimal): string[] {
  const tags: string[] = [];
  const a = animal.attributes;

  if (a.isHouseTrained)              tags.push('housetrained');
  if (a.isGoodWithDogs)              tags.push('experienced_with_dogs');
  if (a.isGoodWithCats)              tags.push('experienced_with_cats');
  if (a.isGoodWithKids)              tags.push('experienced_with_young_kids');
  if (a.activityLevel === 'High')    tags.push('active_lifestyle');
  if (a.activityLevel === 'Low')     tags.push('laid_back');
  if (a.activityLevel === 'Medium')  tags.push('medium_energy');
  if (a.isUrgent)                    tags.push('long_term_resident');
  if (a.isFosterOnly)                tags.push('foster_eligible');

  // Map any additional string tags (characteristics array) through SCRAPED_TAG_MAP
  if (Array.isArray(a.characteristics)) {
    for (const char of a.characteristics) {
      const lower = String(char).toLowerCase().trim();
      const canonical = SCRAPED_TAG_MAP[lower];
      if (canonical) {
        tags.push(canonical);
      }
    }
  }

  return [...new Set(tags)]; // deduplicate
}

// ── Field Normalization Helpers ──────────────────────────

function normalizeGender(sex: string | undefined): DogGender {
  if (!sex) return 'Unknown';
  const s = sex.toLowerCase();
  if (s === 'male') return 'Male';
  if (s === 'female') return 'Female';
  return 'Unknown';
}

function normalizeAgeGroup(ageGroup: string | undefined): AgeGroup {
  if (!ageGroup) return 'Adult';
  const a = ageGroup.toLowerCase();
  if (a === 'baby' || a === 'puppy') return 'Baby';
  if (a === 'young') return 'Young';
  if (a === 'adult') return 'Adult';
  if (a === 'senior') return 'Senior';
  return 'Adult';
}

function normalizeSize(sizeGroup: string | undefined): DogSize | null {
  if (!sizeGroup) return null;
  const s = sizeGroup.toLowerCase();
  if (s === 'small') return 'Small';
  if (s === 'medium') return 'Medium';
  if (s === 'large') return 'Large';
  if (s === 'extra large' || s === 'x-large' || s === 'xlarge') return 'Extra Large';
  return null;
}

/**
 * Convert a single RescueGroups picture to a RawDogPhoto.
 * Falls back through sizes so every field has a usable URL.
 */
function pictureToPhoto(pic: RescueGroupsPicture): RawDogPhoto | null {
  const attrs = pic.attributes;
  const fallback = attrs.large?.url || attrs.original?.url || attrs.medium?.url || attrs.small?.url;
  if (!fallback) return null;

  return {
    small: attrs.small?.url || fallback,
    medium: attrs.medium?.url || fallback,
    large: attrs.large?.url || fallback,
    full: attrs.original?.url || attrs.large?.url || fallback,
  };
}

/**
 * Extract photo objects with all size variants from the included pictures.
 * Falls back through sizes so every field has a usable URL.
 */
function extractPhotos(
  animal: RescueGroupsAnimal,
  includedMap: Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>,
): RawDogPhoto[] {
  const photos: RawDogPhoto[] = [];
  const picRefs = animal.relationships?.pictures?.data || [];

  for (const ref of picRefs) {
    const pic = includedMap.get(`${ref.type}:${ref.id}`) as RescueGroupsPicture | undefined;
    if (!pic) continue;

    const photo = pictureToPhoto(pic);
    if (photo) photos.push(photo);
  }

  return photos;
}

/**
 * Extract breed names from included breeds.
 */
function extractBreeds(
  animal: RescueGroupsAnimal,
  includedMap: Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>,
): { primary: string; secondary: string | null } {
  const breedRefs = animal.relationships?.breeds?.data || [];
  const breedNames: string[] = [];

  for (const ref of breedRefs) {
    const breed = includedMap.get(`${ref.type}:${ref.id}`) as RescueGroupsBreed | undefined;
    if (breed?.attributes?.name) {
      breedNames.push(breed.attributes.name);
    }
  }

  // Fallback to breedString attribute if no relationship data
  if (breedNames.length === 0 && animal.attributes.breedString) {
    const parts = animal.attributes.breedString.split('/').map((s: string) => s.trim());
    return { primary: parts[0] || 'Mixed Breed', secondary: parts[1] || null };
  }

  return {
    primary: breedNames[0] || 'Mixed Breed',
    secondary: breedNames.length > 1 ? breedNames[1] : null,
  };
}

/**
 * Extract primary color from included colors.
 */
function extractColor(
  animal: RescueGroupsAnimal,
  includedMap: Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>,
): string | null {
  const colorRefs = animal.relationships?.colors?.data || [];

  for (const ref of colorRefs) {
    const color = includedMap.get(`${ref.type}:${ref.id}`) as RescueGroupsColor | undefined;
    if (color?.attributes?.name) {
      return color.attributes.name;
    }
  }

  // Fallback to colorDetails attribute
  return (animal.attributes.colorDetails as string) || null;
}

// ── Normalize a single RescueGroups animal into RawDog ──────────────────────────

function normalizeRescueGroupsDog(
  animal: RescueGroupsAnimal,
  includedMap: Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>,
): RawDog {
  const { primary, secondary } = extractBreeds(animal, includedMap);

  return {
    external_id: animal.attributes.rescueId || animal.id,
    name: sanitizeText(animal.attributes.name) || 'Unknown',
    breed_primary: sanitizeText(primary) || primary,
    breed_secondary: sanitizeText(secondary),
    age_group: normalizeAgeGroup(animal.attributes.ageGroup),
    size: normalizeSize(animal.attributes.sizeGroup),
    gender: normalizeGender(animal.attributes.sex),
    color: extractColor(animal, includedMap),
    description: sanitizeText(animal.attributes.descriptionText),
    photos: extractPhotos(animal, includedMap),
    tags: extractTags(animal),
    adoption_url: animal.attributes.url || null,
    intake_date: null, // RescueGroups does not provide intake date
  };
}

// ── DataSource Implementation ──────────────────────────

export class RescueGroupsDataSource implements DataSource {
  name = 'rescuegroups-v5';

  async fetchAdoptableDogs(limit?: number): Promise<RawDog[]> {
    console.log(`[${this.name}] Starting fetch...${limit ? ` (limit: ${limit})` : ''}`);

    const { animals, included } = await fetchAdoptableDogs();

    let rawDogs = animals.map((animal) => normalizeRescueGroupsDog(animal, included));

    if (limit && rawDogs.length > limit) {
      rawDogs = rawDogs.slice(0, limit);
      console.log(`[${this.name}] Limited to ${limit} dogs`);
    }

    // Second pass: fetch full photos for dogs where pictureCount > extracted photos.
    // The search endpoint may only return 1 photo per dog; fetching individually gets all.
    const dogsNeedingPhotos: Array<{ index: number; animalId: string }> = [];
    for (let i = 0; i < rawDogs.length; i++) {
      // Find the matching animal to check pictureCount
      const animal = animals.find(
        (a) => (a.attributes.rescueId || a.id) === rawDogs[i].external_id
      );
      const pictureCount = (animal?.attributes.pictureCount as number) || 0;
      if (animal && pictureCount > rawDogs[i].photos.length) {
        dogsNeedingPhotos.push({ index: i, animalId: animal.id });
      }
    }

    if (dogsNeedingPhotos.length > 0) {
      console.log(`[${this.name}] Fetching full photos for ${dogsNeedingPhotos.length} multi-photo dogs...`);

      for (const { index, animalId } of dogsNeedingPhotos) {
        const pics = await fetchAnimalPhotos(animalId);
        if (pics.length > 0) {
          const photos = pics
            .map(pictureToPhoto)
            .filter((p): p is RawDogPhoto => p !== null);
          if (photos.length > rawDogs[index].photos.length) {
            rawDogs[index].photos = photos;
          }
        }
      }
    }

    console.log(`[${this.name}] Returning ${rawDogs.length} normalized dogs`);
    return rawDogs;
  }
}
