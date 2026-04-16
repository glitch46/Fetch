// Austin Paws Portal DataSource adapter — owned by Data Agent
// Implements the DataSource interface using the Austin Paws Portal API.
// Replaces SodaAdopetsDataSource, PetfinderDataSource, AdopetsDataSource, and RescueGroupsDataSource.

import { fetchAllDogs } from './austinPawsClient.js';
import { normalizeAustinPawsKeys } from './tagNormalization.js';
import type { DataSource, RawDog, RawDogPhoto, RawDogVideo, AgeGroup, DogSize, DogGender } from './datasource.js';
import type { AustinPawsDog, AustinPawsGalleryItem } from './austinPawsClient.js';

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
 * Generate size variants from an Adopets resize proxy URL.
 * URL format: https://img.prd.adopets.app/ado-resize-image-prd?path=.../AUTOx800/...
 */
function sizeVariants(url: string): RawDogPhoto {
  return {
    small: url.replace(/AUTOx\d+/, 'AUTOx200'),
    medium: url.replace(/AUTOx\d+/, 'AUTOx400'),
    large: url.replace(/AUTOx\d+/, 'AUTOx800'),
    full: url.replace(/AUTOx\d+/, 'AUTOx1200'),
  };
}

/**
 * Build a RawDogPhoto array from gallery_images and fallback picture URL.
 * When gallery_images is available and contains IMAGE items, use those as distinct photos.
 * Otherwise fall back to generating size variants from the single picture URL.
 */
function buildPhotos(pictureUrl: string | null, galleryImages: AustinPawsGalleryItem[] | null): RawDogPhoto[] {
  // Try gallery_images first
  if (galleryImages && galleryImages.length > 0) {
    const imageItems = galleryImages.filter((item) => item.type_key === 'IMAGE');
    if (imageItems.length > 0) {
      return imageItems.map((item) => sizeVariants(item.src));
    }
  }

  // Fallback to single picture URL
  if (!pictureUrl) return [];
  return [sizeVariants(pictureUrl)];
}

/**
 * Build a RawDogVideo array from gallery_images items with type_key "YOUTUBE".
 * The API returns video IDs (not full URLs) as the `src` field, so we construct
 * embed URLs from them. Each video gets the first IMAGE item as its thumbnail.
 */
function buildVideos(galleryImages: AustinPawsGalleryItem[] | null): RawDogVideo[] {
  if (!galleryImages || galleryImages.length === 0) return [];

  const videoItems = galleryImages.filter((item) => item.type_key === 'YOUTUBE');
  if (videoItems.length === 0) return [];

  const firstImage = galleryImages.find((item) => item.type_key === 'IMAGE');
  const thumbnail = firstImage ? firstImage.src : null;

  return videoItems.map((item) => ({
    url: `https://www.youtube.com/embed/${item.src}`,
    thumbnail,
    host: 'youtube' as const,
  }));
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
    photos: buildPhotos(dog.picture, dog.gallery_images),
    videos: buildVideos(dog.gallery_images),
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