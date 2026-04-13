// Austin Paws Portal DataSource adapter — owned by Data Agent
// Implements the DataSource interface using the Austin Paws Portal API.
// Replaces SodaAdopetsDataSource, PetfinderDataSource, AdopetsDataSource, and RescueGroupsDataSource.

import { fetchAllDogs } from './austinPawsClient.js';
import { normalizeAustinPawsKeys } from './tagNormalization.js';
import type { DataSource, RawDog, RawDogPhoto, AgeGroup, DogSize, DogGender } from './datasource.js';
import type { AustinPawsDog } from './austinPawsClient.js';

const ADOPETS_PET_URL = 'https://adopt.adopets.com/pet';

/**
 * Map Austin Paws age_key to our AgeGroup.
 * API returns: BABY, YOUNG, ADULT, SENIOR (uppercase) or null
 */
function mapAge(ageKey: string | null): AgeGroup {
  if (!ageKey) return 'Adult';
  switch (ageKey.toUpperCase()) {
    case 'BABY': return 'Baby';
    case 'YOUNG': return 'Young';
    case 'ADULT': return 'Adult';
    case 'SENIOR': return 'Senior';
    default: return 'Adult';
  }
}

/**
 * Map Austin Paws size_key to our DogSize.
 * API returns: XS, S, M, L, XL (uppercase) or null
 */
function mapSize(sizeKey: string | null): DogSize | null {
  if (!sizeKey) return null;
  switch (sizeKey.toUpperCase()) {
    case 'XS': return 'Small';
    case 'S': return 'Small';
    case 'M': return 'Medium';
    case 'L': return 'Large';
    case 'XL': return 'Extra Large';
    default: return null;
  }
}

/**
 * Map Austin Paws sex to our DogGender.
 * API returns: MALE, FEMALE (uppercase)
 */
function mapGender(sex: string): DogGender {
  switch (sex.toUpperCase()) {
    case 'MALE': return 'Male';
    case 'FEMALE': return 'Female';
    default: return 'Unknown';
  }
}

/**
 * Strip HTML tags from description_html to produce plain text.
 */
function stripHtml(html: string | null): string | null {
  if (!html || html.trim() === '') return null;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build a RawDogPhoto array from the single picture URL.
 * The API returns one photo URL with an Adopets resize proxy parameter (e.g., AUTOx800).
 * We generate multiple size variants by changing the proxy parameter, and also
 * construct additional photo URLs from the original image source when possible.
 */
function buildPhotos(pictureUrl: string | null): RawDogPhoto[] {
  if (!pictureUrl) return [];

  const photos: RawDogPhoto[] = [];

  // Generate size variants from the Adopets resize proxy
  // URL format: https://img.prd.adopets.app/ado-resize-image-prd?path=organization/pet/picture/AUTOx800/...
  const smallUrl = pictureUrl.replace(/AUTOx\d+/, 'AUTOx200');
  const mediumUrl = pictureUrl.replace(/AUTOx\d+/, 'AUTOx400');
  const largeUrl = pictureUrl.replace(/AUTOx\d+/, 'AUTOx800');
  const fullUrl = pictureUrl.replace(/AUTOx\d+/, 'AUTOx1200');

  photos.push({
    small: smallUrl,
    medium: mediumUrl,
    large: largeUrl,
    full: fullUrl,
  });

  return photos;
}

/**
 * Convert an AustinPawsDog API object to our RawDog intermediate format.
 */
function toRawDog(dog: AustinPawsDog): RawDog {
  const normalizedTags = normalizeAustinPawsKeys(dog.characteristic_keys);

  return {
    external_id: dog.animal_id,
    name: dog.name.trim(),
    breed_primary: dog.breed_primary_name || 'Mixed Breed',
    breed_secondary: null,
    age_group: mapAge(dog.age_key),
    size: mapSize(dog.size_key),
    gender: mapGender(dog.sex),
    color: null,
    description: stripHtml(dog.description_html),
    photos: buildPhotos(dog.picture),
    tags: normalizedTags,
    adoption_url: `${ADOPETS_PET_URL}/${dog.uuid}`,
    intake_date: dog.shelter_intake_date ? new Date(dog.shelter_intake_date) : null,
    slug: null,
    org_id: 'TX514',  // Austin Animal Center
    // Austin Paws-specific fields stored in the extra_fields pass-through
    _austin_paws: {
      uuid: dog.uuid,
      dot_color: dog.dot_color,
      kennel_number: dog.kennel_number,
      location: dog.location,
      is_urgent: dog.is_urgent,
      eligible_for_foster: dog.eligible_for_foster,
      adopter_notes: dog.adopter_notes,
      description_html: dog.description_html,
      foster: dog.foster,
      status: dog.status,
      outcomes_reason: dog.outcomes_reason,
      is_active: dog.is_active,
      characteristic_names: dog.characteristic_names,
    },
  } as RawDog & { _austin_paws: Record<string, unknown> };
}

export class AustinPawsDataSource implements DataSource {
  name = 'austin-paws-portal';

  async fetchAdoptableDogs(limit?: number): Promise<RawDog[]> {
    const allDogs = await fetchAllDogs();

    // Filter to only active, available dogs
    const activeDogs = allDogs.filter(
      (d) => d.is_active === true && d.status === 'AVAILABLE'
    );

    console.log(`[AUSTIN_PAWS] ${activeDogs.length} active/available dogs out of ${allDogs.length} total`);

    // Apply limit if specified (for testing)
    const dogs = limit ? activeDogs.slice(0, limit) : activeDogs;

    return dogs.map(toRawDog);
  }

  /**
   * Fetch all dogs (including inactive) for verification purposes.
   * Used by the cron job to check if existing dogs are still active.
   */
  async fetchAllDogsRaw(): Promise<AustinPawsDog[]> {
    return fetchAllDogs();
  }
}
