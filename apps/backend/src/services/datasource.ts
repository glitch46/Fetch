// DataSource interface — owned by Data Agent
// Source-agnostic interface for fetching adoptable dog data
// Current implementation: AustinPawsDataSource (apps/backend/src/services/austinPawsDataSource.ts)

export type AgeGroup = 'Baby' | 'Young' | 'Adult' | 'Senior';
export type DogSize = 'Small' | 'Medium' | 'Large' | 'Extra Large';
export type DogGender = 'Male' | 'Female' | 'Unknown';

export interface RawDogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

export interface RawDogVideo {
  url: string;
  thumbnail: string | null;
  host: 'youtube' | 'vimeo' | 'direct';
}

/**
 * Raw dog data as returned by a DataSource.
 * This is the intermediate format between external APIs and our DB schema.
 * The dogSync orchestrator normalizes this into the DB/shared Dog type.
 */
export interface RawDog {
  external_id: string;            // e.g., "19138" from Austin Paws animal_id
  name: string;
  breed_primary: string;
  breed_secondary: string | null;
  age_group: AgeGroup;
  size: DogSize | null;           // nullable — inferred from breed if unavailable
  gender: DogGender;
  color: string | null;
  description: string | null;     // plain text description (HTML stripped)
  photos: RawDogPhoto[];          // photo objects with size variants
  videos: RawDogVideo[];          // video objects with URL and thumbnail
  tags: string[];                 // normalized behavioral tags (PreferenceKey values + display-only tags)
  adoption_url: string | null;    // adopets.com deep link for this dog
  intake_date: Date | null;       // shelter intake date — used for days_in_shelter
  slug: string | null;            // URL-friendly slug (not used by Austin Paws)
  org_id: string | null;          // organization ID (e.g., "TX514" for AAC)
}

/**
 * Source-agnostic interface for fetching adoptable dog data.
 * Implementations handle all data fetching, pagination, and normalization.
 */
export interface DataSource {
  name: string;
  fetchAdoptableDogs(limit?: number, startPage?: number): Promise<RawDog[]>;
}
