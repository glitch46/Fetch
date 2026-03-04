// Match score calculation service — owned by Backend Agent
// Computes preference-based match scores for dog/user pairs

import type { Dog, PreferenceKey } from '@fetch/shared';
import { TAG_MAP } from './tagNormalization.js';

export function calculateMatchScore(
  dog: Dog,
  userPreferences: PreferenceKey[]
): { score: number | null; matched: PreferenceKey[] } {
  if (userPreferences.length === 0) return { score: null, matched: [] };

  const matched: PreferenceKey[] = [];

  for (const pref of userPreferences) {
    const checker = TAG_MAP[pref];
    if (checker && checker(dog)) {
      matched.push(pref);
    }
  }

  const score = Math.round((matched.length / userPreferences.length) * 100);
  return { score, matched };
}
