// DataSource interface — source-agnostic interface for fetching adoptable dog data
// Any new shelter data source only needs to implement this interface

export type AgeGroup = 'Baby' | 'Young' | 'Adult' | 'Senior';
export type DogSize = 'Small' | 'Medium' | 'Large' | 'Extra Large';
export type DogGender = 'Male' | 'Female' | 'Unknown';

export interface RawDogPhoto {
  small: string;
  medium: string;
  large: string;
  full: string;
}

export interface RawDog {
  external_id: string;
  name: string;
  breed_primary: string;
  breed_secondary: string | null;
  age_group: AgeGroup;
  size: DogSize | null;
  gender: DogGender;
  color: string | null;
  description: string | null;
  photos: RawDogPhoto[];
  tags: string[];
  adoption_url: string | null;
  intake_date: Date | null;
  slug: string | null;
  org_id: string | null;
}

export interface DataSource {
  name: string;
  fetchAdoptableDogs(limit?: number, startPage?: number): Promise<RawDog[]>;
}