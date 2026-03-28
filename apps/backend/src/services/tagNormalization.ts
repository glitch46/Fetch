// Tag normalization — owned by Data Agent
// Two maps:
// 1. SCRAPED_TAG_MAP: converts raw scraped tag strings → canonical PreferenceKey (used during sync)
// 2. TAG_MAP: maps PreferenceKey → checker function on Dog objects (used by matching.ts)

import type { PreferenceKey, Dog } from '@fetch/shared';

const VALID_PREFERENCE_KEYS = new Set<PreferenceKey>([
  'active_lifestyle',
  'experienced_with_cats',
  'cat_selective',
  'cuddler',
  'experienced_with_dogs',
  'dog_selective',
  'housetrained',
  'independent',
  'knows_tricks',
  'laid_back',
  'leash_trained',
  'loves_car_rides',
  'loves_food_and_treats',
  'loves_the_water',
  'medium_energy',
  'experienced_with_older_kids',
  'playful',
  'experienced_with_young_kids',
  'foster_eligible',
  'indoor_only',
  'indoor_outdoor',
  'long_term_resident',
  'quiet_home',
]);

interface BioRule {
  key: PreferenceKey;
  patterns: RegExp[];
}

const BIO_KEYWORD_RULES: BioRule[] = [
  { key: 'active_lifestyle', patterns: [/\b(active|energetic|high energy|loves to run|athletic)\b/i] },
  { key: 'laid_back', patterns: [/\b(calm|mellow|laid back|easygoing|gentle)\b/i] },
  { key: 'medium_energy', patterns: [/\b(medium energy|moderate energy|balanced energy)\b/i] },
  { key: 'playful', patterns: [/\b(playful|loves to play|toy lover|loves toys)\b/i] },
  { key: 'cuddler', patterns: [/\b(cuddly|cuddler|snuggly|affectionate|lap dog)\b/i] },
  { key: 'independent', patterns: [/\b(independent|self-sufficient)\b/i] },
  { key: 'housetrained', patterns: [/\b(housetrained|house trained|potty trained|crate trained)\b/i] },
  { key: 'leash_trained', patterns: [/\b(leash trained|walks well on leash|good on leash)\b/i] },
  { key: 'knows_tricks', patterns: [/\b(knows tricks|knows commands|sit|stay|trained)\b/i] },
  { key: 'experienced_with_dogs', patterns: [/\b(good with dogs|dog friendly|gets along with dogs)\b/i] },
  { key: 'dog_selective', patterns: [/\b(dog selective|prefers to be the only dog)\b/i] },
  { key: 'experienced_with_cats', patterns: [/\b(good with cats|cat friendly|gets along with cats)\b/i] },
  { key: 'cat_selective', patterns: [/\b(cat selective|no cats|should not live with cats)\b/i] },
  { key: 'experienced_with_young_kids', patterns: [/\b(good with young kids|good with children|kid friendly)\b/i] },
  { key: 'experienced_with_older_kids', patterns: [/\b(good with older kids|best with older kids)\b/i] },
  { key: 'loves_car_rides', patterns: [/\b(loves car rides|great in the car|good in car)\b/i] },
  { key: 'loves_food_and_treats', patterns: [/\b(food motivated|treat motivated|loves treats)\b/i] },
  { key: 'loves_the_water', patterns: [/\b(loves water|swimmer|enjoys swimming)\b/i] },
  { key: 'foster_eligible', patterns: [/\b(foster eligible|needs foster|foster home)\b/i] },
  { key: 'indoor_only', patterns: [/\b(indoor only|inside only|apartment dog)\b/i] },
  { key: 'indoor_outdoor', patterns: [/\b(indoor\/outdoor|indoor outdoor)\b/i] },
  { key: 'quiet_home', patterns: [/\b(quiet home|needs a quiet home|shy|timid)\b/i] },
];

// ── SCRAPED_TAG_MAP ──────────────────────────
// Used by dogSync to normalize raw tag strings from adopets.com into canonical tags.
// Case-insensitive matching; keys are lowercase.

export const SCRAPED_TAG_MAP: Record<string, PreferenceKey> = {
  'active': 'active_lifestyle',
  'high energy': 'active_lifestyle',
  'energetic': 'active_lifestyle',
  'good with cats': 'experienced_with_cats',
  'cat friendly': 'experienced_with_cats',
  'cat selective': 'cat_selective',
  'affectionate': 'cuddler',
  'cuddly': 'cuddler',
  'loves cuddles': 'cuddler',
  'good with dogs': 'experienced_with_dogs',
  'dog friendly': 'experienced_with_dogs',
  'dog selective': 'dog_selective',
  'housetrained': 'housetrained',
  'house trained': 'housetrained',
  'potty trained': 'housetrained',
  'independent': 'independent',
  'knows tricks': 'knows_tricks',
  'trained': 'knows_tricks',
  'calm': 'laid_back',
  'mellow': 'laid_back',
  'laid back': 'laid_back',
  'leash trained': 'leash_trained',
  'good on leash': 'leash_trained',
  'loves car rides': 'loves_car_rides',
  'good in car': 'loves_car_rides',
  'food motivated': 'loves_food_and_treats',
  'treat motivated': 'loves_food_and_treats',
  'loves water': 'loves_the_water',
  'swimmer': 'loves_the_water',
  'medium energy': 'medium_energy',
  'good with older kids': 'experienced_with_older_kids',
  'good with kids': 'experienced_with_older_kids',
  'playful': 'playful',
  'good with young kids': 'experienced_with_young_kids',
  'good with children': 'experienced_with_young_kids',
  'foster eligible': 'foster_eligible',
  'indoor only': 'indoor_only',
  'indoor/outdoor': 'indoor_outdoor',
  'quiet home': 'quiet_home',
  'needs quiet home': 'quiet_home',
};

/**
 * Normalize raw scraped tags into canonical PreferenceKey strings.
 * Unrecognized tags are kept as-is (they'll still appear in the dog's tag list
 * but won't match any preference key during scoring).
 *
 * Note: long_term_resident is computed from intake_date (> 21 days), not from tags.
 */
export function normalizeRawTags(rawTags: string[]): string[] {
  const normalized = new Set<string>();

  for (const tag of rawTags) {
    const lower = tag.toLowerCase().trim();

    if (VALID_PREFERENCE_KEYS.has(lower as PreferenceKey)) {
      normalized.add(lower);
      continue;
    }

    const canonical = SCRAPED_TAG_MAP[lower];
    if (canonical) {
      normalized.add(canonical);
    }
  }

  return Array.from(normalized);
}

export function filterToPreferenceTags(tags: string[]): PreferenceKey[] {
  const filtered = new Set<PreferenceKey>();

  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();
    if (VALID_PREFERENCE_KEYS.has(normalized as PreferenceKey)) {
      filtered.add(normalized as PreferenceKey);
    }
  }

  return Array.from(filtered);
}

export function inferPreferenceTagsFromText(text: string | null | undefined): PreferenceKey[] {
  if (!text) return [];

  const inferred = new Set<PreferenceKey>();
  for (const rule of BIO_KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      inferred.add(rule.key);
    }
  }

  return Array.from(inferred);
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
    dog.tags.some((t) => ['cuddly', 'cuddler', 'affectionate', 'snuggler', 'cuddler'].includes(t.toLowerCase())),
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
    dog.published_at
      ? Date.now() - new Date(dog.published_at).getTime() > 21 * 24 * 60 * 60 * 1000
      : false,
  quiet_home: (dog) =>
    dog.tags.some((t) => ['quiet home', 'shy', 'timid', 'quiet_home'].includes(t.toLowerCase())),
};
