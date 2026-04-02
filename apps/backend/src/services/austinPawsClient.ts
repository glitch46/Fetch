// Austin Paws Portal API client — owned by Data Agent
// Fetches dog data from the Austin Paws Portal external API
// Replaces SODA API + Adopets scraper + Petfinder scraper + RescueGroups client

import axios from 'axios';
import type { AxiosInstance } from 'axios';

const BASE_URL = process.env.AUSTIN_PAWS_BASE_URL || 'https://austinpawsportal.com';
const API_KEY = process.env.AUSTIN_PAWS_API_KEY || '';

export interface AustinPawsDog {
  uuid: string;
  animal_id: string;
  name: string;
  sex: string;
  age_key: string | null;
  size_key: string | null;
  breed_primary_name: string;
  status: string;
  foster: boolean;
  kennel_number: string | null;
  location: string | null;
  picture: string | null;
  description_html: string | null;
  characteristic_keys: string[];
  characteristic_names: string[];
  dot_color: string | null;
  adopter_notes: string | null;
  shelter_intake_date: string | null;
  first_seen_intake_date: string | null;
  outcomes_reason: string | null;
  is_urgent: boolean;
  eligible_for_foster: boolean | null;
  reason_added: string | null;
  upl_last_synced: string | null;
  first_seen_at: string | null;
  last_updated_at: string | null;
  last_fetched_at: string | null;
  is_active: boolean;
  created_at: string | null;
}

/**
 * Create an axios instance that preserves the Authorization header on redirects.
 * Vercel may redirect, and by default axios strips auth headers on redirect.
 */
function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
    // Follow redirects but we need to preserve auth headers.
    // Axios uses follow-redirects under the hood which strips auth by default.
    maxRedirects: 5,
  });

  // Intercept redirects to re-attach the Authorization header
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (
        error.response &&
        [301, 302, 307, 308].includes(error.response.status) &&
        error.response.headers.location
      ) {
        // Manual redirect with auth preserved
        return client.get(error.response.headers.location);
      }
      throw error;
    }
  );

  return client;
}

const client = createClient();

/**
 * Fetch all dogs from the Austin Paws Portal.
 * Returns the full list; caller is responsible for filtering by is_active.
 */
export async function fetchAllDogs(): Promise<AustinPawsDog[]> {
  console.log(`[AUSTIN_PAWS] Fetching all dogs from ${BASE_URL}/api/external/dogs`);
  const startTime = Date.now();

  const response = await client.get<{ dogs: AustinPawsDog[] }>('/api/external/dogs');
  const dogs = response.data.dogs;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[AUSTIN_PAWS] Fetched ${dogs.length} dogs in ${elapsed}s`);

  return dogs;
}

/**
 * Fetch a single dog by UUID.
 */
export async function fetchDogByUuid(uuid: string): Promise<AustinPawsDog | null> {
  try {
    const response = await client.get<AustinPawsDog>(`/api/external/dogs/${uuid}`);
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}
