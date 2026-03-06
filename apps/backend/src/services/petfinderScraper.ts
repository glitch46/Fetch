// Petfinder scraper using Playwright
// Scrapes adoptable dog listings near Austin from Petfinder's GraphQL API
// by intercepting responses from psl.petfinder.com/graphql
//
// Strategy: Launch headed Chromium (headless gets 403 from Akamai WAF),
// navigate search pages, intercept the GraphQL searchAnimal responses,
// then visit detail pages to get descriptions (not included in search results).

import { chromium, type Browser, type Page } from 'playwright';
import type { RawDog, RawDogPhoto, AgeGroup, DogSize, DogGender } from './datasource.js';

const SEARCH_URL = 'https://www.petfinder.com/search/dogs-for-adoption/us/tx/austin/';
const SEARCH_DISTANCE = '20mi';
const SCRAPE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // Hard cap: 2 hours per scrape run

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Shape of an animal from the Petfinder GraphQL searchAnimal response
interface GqlAnimal {
  animalId: string;
  animalName: string;
  publicUrl: { url: string };
  organization: {
    organizationDisplayId: string;
    organizationName: string;
  };
  physical: {
    sex: string;
    breed: { primary: string; secondary: string | null };
    color: { primary: string | null };
    size: { label: string };
    age: { value: string };
  };
  behavior: {
    houseTrained: string | null;
    interactions: {
      cats: string | null;
      dogs: string | null;
      childrenUnder8: string | null;
      children8AndUp: string | null;
    } | null;
  };
  _media: Array<{ publicUrl: string }>;
  meta: {
    publishTime: string;
    create: { time: string };
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(): Promise<void> {
  return delay(1000 + Math.random() * 1000);
}

function mapAge(age: string): AgeGroup {
  const lower = age.toLowerCase();
  if (lower === 'baby') return 'Baby';
  if (lower === 'young') return 'Young';
  if (lower === 'senior') return 'Senior';
  return 'Adult';
}

function mapSize(label: string): DogSize | null {
  const lower = label.toLowerCase();
  if (lower === 'small') return 'Small';
  if (lower === 'medium') return 'Medium';
  if (lower === 'large') return 'Large';
  if (lower.includes('extra') || lower === 'xlarge') return 'Extra Large';
  return null;
}

function mapGender(sex: string): DogGender {
  const lower = sex.toLowerCase();
  if (lower === 'male') return 'Male';
  if (lower === 'female') return 'Female';
  return 'Unknown';
}

/**
 * Build photo URLs from Petfinder CloudFront media records.
 * The publicUrl field is a relative CloudFront path without protocol.
 */
function buildPhotos(media: Array<{ publicUrl: string }>): RawDogPhoto[] {
  return media
    .filter((m) => m.publicUrl)
    .map((m) => {
      const base = m.publicUrl.startsWith('http') ? m.publicUrl : `https://${m.publicUrl}`;
      // Strip any existing query params for the "full" version
      const clean = base.replace(/\?.*$/, '');
      return {
        small: `${clean}?width=100`,
        medium: `${clean}?width=300`,
        large: `${clean}?width=600`,
        full: clean,
      };
    });
}

/**
 * Build behavioral tags from GraphQL behavior data
 */
function buildTags(behavior: GqlAnimal['behavior']): string[] {
  const tags: string[] = [];
  if (behavior.houseTrained === 'Yes') tags.push('housetrained');
  if (behavior.interactions) {
    if (behavior.interactions.dogs === 'Yes') tags.push('good with dogs');
    if (behavior.interactions.cats === 'Yes') tags.push('good with cats');
    if (behavior.interactions.childrenUnder8 === 'Yes') tags.push('good with young kids');
    if (behavior.interactions.children8AndUp === 'Yes') tags.push('good with older kids');
  }
  return tags;
}

/**
 * Convert a GraphQL animal to RawDog (without description — that comes from detail pages)
 */
function gqlAnimalToRawDog(animal: GqlAnimal): RawDog {
  const publicUrl = animal.publicUrl?.url || '';
  const fullUrl = publicUrl.startsWith('http')
    ? publicUrl
    : `https://www.petfinder.com/${publicUrl}/details/`;

  // Extract slug from URL path like "dog/luna-{uuid}/tx/austin/..."
  const slugMatch = publicUrl.match(/dog\/([^/]+)\//);
  const slug = slugMatch ? slugMatch[1] : null;

  return {
    external_id: animal.animalId,
    name: animal.animalName,
    breed_primary: animal.physical.breed.primary || 'Mixed Breed',
    breed_secondary: animal.physical.breed.secondary,
    age_group: mapAge(animal.physical.age.value),
    size: mapSize(animal.physical.size.label),
    gender: mapGender(animal.physical.sex),
    color: animal.physical.color?.primary || null,
    description: null, // filled in from detail page
    photos: buildPhotos(animal._media || []),
    tags: buildTags(animal.behavior),
    adoption_url: fullUrl,
    intake_date: animal.meta?.publishTime ? new Date(animal.meta.publishTime) : null,
    slug,
    org_id: animal.organization.organizationDisplayId,
  };
}

/**
 * Set up GraphQL response interceptor on the page.
 * Returns a mutable array that collects animals from searchAnimal responses.
 */
function setupGraphQLInterceptor(page: Page): { animals: GqlAnimal[] } {
  const collected: { animals: GqlAnimal[] } = { animals: [] };

  page.on('response', async (response) => {
    if (!response.url().includes('graphql') || response.status() !== 200) return;
    try {
      const json = await response.json();
      const animals = json?.data?.searchAnimal?.animals;
      if (Array.isArray(animals)) {
        collected.animals.push(...animals);
      }
    } catch {
      // ignore non-JSON or parse errors
    }
  });

  return collected;
}

/**
 * Fetch description from a dog's detail page via __NEXT_DATA__
 */
async function fetchDescription(
  page: Page,
  url: string,
  retries = 2
): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000);

      const description = await page.evaluate(() => {
        // Try __NEXT_DATA__ first (most reliable)
        const nextDataEl = document.querySelector('#__NEXT_DATA__');
        if (nextDataEl) {
          try {
            const data = JSON.parse(nextDataEl.textContent || '{}');
            const desc = data?.props?.pageProps?.animal?.description;
            if (desc) return desc as string;
          } catch {}
        }
        // Fallback: DOM scraping
        const descEl = document.querySelector(
          '[class*="Description"], [class*="description"], [data-test*="description"]'
        );
        return descEl?.textContent?.trim() || null;
      });

      return description;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[SCRAPER] Detail page retry ${attempt + 1} for ${url}`);
        await delay(2000);
        continue;
      }
      console.warn(`[SCRAPER] Failed to get description from: ${url}`);
      return null;
    }
  }
  return null;
}

/**
 * Main entry point — scrape Petfinder for adoptable dogs near Austin
 */
export async function scrapePetfinderDogs(limit?: number, startPage = 1): Promise<RawDog[]> {
  console.log('[SCRAPER] Launching browser...');
  let browser: Browser | null = null;
  const startTime = Date.now();

  try {
    // Must use headed mode — headless gets 403 from Akamai WAF
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/Chicago',
    });

    const page = await context.newPage();

    // Remove webdriver flag that bot detectors check
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Intercept GraphQL requests to override the search distance (default is 100mi)
    await page.route('**/graphql', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') { await route.continue(); return; }
      const body = req.postData();
      if (!body || !body.includes('searchAnimal')) { await route.continue(); return; }
      const modified = body.replace(/"distance":"100mi"/g, `"distance":"${SEARCH_DISTANCE}"`);
      await route.continue({ postData: modified });
    });

    // Set up GraphQL response interceptor
    const intercepted = setupGraphQLInterceptor(page);

    // Navigate to search pages — the GraphQL interceptor captures animal data
    const allAnimals: GqlAnimal[] = [];
    const seenIds = new Set<string>();
    let pageNum = Math.max(1, startPage);
    let hasMore = true;

    // Hard cap listing crawl to avoid triggering anti-bot blocks.
    // For limited runs, collect up to 100 candidates to allow filtering down to the requested count.
    const candidateTarget = typeof limit === 'number' ? Math.min(100, Math.max(limit * 2, limit)) : undefined;
    const maxPagesThisRun = typeof candidateTarget === 'number' ? Math.max(1, Math.ceil(candidateTarget / 12)) : undefined;
    const maxPageNum = typeof maxPagesThisRun === 'number' ? pageNum + maxPagesThisRun - 1 : undefined;

    while (hasMore) {
      if (Date.now() - startTime >= SCRAPE_TIMEOUT_MS) {
        console.warn('[SCRAPER] Reached 2-hour timeout during listing scrape; stopping early');
        break;
      }

      const searchUrl = new URL(SEARCH_URL);
      if (pageNum > 1) searchUrl.searchParams.set('page', String(pageNum));

      console.log(`[SCRAPER] Loading search page ${pageNum}...`);
      intercepted.animals = [];

      try {
        await page.goto(searchUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait for GraphQL response to arrive
        await delay(8000);

        if (intercepted.animals.length === 0) {
          console.log(`[SCRAPER] No GraphQL results on page ${pageNum} — stopping`);
          hasMore = false;
          break;
        }

        // Deduplicate by animalId
        for (const animal of intercepted.animals) {
          if (!seenIds.has(animal.animalId)) {
            seenIds.add(animal.animalId);
            allAnimals.push(animal);
          }
        }

        console.log(`[SCRAPER] Page ${pageNum}: ${intercepted.animals.length} dogs, total: ${allAnimals.length}`);

        // Stop listing crawl once we have enough candidates to satisfy filtered target
        if (typeof candidateTarget === 'number' && allAnimals.length >= candidateTarget) {
          allAnimals.splice(candidateTarget);
          hasMore = false;
          break;
        }

        if (typeof maxPageNum === 'number' && pageNum >= maxPageNum) {
          hasMore = false;
          break;
        }

        // Continue until the endpoint stops returning animals.
        if (intercepted.animals.length === 0) {
          hasMore = false;
        } else {
          pageNum++;
          await randomDelay();
        }
      } catch (err) {
        console.error(`[SCRAPER] Error on search page ${pageNum}:`, err);
        hasMore = false;
      }
    }

    console.log(`[SCRAPER] Collected ${allAnimals.length} dogs. Fetching descriptions...`);

    // Convert to RawDog and fetch descriptions from detail pages
    const rawDogs: RawDog[] = [];

    for (const animal of allAnimals) {
      if (Date.now() - startTime >= SCRAPE_TIMEOUT_MS) {
        console.warn('[SCRAPER] Reached 2-hour timeout during detail scrape; returning collected dogs');
        break;
      }

      try {
        const rawDog = gqlAnimalToRawDog(animal);

        // Permanent rule: skip low-quality profiles with only one image
        if (rawDog.photos.length <= 1) {
          console.log(`[SCRAPER] Skipping ${rawDog.name}: only ${rawDog.photos.length} photo`);
          continue;
        }

        // Fetch description from detail page
        await randomDelay();
        const description = await fetchDescription(page, rawDog.adoption_url!);
        if (!description || !description.trim()) {
          console.log(`[SCRAPER] Skipping ${rawDog.name}: missing description`);
          continue;
        }
        rawDog.description = description;

        rawDogs.push(rawDog);
        console.log(
          `[SCRAPER] ${rawDog.name} — ${rawDog.breed_primary}, ${rawDog.photos.length} photos, desc: ${description ? 'yes' : 'no'}`
        );
      } catch (err) {
        console.warn(`[SCRAPER] Skipping ${animal.animalName}:`, err);
        continue;
      }

      if (typeof limit === 'number' && rawDogs.length >= limit) {
        break;
      }
    }

    console.log(`[SCRAPER] Done. Returning ${rawDogs.length} dogs.`);
    return rawDogs;
  } finally {
    if (browser) {
      await browser.close();
      console.log('[SCRAPER] Browser closed.');
    }
  }
}
