// RescueGroups v5 API client — owned by Data Agent
// Fetches adoptable dog data from all rescue orgs in the Austin, TX area
// API docs: https://test1-api.rescuegroups.org/v5/public/docs

import axios, { type AxiosResponse } from 'axios';

// ── API Configuration ──────────────────────────

const BASE_URL = 'https://api.rescuegroups.org/v5';
const PAGE_LIMIT = 250;
const RATE_LIMIT_WAIT_MS = 60_000; // 60 seconds on 429

// Search radius in miles from central Austin (78702)
const AUSTIN_POSTAL_CODE = '78702';
const SEARCH_RADIUS_MILES = 30;

function getHeaders() {
  return {
    'Authorization': process.env.RESCUEGROUPS_API_KEY || '',
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/json; charset=utf-8',
  };
}

// ── Types ──────────────────────────

export interface RescueGroupsPicture {
  type: string;
  id: string;
  attributes: {
    small?: { url: string };
    medium?: { url: string };
    large?: { url: string };
    original?: { url: string };
  };
}

export interface RescueGroupsBreed {
  type: string;
  id: string;
  attributes: {
    name: string;
  };
}

export interface RescueGroupsColor {
  type: string;
  id: string;
  attributes: {
    name: string;
  };
}

export interface RescueGroupsAnimalAttributes {
  name?: string;
  sex?: string;
  ageGroup?: string;
  sizeGroup?: string;
  descriptionText?: string;
  descriptionHtml?: string;
  breedString?: string;
  breedPrimary?: string;
  breedSecondary?: string;
  isBreedMixed?: boolean;
  coatLength?: string;
  isAdoptionPending?: boolean;
  isHouseTrained?: boolean;
  isGoodWithDogs?: boolean;
  isGoodWithCats?: boolean;
  isGoodWithKids?: boolean;
  isCatsOk?: boolean;
  activityLevel?: string;
  isUrgent?: boolean;
  isFosterOnly?: boolean;
  isSpecialNeeds?: boolean;
  rescueId?: string;
  url?: string;
  priority?: string;
  pictureThumbnailUrl?: string;
  birthDate?: string;
  ageString?: string;
  createdDate?: string;
  updatedDate?: string;
  distance?: number;
  [key: string]: unknown;
}

export interface RescueGroupsAnimal {
  type: string;
  id: string;
  attributes: RescueGroupsAnimalAttributes;
  relationships?: {
    pictures?: { data: Array<{ type: string; id: string }> };
    breeds?: { data: Array<{ type: string; id: string }> };
    colors?: { data: Array<{ type: string; id: string }> };
    orgs?: { data: Array<{ type: string; id: string }> };
  };
}

interface RescueGroupsResponse {
  data: RescueGroupsAnimal[];
  included?: Array<RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>;
  meta?: {
    count: number;
    countReturned: number;
    pageReturned: number;
    limit: number;
    pages: number;
    transactionId: string;
  };
}

// ── HTTP Helpers with 429 Retry ──────────────────────────

async function apiGet<T>(url: string): Promise<AxiosResponse<T>> {
  const timestamp = new Date().toISOString();
  console.log(`[RESCUEGROUPS] ${timestamp} GET ${url}`);

  try {
    const response = await axios.get<T>(url, { headers: getHeaders(), timeout: 30000, responseEncoding: 'utf8' } as any);
    console.log(`[RESCUEGROUPS] ${timestamp} → ${response.status}`);
    return response;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      console.warn(`[RESCUEGROUPS] ${timestamp} → 429 Rate Limited. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));

      const retryResponse = await axios.get<T>(url, { headers: getHeaders(), timeout: 30000, responseEncoding: 'utf8' } as any);
      console.log(`[RESCUEGROUPS] ${timestamp} retry → ${retryResponse.status}`);
      return retryResponse;
    }
    throw err;
  }
}

async function apiPost<T>(url: string, body: unknown): Promise<AxiosResponse<T>> {
  const timestamp = new Date().toISOString();
  console.log(`[RESCUEGROUPS] ${timestamp} POST ${url}`);

  try {
    const response = await axios.post<T>(url, body, { headers: getHeaders(), timeout: 30000, responseEncoding: 'utf8' } as any);
    console.log(`[RESCUEGROUPS] ${timestamp} → ${response.status}`);
    return response;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      console.warn(`[RESCUEGROUPS] ${timestamp} → 429 Rate Limited. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));

      const retryResponse = await axios.post<T>(url, body, { headers: getHeaders(), timeout: 30000, responseEncoding: 'utf8' } as any);
      console.log(`[RESCUEGROUPS] ${timestamp} retry → ${retryResponse.status}`);
      return retryResponse;
    }
    throw err;
  }
}

// ── Main Export ──────────────────────────

/**
 * Fetches all adoptable dogs within SEARCH_RADIUS_MILES of Austin, TX
 * from every rescue org and shelter listed on RescueGroups.
 *
 * Uses the POST /public/animals/search/available/dogs endpoint with
 * filterRadius to get dogs from all orgs in the area in a single query.
 *
 * Returns raw API animals along with a map of included resources for cross-referencing.
 */
export async function fetchAdoptableDogs(): Promise<{
  animals: RescueGroupsAnimal[];
  included: Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>;
}> {
  console.log(`[RESCUEGROUPS] Fetching adoptable dogs within ${SEARCH_RADIUS_MILES} miles of Austin (${AUSTIN_POSTAL_CODE})...`);

  const allAnimals: RescueGroupsAnimal[] = [];
  const includedMap = new Map<string, RescueGroupsPicture | RescueGroupsBreed | RescueGroupsColor>();

  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const url = `${BASE_URL}/public/animals/search/available/dogs` +
      `?include=pictures,breeds,colors,orgs` +
      `&limit=${PAGE_LIMIT}` +
      `&page=${page}`;

    const { data } = await apiPost<RescueGroupsResponse>(url, {
      data: {
        filterRadius: {
          miles: SEARCH_RADIUS_MILES,
          postalcode: AUSTIN_POSTAL_CODE,
        },
      },
    });

    if (data.data) {
      allAnimals.push(...data.data);
    }

    // Index included resources by "type:id" for easy lookup
    if (data.included) {
      for (const inc of data.included) {
        includedMap.set(`${inc.type}:${inc.id}`, inc);
      }
    }

    // Update pagination from meta
    if (data.meta) {
      lastPage = data.meta.pages;
      if (page === 1) {
        console.log(`[RESCUEGROUPS] Total available: ${data.meta.count} dogs across ${lastPage} pages`);
      }
    }

    console.log(`[RESCUEGROUPS] Page ${page}/${lastPage}: ${data.data?.length || 0} animals`);
    page++;
  }

  console.log(`[RESCUEGROUPS] Total adoptable dogs fetched: ${allAnimals.length}`);
  return { animals: allAnimals, included: includedMap };
}
