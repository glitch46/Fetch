// Cloudflare Browser Rendering scraper for Adopt-a-Pet
// Uses Cloudflare endpoints to extract listing cards and dog profile details

import axios from 'axios';
import type { RawDog, RawDogPhoto, AgeGroup, DogSize, DogGender } from './datasource.js';
import { normalizeRawTags, inferPreferenceTagsFromText, filterToPreferenceTags } from './tagNormalization.js';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

interface AdoptapetSearchResult {
  name: string;
  url: string;
  externalId: string;
  location: string;
}

interface SearchPageResult {
  dogs: AdoptapetSearchResult[];
  hadCards: boolean;
}

interface ScrapeNode {
  text?: string;
  html?: string;
  attributes?: Array<{ name: string; value: string }>;
}

interface ScrapeResultEntry {
  selector: string;
  results: ScrapeNode[];
}

const TARGET_ZIP = '78721';
const TARGET_RADIUS_MILES = 50;
const TARGET_COORDS = { lat: 30.2726, lon: -97.6836 }; // Austin, TX 78721
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();
const SEARCH_PAGE_DELAY_MS = 22000;
const PROFILE_DELAY_MS = 22000;
const AUSTIN_METRO_LOCATIONS = new Set([
  'AUSTIN, TX',
  'ROUND ROCK, TX',
  'PFLUGERVILLE, TX',
  'CEDAR PARK, TX',
  'LEANDER, TX',
  'GEORGETOWN, TX',
  'HUTTO, TX',
  'MANOR, TX',
  'DEL VALLE, TX',
  'ELGIN, TX',
  'BASTROP, TX',
  'BUDA, TX',
  'KYLE, TX',
  'DRIPPING SPRINGS, TX',
  'BEE CAVE, TX',
  'LAKEWAY, TX',
  'JONESTOWN, TX',
  'LAGO VISTA, TX',
  'LIBERTY HILL, TX',
  'LOCKHART, TX',
  'SMITHVILLE, TX',
  'MARBLE FALLS, TX',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(baseMs: number, jitterMs = 3000): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}

function hasCloudflareRateLimitSignal(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response?.status === 429) return true;

  const responseData = error.response?.data as { errors?: Array<{ message?: string }> } | undefined;
  const firstMessage = responseData?.errors?.[0]?.message?.toLowerCase() || '';
  return firstMessage.includes('rate limit exceeded');
}

function haversineMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocodeLocation(location: string): Promise<{ lat: number; lon: number } | null> {
  const normalized = location.trim();
  if (!normalized) return null;

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized) || null;
  }

  try {
    const response = await axios.get<Array<{ lat: string; lon: string }>>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: `${normalized}, USA`,
          format: 'jsonv2',
          limit: 1,
        },
        headers: {
          'User-Agent': 'FetchDogSync/1.0 (local-dev)',
        },
        timeout: 20000,
      }
    );

    const first = response.data?.[0];
    if (!first?.lat || !first?.lon) {
      geocodeCache.set(normalized, null);
      return null;
    }

    const coords = {
      lat: Number(first.lat),
      lon: Number(first.lon),
    };
    geocodeCache.set(normalized, coords);

    await sleep(1200);
    return coords;
  } catch {
    geocodeCache.set(normalized, null);
    return null;
  }
}

async function isWithinTargetRadius(location: string): Promise<boolean> {
  const normalized = location.trim().toUpperCase();
  if (!/,\s*TX$/i.test(normalized)) {
    return false;
  }

  if (AUSTIN_METRO_LOCATIONS.has(normalized)) {
    return true;
  }

  const coords = await geocodeLocation(normalized);
  if (!coords) return false;

  const miles = haversineMiles(coords, TARGET_COORDS);
  return miles <= TARGET_RADIUS_MILES;
}

function parseAge(ageStr: string | undefined): AgeGroup {
  if (!ageStr) return 'Adult';
  const lower = ageStr.toLowerCase();
  if (lower.includes('puppy') || lower.includes('baby') || lower.includes('young')) return 'Young';
  if (lower.includes('senior')) return 'Senior';
  if (lower.includes('adult')) return 'Adult';
  if (lower.includes('baby')) return 'Baby';
  return 'Adult';
}

function parseSize(sizeStr: string | undefined): DogSize {
  if (!sizeStr) return 'Medium';
  const lower = sizeStr.toLowerCase();
  if (lower.includes('small') || lower.includes('mini') || lower.includes('toy')) return 'Small';
  if (lower.includes('large') || lower.includes('big')) return 'Large';
  if (lower.includes('extra') || lower.includes('xl') || lower.includes('giant')) return 'Extra Large';
  return 'Medium';
}

function parseGender(genderStr: string | undefined): DogGender {
  if (!genderStr) return 'Unknown';
  const lower = genderStr.toLowerCase();
  if (lower.includes('female')) return 'Female';
  if (lower.includes('male')) return 'Male';
  return 'Unknown';
}

function photosToRawDogPhotos(urls: string[]): RawDogPhoto[] {
  const unique = [...new Set(urls.filter(Boolean))];
  return unique.map((url) => ({
    small: url,
    medium: url,
    large: url,
    full: url,
  }));
}

function decodeEscapedJsonString(value: string): string {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseSexAgeFromSummary(value: string): { sex: string; age: string } {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    sex: parts[0] || '',
    age: parts.slice(1).join(', '),
  };
}

function toAbsoluteAdoptapetUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `https://www.adoptapet.com${url}`;
  }
  return `https://www.adoptapet.com/${url}`;
}

function mapPetPhotoIdToUrl(photoId: string | number): string {
  return `https://media.adoptapet.com/image/upload/d_Fallback-Photo_Dog-v3.png/c_fit,h_523,dpr_2/f_auto,q_auto/${photoId}`;
}

function looksLikeDogPhotoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('media.adoptapet.com/image/upload/') &&
    !lower.includes('/logo') &&
    !lower.includes('icon') &&
    !lower.includes('badge') &&
    !lower.endsWith('.svg')
  );
}

function parseListingDataFromWireInitialData(attr: string): AdoptapetSearchResult[] {
  try {
    const parsed = JSON.parse(attr) as {
      serverMemo?: {
        data?: {
          petsCollection?: Array<{
            petId?: number;
            name?: string;
            address?: { city?: string; state?: string };
            pdpRoute?: string;
          }>;
        };
      };
    };

    const pets = parsed.serverMemo?.data?.petsCollection || [];
    const results: AdoptapetSearchResult[] = [];

    for (const pet of pets) {
      if (!pet.petId || !pet.pdpRoute) {
        continue;
      }

      const city = pet.address?.city?.trim();
      const state = pet.address?.state?.trim();
      const location = city && state ? `${city}, ${state}` : '';
      const url = toAbsoluteAdoptapetUrl(pet.pdpRoute);

      results.push({
        name: pet.name?.trim() || 'Unknown',
        url,
        externalId: String(pet.petId),
        location,
      });
    }

    return results;
  } catch {
    return [];
  }
}

function extractMainStory(textNodes: ScrapeNode[]): string | null {
  for (const node of textNodes) {
    const raw = node.text?.trim();
    if (!raw || raw.length < 80) {
      continue;
    }

    const lower = raw.toLowerCase();
    if (
      lower.includes('find a pet') ||
      lower.includes('adopt a dog') ||
      lower.includes('adopt a cat') ||
      lower.includes('how it works') ||
      lower.includes('breed 101')
    ) {
      continue;
    }

    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 80) {
      return cleaned;
    }
  }

  return null;
}

function sanitizeStoryText(value: string): string | null {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^my story\s*/i, '')
    .replace(/^here'?s what the humans have to say about me:\s*/i, '')
    .trim();

  if (!cleaned || cleaned.length < 80) return null;

  const lower = cleaned.toLowerCase();
  const footerTerms = [
    'information sitemap privacy policy terms of service',
    'informationsitemapprivacypolicytermsofservice',
    'cookiesaccessibilitymars,incorporatedadchoicesprivacyoptions',
    'information sitemap',
    'privacy policy',
    'terms of service',
    'cookies',
    'accessibility',
    'cookies accessibility',
    'mars, incorporated',
    'adchoices',
    'privacy options',
  ];

  if (footerTerms.some((term) => lower.includes(term))) {
    return null;
  }

  if (!/[.!?]/.test(cleaned)) {
    return null;
  }

  if (lower.includes('here\'s what the humans have to say about me:')) {
    const index = lower.indexOf('here\'s what the humans have to say about me:');
    const sliced = cleaned.slice(index + "here's what the humans have to say about me:".length).trim();
    return sliced.length >= 80 ? sliced : null;
  }

  if (lower.includes('here is what the humans have to say about me:')) {
    const index = lower.indexOf('here is what the humans have to say about me:');
    const sliced = cleaned.slice(index + 'here is what the humans have to say about me:'.length).trim();
    return sliced.length >= 80 ? sliced : null;
  }

  return cleaned;
}

function extractStoryFromAnchoredText(raw: string): string | null {
  const lower = raw.toLowerCase();
  const anchors = [
    "here's what the humans have to say about me:",
    'here is what the humans have to say about me:',
    'what the humans have to say about me:',
  ];

  const anchor = anchors.find((candidate) => lower.includes(candidate));
  if (!anchor) return null;

  const start = lower.indexOf(anchor) + anchor.length;
  let story = raw.slice(start).trim();

  const stopTokens = [
    'their adoption process',
    'more about this rescue',
    'contact info',
    'information',
    'sitemap',
    'privacy policy',
    'terms of service',
    'adchoices',
    'privacy options',
  ];

  const storyLower = story.toLowerCase();
  let endIndex = story.length;
  for (const token of stopTokens) {
    const tokenIndex = storyLower.indexOf(token);
    if (tokenIndex !== -1 && tokenIndex < endIndex) {
      endIndex = tokenIndex;
    }
  }

  story = story.slice(0, endIndex).trim();
  return sanitizeStoryText(story);
}

function extractStoryFromSections(sectionNodes: ScrapeNode[], paragraphNodes: ScrapeNode[]): string | null {
  for (const node of sectionNodes) {
    const text = node.text?.trim() || '';
    if (!text) continue;

    const lower = text.toLowerCase();
    if (lower.includes('my story') && lower.includes('what the humans have to say about me')) {
      const anchored = extractStoryFromAnchoredText(text);
      if (anchored) return anchored;

      const direct = sanitizeStoryText(text);
      if (direct) return direct;
    }
  }

  for (const node of paragraphNodes) {
    const text = node.text?.trim() || '';
    const cleaned = sanitizeStoryText(text);
    if (cleaned) return cleaned;
  }

  return null;
}

function extractStoryFromBodyText(bodyText: string): string | null {
  // The body text from the full page contains the "My story" section.
  // Try to extract it using known anchor patterns.
  const anchored = extractStoryFromAnchoredText(bodyText);
  if (anchored) return anchored;

  // Also try a regex-based extraction: look for "My story" heading
  // followed by the actual story content before the next section.
  const storyMatch = bodyText.match(
    /my story[^a-z]*(?:here'?s what the humans have to say about me[:\s]*)?([\s\S]{80,?}?)(?:their adoption process|more about this|contact info|shelter|pet id\s+\d|sign up for)/i
  );
  if (storyMatch?.[1]) {
    const cleaned = sanitizeStoryText(storyMatch[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

function extractScriptPayload(scriptNodes: ScrapeNode[]): string {
  const joined = scriptNodes
    .map((node) => {
      const raw = node.html || node.text || '';
      return raw.replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '').trim();
    })
    .filter(Boolean)
    .join('\n');

  return `${joined}\n${decodeEscapedJsonString(joined)}`;
}

function extractPhotoIdsFromFlight(payload: string): string[] {
  const ids = new Set<string>();
  const regexes = [/sourcePhotoId\\":(\d+)/g, /"sourcePhotoId":(\d+)/g];

  for (const regex of regexes) {
    for (const match of payload.matchAll(regex)) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }
  }

  return Array.from(ids);
}

function extractStoryFromFlight(payload: string): string | null {
  const refMatch = payload.match(/petStory\\":\\"\$(\d+)\\"/) || payload.match(/"petStory":"\$(\d+)"/);
  const ref = refMatch?.[1];
  if (!ref) return null;

  const blockRegex = new RegExp(`${ref}:T\\d+,([\\s\\S]*?)(?:\
\\d+:|$)`);
  const blockMatch = payload.match(blockRegex);
  if (blockMatch?.[1]) {
    const cleaned = blockMatch[1]
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\n/g, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const fromPrimary = sanitizeStoryText(cleaned);
    if (fromPrimary) return fromPrimary;
  }

  const altMatch = payload.match(/"petStory":"([^"]{80,})"/i);
  if (altMatch?.[1]) {
    return sanitizeStoryText(decodeEscapedJsonString(altMatch[1]));
  }

  const altEscapedMatch = payload.match(/petStory\\":\\"([^\\"]{80,})\\"/i);
  if (altEscapedMatch?.[1]) {
    return sanitizeStoryText(decodeEscapedJsonString(altEscapedMatch[1]));
  }

  const anchored = extractStoryFromAnchoredText(decodeEscapedJsonString(payload));
  if (anchored) return anchored;

  return null;
}

function extractValueByLabel(labels: ScrapeNode[], values: ScrapeNode[], wantedLabel: string): string | null {
  const normalized = wantedLabel.trim().toLowerCase();
  const labelTexts = labels.map((node) => (node.text || '').trim().toLowerCase());
  const index = labelTexts.findIndex((label) => label === normalized);
  if (index === -1) return null;

  const value = values[index]?.text?.trim();
  return value || null;
}

function getAttribute(node: ScrapeNode, name: string): string | undefined {
  return node.attributes?.find((attr) => attr.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractLocationFromPetUrl(url: string): string {
  const match = url.match(/\/pet\/\d+-([a-z-]+)-([a-z-]+)-/i);
  if (!match) return '';

  const city = match[1].replace(/-/g, ' ').trim();
  const stateWord = match[2].trim().toUpperCase();
  if (!city || !stateWord) return '';

  const stateAbbreviation = stateWord === 'TEXAS' ? 'TX' : stateWord;
  return `${city.replace(/\b\w/g, (c) => c.toUpperCase())}, ${stateAbbreviation}`;
}

function extractDogPhotoUrls(allUrls: string[]): string[] {
  const filtered = allUrls
    .filter((url) => url.includes('media.adoptapet.com/image/upload/'))
    .filter((url) => !url.toLowerCase().endsWith('.svg'))
    .filter((url) => !/icon-|logo-|badge|privacy|tooltip|hamburger|rehome/i.test(url))
    .filter((url) => /\/c_fit,h_400|\/w_104,ar_1:1/i.test(url))
    .map((url) => url.trim());

  // Keep only URLs tied to the primary pet photo IDs shown in the hero/thumb gallery.
  // This excludes recommendation tiles that use different transforms (for example w_358).
  const ids = filtered
    .map((url) => {
      const match = url.match(/\/(\d+)(?:\?|$)/);
      return match?.[1] || null;
    })
    .filter((id): id is string => Boolean(id));

  const keepIds = [...new Set(ids)].slice(0, 8);
  const keepIdSet = new Set(keepIds);

  const scoped = filtered.filter((url) => {
    const match = url.match(/\/(\d+)(?:\?|$)/);
    return match?.[1] ? keepIdSet.has(match[1]) : false;
  });

  return [...new Set(scoped)];
}

function parseExternalIdFromUrl(url: string): string {
  const match = url.match(/\/pet\/(\d+)/i);
  if (match?.[1]) return match[1];
  return url;
}

function parseBreed(raw: string): { primary: string; secondary: string | null } {
  const value = raw.trim();
  if (!value) return { primary: 'Mixed Breed', secondary: null };

  const separators = ['/', ' & ', ' and ', ','];
  for (const separator of separators) {
    if (value.includes(separator)) {
      const parts = value
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        return { primary: parts[0], secondary: parts[1] };
      }
    }
  }

  return { primary: value, secondary: null };
}

function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

function extractProfileTags(text: string): string[] {
  const tokens = text
    .split(/[\n|,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.length <= 40);

  return [...new Set(tokens)].slice(0, 20);
}

function toCanonicalHealthTag(raw: string): string | null {
  const normalized = raw.toLowerCase().trim();

  if (normalized === 'spayed/neutered' || normalized === 'spayed or neutered') return null;
  if (normalized === 'shots current') return null;
  if (normalized === 'microchipped') return null;

  return normalized;
}

async function scrapeDogProfile(url: string, fallbackName?: string, attempt = 0): Promise<RawDog | null> {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;

  try {
    const response = await axios.post<{
      success: boolean;
      result: ScrapeResultEntry[];
    }>(
      endpoint,
      {
        url,
        elements: [
          { selector: 'body' },
          { selector: 'h1' },
          { selector: '.pdp-grid-header h1' },
          { selector: '.pdp-grid-content dl dt' },
          { selector: '.pdp-grid-content dl dd' },
          { selector: '.pdp-grid-content h3' },
          { selector: '.pdp-grid-content section' },
          { selector: '.pdp-grid-content section p' },
          { selector: '.pdp-grid-content section ul li span' },
          { selector: '[data-testid="main-media-container"] img' },
          { selector: 'meta[property="og:image"]' },
          { selector: 'script' },
          { selector: 'li' },
        ],
        gotoOptions: {
          waitUntil: 'networkidle2',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    if (!response.data.success || !response.data.result) {
      console.error(`[CLOUDFLARE] Failed to scrape ${url}:`, response.data);
      return null;
    }

    const bySelector = new Map(response.data.result.map((item) => [item.selector, item.results]));

    // --- Adopted dog detection ---
    const bodyNodes = bySelector.get('body') || [];
    const bodyText = (bodyNodes[0]?.text || '').toLowerCase();
    if (bodyText.includes('looks like this pet may have been adopted') ||
        bodyText.includes('this pet is no longer available')) {
      console.log(`[CLOUDFLARE] ADOPTED - skipping ${url}`);
      return null;
    }

    const h1All = bySelector.get('h1') || [];
    const h1 = bySelector.get('.pdp-grid-header h1') || [];
    const infoLabels = bySelector.get('.pdp-grid-content dl dt') || [];
    const infoValues = bySelector.get('.pdp-grid-content dl dd') || [];
    const contentHeaders = bySelector.get('.pdp-grid-content h3') || [];
    const sectionNodes = bySelector.get('.pdp-grid-content section') || [];
    const sectionParagraphNodes = bySelector.get('.pdp-grid-content section p') || [];
    const healthNodes = bySelector.get('.pdp-grid-content section ul li span') || [];
    const heroImages = bySelector.get('[data-testid="main-media-container"] img') || [];
    const ogImages = bySelector.get('meta[property="og:image"]') || [];
    const scriptNodes = bySelector.get('script') || [];
    const listItems = bySelector.get('li') || [];
    const flightPayload = extractScriptPayload(scriptNodes);

    const name =
      h1[0]?.text?.replace(/^My name is\s+/i, '').replace(/!+$/, '').trim() ||
      h1All.find((n) => /^My name is/i.test(n.text || ''))?.text?.replace(/^My name is\s+/i, '').replace(/!+$/, '').trim() ||
      fallbackName ||
      'Unknown';

    const breedText =
      extractValueByLabel(infoLabels, infoValues, 'Breed') ||
      listItems.find((node) => /mix|terrier|retriever|shepherd|poodle|hound|bulldog|spaniel|breed/i.test(node.text || ''))?.text?.trim() ||
      'Mixed Breed';
    const parsedBreed = parseBreed(breedText);
    const breed_primary = truncate(parsedBreed.primary, 100);
    const breed_secondary = parsedBreed.secondary ? truncate(parsedBreed.secondary, 100) : null;

    const sexAgeSummary = [
      extractValueByLabel(infoLabels, infoValues, 'Sex') || '',
      extractValueByLabel(infoLabels, infoValues, 'Age') || '',
    ]
      .filter(Boolean)
      .join(', ');

    const parsedSexAge = parseSexAgeFromSummary(sexAgeSummary);
    const sexAgeLine = `${parsedSexAge.sex} ${parsedSexAge.age}`.trim();

    const gender = parseGender(sexAgeLine);
    const age_group = parseAge(sexAgeLine);
    const size = parseSize(extractValueByLabel(infoLabels, infoValues, 'Size') || breedText);

    const contentHeaderText = contentHeaders.map((node) => (node.text || '').trim().toLowerCase());
    const hasStorySection = contentHeaderText.includes('my story');
    const description =
      extractStoryFromFlight(flightPayload) ||
      extractStoryFromSections(sectionNodes, sectionParagraphNodes) ||
      extractMainStory(sectionParagraphNodes) ||
      extractStoryFromBodyText(bodyText) ||
      null;

    const photoIds = extractPhotoIdsFromFlight(flightPayload);
    const photosFromFlight = photoIds.map((id) => mapPetPhotoIdToUrl(id));
    const heroPhotoUrls = heroImages
      .map((img) => getAttribute(img, 'src'))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter(looksLikeDogPhotoUrl);
    const ogPhotoUrls = ogImages
      .map((meta) => getAttribute(meta, 'content'))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter((value) => value.includes('pet-uploads.adoptapet.com/') || value.includes('media.adoptapet.com/'));

    const photoUrls =
      photosFromFlight.length > 0
        ? [...new Set(photosFromFlight)]
        : [...new Set([...heroPhotoUrls, ...ogPhotoUrls])];

    if (photoUrls.length <= 1) {
      console.log(`[CLOUDFLARE] Skipping ${url} because it has ${photoUrls.length} photo(s)`);
      return null;
    }

    const healthTags = healthNodes
      .map((node) => node.text?.trim() || '')
      .filter(Boolean)
      .map(toCanonicalHealthTag)
      .filter((tag): tag is string => Boolean(tag));

    const rawHealthTags = extractProfileTags(healthTags.join('\\n'));
    const normalizedHealthTags = normalizeRawTags(rawHealthTags);
    const inferredFromBio = inferPreferenceTagsFromText(description);
    // Also infer from full body text as fallback (catches tags in sections not matched by selectors)
    const inferredFromBody = inferPreferenceTagsFromText(bodyText);
    const allInferred = [...new Set([...normalizedHealthTags, ...inferredFromBio, ...inferredFromBody])];
    const tags = filterToPreferenceTags(allInferred);

    const externalId = parseExternalIdFromUrl(url);

    return {
      external_id: externalId,
      name,
      breed_primary,
      breed_secondary,
      age_group,
      size,
      gender,
      color: null,
      description,
      photos: photosToRawDogPhotos(photoUrls),
      tags,
      adoption_url: url,
      intake_date: null,
      slug: null,
      org_id: null,
    };
  } catch (error) {
    if (hasCloudflareRateLimitSignal(error) && process.env.CLOUDFLARE_ABORT_ON_429 === '1') {
      throw new Error('CLOUDFLARE_RATE_LIMIT_ABORT');
    }

    if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < 3) {
      const rawRetryAfter = Number(error.response.headers['retry-after'] || 45);
      const retryAfter = Math.min(Math.max(rawRetryAfter, 30), 120);
      console.warn(`[CLOUDFLARE] Rate limited for profile ${url}. Retry ${attempt + 1}/3 in ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return scrapeDogProfile(url, fallbackName, attempt + 1);
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const firstError =
        (error.response?.data as { errors?: Array<{ message?: string }> } | undefined)?.errors?.[0]?.message ||
        error.message;
      console.error(`[CLOUDFLARE] Error scraping ${url}: status=${status || 'unknown'} message=${firstError}`);
    } else {
      console.error(`[CLOUDFLARE] Error scraping ${url}:`, error);
    }
    return null;
  }
}

async function fetchSearchPage(
  endpoint: string,
  page: number,
  attempt = 0
): Promise<SearchPageResult> {
  const searchUrl = `https://www.adoptapet.com/pet-search?speciesId=1&radius=50&postalCode=78703&city=Austin&state=TX&transport=false&sortOption=Newest&page=${page}`;

  try {
    const response = await axios.post<{
      success: boolean;
      result: ScrapeResultEntry[];
      errors?: unknown[];
    }>(
      endpoint,
      {
        url: searchUrl,
        elements: [
          { selector: 'div[wire\\:initial-data]' },
          { selector: 'a[href*="/pet/"]' },
        ],
        gotoOptions: {
          waitUntil: 'networkidle2',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );

    if (!response.data.success) {
      console.error(`[CLOUDFLARE] Search page ${page} failed:`, response.data.errors);
      return { dogs: [], hadCards: false };
    }

    const cardSelector = response.data.result.find((item) => item.selector === 'div[wire\\:initial-data]');
    const linkSelector = response.data.result.find((item) => item.selector === 'a[href*="/pet/"]');
    const cards = cardSelector?.results || [];
    const links = linkSelector?.results || [];
    const hadCards = cards.length > 0 || links.length > 0;

    const dogsFromWireData = cards
      .map((node) => getAttribute(node, 'wire:initial-data'))
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => parseListingDataFromWireInitialData(decodeHtmlEntities(value)));

    const dogsFromLinks: AdoptapetSearchResult[] = links
      .map((node) => {
        const href = getAttribute(node, 'href');
        if (!href || !href.includes('/pet/')) return null;

        const url = toAbsoluteAdoptapetUrl(href);
        const externalId = parseExternalIdFromUrl(url);
        const lines = (node.text || '').split('\n').map((value) => value.trim()).filter(Boolean);
        const locationLine = lines.find((line) => /,\s*[A-Z]{2}$/i.test(line)) || extractLocationFromPetUrl(url);

        return {
          name: lines[0] || 'Unknown',
          url,
          externalId,
          location: locationLine,
        };
      })
      .filter((dog): dog is AdoptapetSearchResult => Boolean(dog));

    const dogs = dogsFromWireData.length > 0 ? dogsFromWireData : dogsFromLinks;

    const dedupedDogs = [...new Map(dogs.map((dog) => [dog.externalId, dog])).values()];

    const withinRadius: AdoptapetSearchResult[] = [];
    for (const dog of dedupedDogs) {
      if (await isWithinTargetRadius(dog.location)) {
        withinRadius.push(dog);
      }
    }

    console.log(`[CLOUDFLARE] Page ${page}: cards=${cards.length} links=${links.length} parsed=${dedupedDogs.length} local=${withinRadius.length}`);

    return { dogs: withinRadius, hadCards };
  } catch (error) {
    if (hasCloudflareRateLimitSignal(error) && process.env.CLOUDFLARE_ABORT_ON_429 === '1') {
      throw new Error('CLOUDFLARE_RATE_LIMIT_ABORT');
    }

    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const rawRetry = Number(error.response.headers['retry-after'] || 60);
      const retryAfter = Math.max(rawRetry, 60);
      if (attempt >= 4) {
        console.error(`[CLOUDFLARE] Search page ${page} rate limit retries exhausted (${attempt + 1} attempts)`);
        return { dogs: [], hadCards: false };
      }
      console.warn(`[CLOUDFLARE] Search page ${page} rate limited. Waiting ${retryAfter}s (attempt ${attempt + 1}/5)...`);
      await sleep(retryAfter * 1000);
      return fetchSearchPage(endpoint, page, attempt + 1);
    }

    console.error(`[CLOUDFLARE] Error searching page ${page}:`, error);
    return { dogs: [], hadCards: false };
  }
}

async function searchAdoptapetDogs(location: string = 'Austin, TX', limit: number = 50): Promise<AdoptapetSearchResult[]> {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;

  console.log(
    `[CLOUDFLARE] Searching Adopt-a-Pet (${location}) across pages with radius ${TARGET_RADIUS_MILES}mi from ${TARGET_ZIP}...`
  );
  const collected: AdoptapetSearchResult[] = [];
  const maxPages = 25;
  let consecutiveEmptyPages = 0;

  for (let page = 1; page <= maxPages && collected.length < limit; page += 1) {
    let pageResult: SearchPageResult;
    try {
      pageResult = await fetchSearchPage(endpoint, page);
    } catch (err) {
      if (err instanceof Error && err.message === 'CLOUDFLARE_RATE_LIMIT_ABORT') {
        console.warn(`[CLOUDFLARE] Rate limit hit during search — returning ${collected.length} candidates collected so far`);
        break;
      }
      throw err;
    }
    if (!pageResult.hadCards) {
      consecutiveEmptyPages += 1;
      if (consecutiveEmptyPages >= 5) {
        break;
      }
      continue;
    }

    consecutiveEmptyPages = 0;
    const pageDogs = pageResult.dogs;

    for (const dog of pageDogs) {
      if (!collected.some((existing) => existing.externalId === dog.externalId)) {
        collected.push(dog);
        if (collected.length >= limit) break;
      }
    }

    await sleep(withJitter(SEARCH_PAGE_DELAY_MS));
  }

  return collected.slice(0, limit);
}

export async function fetchDogsFromAdoptapet(limit: number = 50): Promise<RawDog[]> {
  console.log('[CLOUDFLARE] Starting Adopt-a-Pet scrape via Cloudflare Browser Rendering...');

  const candidateLimit = Math.max(limit + 5, Math.ceil(limit * 1.5));
  const searchResults = await searchAdoptapetDogs('Austin, TX', candidateLimit);
  
  if (searchResults.length === 0) {
    console.warn('[CLOUDFLARE] No dogs found in search results');
    return [];
  }

  console.log(`[CLOUDFLARE] Found ${searchResults.length} candidate dogs, fetching details...`);

  const dogs: RawDog[] = [];
  
  for (const result of searchResults) {
    if (dogs.length >= limit) {
      break;
    }

    console.log(`[CLOUDFLARE] Scraping ${result.name} from ${result.url}`);
    
    try {
      const dog = await scrapeDogProfile(result.url, result.name);
      if (dog) {
        dogs.push(dog);
        console.log(`[CLOUDFLARE] Successfully scraped ${dog.name} (${dogs.length}/${limit})`);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'CLOUDFLARE_RATE_LIMIT_ABORT') {
        console.warn(`[CLOUDFLARE] Rate limit hit — returning ${dogs.length} dogs collected so far`);
        break;
      }
      throw err;
    }
    
    await sleep(withJitter(PROFILE_DELAY_MS));
  }

  console.log(`[CLOUDFLARE] Scraped ${dogs.length} dogs total`);
  return dogs.slice(0, limit);
}

export async function scrapeSingleDog(url: string): Promise<RawDog | null> {
  return scrapeDogProfile(url);
}
