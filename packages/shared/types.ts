// Shared TypeScript types — owned by Architect Agent (scaffold)
// Imported by both mobile and backend apps via @fetch/shared
// All agents may add types here; coordinate additions via comments

// ================================================
// CORE DOMAIN TYPES
// ================================================

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  auth_provider: 'email' | 'google' | 'facebook';
  avatar_url: string | null;
  notification_new_matches: boolean;
  notification_urgent_dogs: boolean;
  created_at: string;
}

export interface DogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

export interface DogAttributes {
  spayed_neutered: boolean;
  house_trained: boolean;
  special_needs: boolean;
  shots_current: boolean;
}

export interface DogEnvironment {
  children: boolean | null;
  dogs: boolean | null;
  cats: boolean | null;
}

export interface Dog {
  id: string;
  petfinder_id: string;
  name: string;
  breed_primary: string | null;
  breed_secondary: string | null;
  age: 'Baby' | 'Young' | 'Adult' | 'Senior';
  size: 'Small' | 'Medium' | 'Large' | 'Extra Large';
  gender: 'Male' | 'Female' | 'Unknown';
  description: string | null;
  photos: DogPhoto[];
  tags: string[];
  attributes: DogAttributes;
  environment: DogEnvironment;
  petfinder_url: string;
  organization_id: string;
  status: 'adoptable' | 'unavailable';
  published_at: string | null;
  match_score: number | null;
  matched_preferences: string[];
  prompts: Array<{ prompt: string; response: string }> | null;
  days_in_shelter: number | null;
  adoption_url: string | null;
  foster_url: string | null;
  last_synced_at: string | null;
}

export interface Swipe {
  id: string;
  user_id: string;
  dog_id: string;
  direction: 'left' | 'right';
  created_at: string;
}

export interface Match {
  id: string;
  user_id: string;
  dog_id: string;
  action: 'adopt' | 'foster' | 'pending';
  created_at: string;
}

export type PreferenceKey =
  | 'active_lifestyle'
  | 'experienced_with_cats'
  | 'cat_selective'
  | 'cuddler'
  | 'experienced_with_dogs'
  | 'dog_selective'
  | 'housetrained'
  | 'independent'
  | 'knows_tricks'
  | 'laid_back'
  | 'leash_trained'
  | 'loves_car_rides'
  | 'loves_food_and_treats'
  | 'loves_the_water'
  | 'medium_energy'
  | 'experienced_with_older_kids'
  | 'playful'
  | 'experienced_with_young_kids'
  | 'foster_eligible'
  | 'indoor_only'
  | 'indoor_outdoor'
  | 'long_term_resident'
  | 'quiet_home';

export interface UserPreferences {
  user_id: string;
  preferences: PreferenceKey[];
  updated_at: string;
}

// ================================================
// API RESPONSE TYPES
// ================================================

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}
