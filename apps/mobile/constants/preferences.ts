// Preference options — owned by Architect Agent (scaffold)
// Static list of all selectable preference keys with display labels and emoji

import type { PreferenceKey } from '@fetch/shared';

interface PreferenceOption {
  key: PreferenceKey;
  label: string;
  emoji: string;
}

export const PREFERENCE_OPTIONS: PreferenceOption[] = [
  { key: 'active_lifestyle', label: 'Active Lifestyle', emoji: '🏃' },
  { key: 'laid_back', label: 'Laid Back', emoji: '😎' },
  { key: 'medium_energy', label: 'Medium Energy', emoji: '⚡' },
  { key: 'playful', label: 'Playful', emoji: '🎾' },
  { key: 'cuddler', label: 'Cuddler', emoji: '🤗' },
  { key: 'independent', label: 'Independent', emoji: '🐺' },
  { key: 'housetrained', label: 'Housetrained', emoji: '🏠' },
  { key: 'leash_trained', label: 'Leash Trained', emoji: '🦮' },
  { key: 'knows_tricks', label: 'Knows Tricks', emoji: '🎪' },
  { key: 'experienced_with_dogs', label: 'Good with Dogs', emoji: '🐕' },
  { key: 'experienced_with_cats', label: 'Good with Cats', emoji: '🐱' },
  { key: 'experienced_with_young_kids', label: 'Good with Young Kids', emoji: '👶' },
  { key: 'experienced_with_older_kids', label: 'Good with Older Kids', emoji: '🧒' },
  { key: 'loves_car_rides', label: 'Loves Car Rides', emoji: '🚗' },
  { key: 'loves_food_and_treats', label: 'Food Motivated', emoji: '🦴' },
  { key: 'loves_the_water', label: 'Loves Water', emoji: '💧' },
  { key: 'foster_eligible', label: 'Foster Eligible', emoji: '🏡' },
  { key: 'indoor_only', label: 'Indoor Only', emoji: '🛋️' },
  { key: 'indoor_outdoor', label: 'Indoor/Outdoor', emoji: '🌳' },
  { key: 'long_term_resident', label: 'Long-Term Resident', emoji: '💛' },
  { key: 'quiet_home', label: 'Quiet Home', emoji: '🤫' },
];
