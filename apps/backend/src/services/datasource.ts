// DataSource interface — owned by Data Agent
// Source-agnostic interface for fetching adoptable dog data
// Any new shelter data source only needs to implement this interface
// Current implementation: RescueGroupsDataSource (apps/backend/src/services/rescueGroupsDataSource.ts)

export type AgeGroup = 'Baby' | 'Young' | 'Adult' | 'Senior';
export type DogSize = 'Small' | 'Medium' | 'Large' | 'Extra Large';
export type DogGender = 'Male' | 'Female' | 'Unknown';

export interface RawDogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

/**
 * Raw dog data as returned by a DataSource.
 * This is the intermediate format between external APIs and our DB schema.
 * The dogSync orchestrator normalizes this into the DB/shared Dog type.
 */
export interface RawDog {
  external_id: string;            // e.g., "A929698" from SODA
  name: string;
  breed_primary: string;
  breed_secondary: string | null;
  age_group: AgeGroup;
  size: DogSize | null;           // nullable — inferred from breed if unavailable
  gender: DogGender;
  color: string | null;           // primary color from SODA
  description: string | null;     // from adopets.com scrape
  photos: RawDogPhoto[];           // photo objects with size variants
  tags: string[];                 // behavioral tags from adopets.com
  adoption_url: string | null;    // adopets.com deep link for this dog
  intake_date: Date | null;       // source_date from SODA — used for days_in_shelter
  slug: string | null;            // URL-friendly slug from RescueGroups (e.g., "adopt-jade-pit-bull-terrier-dog")
  org_id: string | null;          // organization ID from RescueGroups (e.g., "1951" for AAC)
}

/**
 * Source-agnostic interface for fetching adoptable dog data.
 * Implementations handle all data fetching, pagination, and cross-referencing.
 */
export interface DataSource {
  name: string;
  fetchAdoptableDogs(limit?: number): Promise<RawDog[]>;
}
