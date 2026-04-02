// Tag normalization — owned by Data Agent
// Two maps:
// 1. AUSTIN_PAWS_KEY_MAP: converts Austin Paws characteristic_keys → canonical PreferenceKey (used during sync)
// 2. TAG_MAP: maps PreferenceKey → checker function on Dog objects (used by matching.ts)

import type { PreferenceKey, Dog } from '@fetch/shared';

// ── AUSTIN_PAWS_KEY_MAP ──────────────────────────
// Maps Austin Paws Portal characteristic_keys (uppercase) to canonical PreferenceKey values.
// Keys not in this map are kept as lowercase display tags (e.g., 'bonded_pair', 'heartworm_positive').

export const AUSTIN_PAWS_KEY_MAP: Record<string, PreferenceKey> = {
  'HIGH_ENERGY': 'active_lifestyle',
  'CAT_COMPATIBLE': 'experienced_with_cats',
  'CAT_SELECTIVE': 'cat_selective',
  'CUDDLER': 'cuddler',
  'DOG_COMPATIBLE': 'experienced_with_dogs',
  'DOG_SELECTIVE': 'dog_selective',
  'HOUSETRAINED': 'housetrained',
  'INDEPENDENT': 'independent',
  'KNOW_TRICKS': 'knows_tricks',
  'LOW_ENERGY': 'laid_back',
  'LEASH_TRAINED': 'leash_trained',
  'LOVES_CAR_RIDES': 'loves_car_rides',
  'LOVES_FOOD_TREATS': 'loves_food_and_treats',
  'LOVES_THE_WATRER': 'loves_the_water',        // typo in source data, intentional match
  'LOVES_THE_WATER': 'loves_the_water',          // in case they fix the typo
  'MEDIUM_ENERGY': 'medium_energy',
  'OLDER_KID_COMPATIBLE': 'experienced_with_older_kids',
  'PLAYFUL': 'playful',
  'YOUNG_KID_COMPATIBLE': 'experienced_with_young_kids',
  'FOSTER_ELIGIBLE': 'foster_eligible',
  'INDOOR_ONLY': 'indoor_only',
  'INDOOR_OUTDOOR': 'indoor_outdoor',
  'LONG_TERM_RESIDENT': 'long_term_resident',
  'QUIET_HOME': 'quiet_home',
};

/**
 * Normalize Austin Paws characteristic_keys into canonical PreferenceKey strings.
 * Keys that match AUSTIN_PAWS_KEY_MAP are converted to canonical form.
 * Unrecognized keys are kept as lowercase for display (e.g., 'bonded_pair').
 */
export function normalizeAustinPawsKeys(keys: string[]): string[] {
  const normalized = new Set<string>();

  for (const key of keys) {
    const canonical = AUSTIN_PAWS_KEY_MAP[key];
    if (canonical) {
      normalized.add(canonical);
    } else {
      // Keep unrecognized keys as lowercase for display
      normalized.add(key.toLowerCase());
    }
  }

  return Array.from(normalized);
}

// ── TAG_MAP (Preference Checkers) ──────────────────────────
// Used by matching.ts to evaluate whether a Dog satisfies each preference.
// This is the Record<PreferenceKey, PreferenceChecker> consumed by calculateMatchScore().
// DO NOT RENAME OR RESTRUCTURE — matching.ts depends on this exact export.

type PreferenceChecker = (dog: Dog) => boolean;

export const TAG_MAP: Record<PreferenceKey, PreferenceChecker> = {
  active_lifestyle: (dog) =>
    dog.tags.some((t) => ['active', 'high energy', 'energetic', 'active_lifestyle'].includes(t.toLowerCase())),
  experienced_with_cats: (dog) =>
    dog.environment.cats === true ||
    dog.tags.some((t) => ['experienced_with_cats'].includes(t.toLowerCase())),
  cat_selective: (dog) =>
    dog.environment.cats === false ||
    dog.tags.some((t) => ['cat_selective'].includes(t.toLowerCase())),
  cuddler: (dog) =>
    dog.tags.some((t) => ['cuddly', 'cuddler', 'affectionate', 'snuggler'].includes(t.toLowerCase())),
  experienced_with_dogs: (dog) =>
    dog.environment.dogs === true ||
    dog.tags.some((t) => ['experienced_with_dogs'].includes(t.toLowerCase())),
  dog_selective: (dog) =>
    dog.environment.dogs === false ||
    dog.tags.some((t) => ['dog_selective'].includes(t.toLowerCase())),
  housetrained: (dog) =>
    dog.attributes.house_trained === true ||
    dog.tags.some((t) => ['housetrained'].includes(t.toLowerCase())),
  independent: (dog) =>
    dog.tags.some((t) => ['independent', 'solo dog'].includes(t.toLowerCase())),
  knows_tricks: (dog) =>
    dog.tags.some((t) => ['knows tricks', 'trained', 'obedient', 'knows_tricks'].includes(t.toLowerCase())),
  laid_back: (dog) =>
    dog.tags.some((t) => ['calm', 'laid back', 'low energy', 'mellow', 'laid_back'].includes(t.toLowerCase())),
  leash_trained: (dog) =>
    dog.tags.some((t) => ['leash trained', 'walks well', 'leash_trained'].includes(t.toLowerCase())),
  loves_car_rides: (dog) =>
    dog.tags.some((t) => ['car rides', 'loves car rides', 'loves_car_rides'].includes(t.toLowerCase())),
  loves_food_and_treats: (dog) =>
    dog.tags.some((t) => ['food motivated', 'treat motivated', 'loves treats', 'loves_food_and_treats'].includes(t.toLowerCase())),
  loves_the_water: (dog) =>
    dog.tags.some((t) => ['water', 'swimming', 'loves water', 'loves_the_water'].includes(t.toLowerCase())),
  medium_energy: (dog) =>
    dog.tags.some((t) => ['medium energy', 'moderate energy', 'medium_energy'].includes(t.toLowerCase())),
  experienced_with_older_kids: (dog) =>
    dog.environment.children === true ||
    dog.tags.some((t) => ['experienced_with_older_kids'].includes(t.toLowerCase())),
  playful: (dog) =>
    dog.tags.some((t) => ['playful', 'loves to play', 'toy motivated'].includes(t.toLowerCase())),
  experienced_with_young_kids: (dog) =>
    dog.tags.some((t) => ['good with young kids', 'toddler friendly', 'experienced_with_young_kids'].includes(t.toLowerCase())),
  foster_eligible: (dog) =>
    dog.tags.some((t) => ['foster eligible', 'foster', 'foster_eligible'].includes(t.toLowerCase())),
  indoor_only: (dog) =>
    dog.tags.some((t) => ['indoor only', 'apartment friendly', 'indoor_only'].includes(t.toLowerCase())),
  indoor_outdoor: (dog) =>
    dog.tags.some((t) => ['indoor outdoor', 'indoor/outdoor', 'indoor_outdoor'].includes(t.toLowerCase())),
  long_term_resident: (dog) =>
    dog.tags.some((t) => ['long_term_resident'].includes(t.toLowerCase())) ||
    (dog.published_at
      ? Date.now() - new Date(dog.published_at).getTime() > 21 * 24 * 60 * 60 * 1000
      : false),
  quiet_home: (dog) =>
    dog.tags.some((t) => ['quiet home', 'shy', 'timid', 'quiet_home'].includes(t.toLowerCase())),
};
