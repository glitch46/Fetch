// Dog DB row mapper — converts Supabase row objects to Dog type
// Extracted from routes/dogs, routes/swipes, and services/notifications
// to eliminate duplication of the JSON parsing and field mapping logic.

import type { Dog, DogPhoto, DogVideo, DogAttributes, DogEnvironment } from '@fetch/shared';

const FOSTER_URL = 'https://www.austintexas.gov/page/foster-care-application';

const DEFAULT_ATTRIBUTES: DogAttributes = {
  spayed_neutered: false,
  house_trained: false,
  special_needs: false,
  shots_current: false,
};

const DEFAULT_ENVIRONMENT: DogEnvironment = {
  children: null,
  dogs: null,
  cats: null,
};

function parseJsonField<T>(field: unknown, fallback: T): T {
  try {
    const raw = typeof field === 'string' ? JSON.parse(field) : field;
    if (Array.isArray(raw)) return raw as T;
    if (raw && typeof raw === 'object') return raw as T;
    return fallback;
  } catch {
    return fallback;
  }
}

export function dbRowToDog(
  row: Record<string, unknown>,
  matchScore: number | null = null,
  matchedPreferences: string[] = []
): Dog {
  return {
    id: row.id as string,
    external_id: row.external_id as string,
    name: row.name as string,
    breed_primary: (row.breed_primary as string) || null,
    breed_secondary: (row.breed_secondary as string) || null,
    age: row.age as Dog['age'],
    size: row.size as Dog['size'],
    gender: row.gender as Dog['gender'],
    description: (row.description as string) || null,
    description_html: (row.description_html as string) || null,
    photos: parseJsonField<DogPhoto[]>(row.photos, []),
    videos: parseJsonField<DogVideo[]>(row.videos, []),
    tags: (row.tags as string[]) || [],
    attributes: parseJsonField<DogAttributes>(row.attributes, DEFAULT_ATTRIBUTES),
    environment: parseJsonField<DogEnvironment>(row.environment, DEFAULT_ENVIRONMENT),
    adoption_url: (row.adoption_url as string) || null,
    foster_url: FOSTER_URL,
    organization_id: (row.organization_id as string) || 'TX514',
    status: row.status as Dog['status'],
    published_at: (row.published_at as string) || null,
    match_score: matchScore,
    matched_preferences: matchedPreferences,
    prompts: (row.prompts as Dog['prompts']) || null,
    days_in_shelter: (row.days_in_shelter as number) ?? null,
    last_synced_at: (row.last_synced_at as string) || null,
    dot_color: (row.dot_color as string) || null,
    kennel_number: (row.kennel_number as string) || null,
    location: (row.location as string) || null,
    is_urgent: (row.is_urgent as boolean) || false,
    eligible_for_foster: (row.eligible_for_foster as boolean | null) ?? null,
    adopter_notes: (row.adopter_notes as string) || null,
    foster: (row.foster as boolean) || false,
  };
}