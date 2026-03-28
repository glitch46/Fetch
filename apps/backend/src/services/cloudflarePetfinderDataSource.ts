// Cloudflare Adopt-a-Pet DataSource
// Uses Cloudflare Browser Rendering API to scrape Adopt-a-Pet listings

import type { DataSource, RawDog } from './datasource.js';
import { fetchDogsFromAdoptapet } from './cloudflareScraper.js';

export class CloudflarePetfinderDataSource implements DataSource {
  name = 'cloudflare-adoptapet';

  async fetchAdoptableDogs(limit?: number, _startPage?: number): Promise<RawDog[]> {
    const dogs = await fetchDogsFromAdoptapet(limit || 50);
    console.log(`[CLOUDFLARE_DATASOURCE] Fetched ${dogs.length} dogs from Adopt-a-Pet via Cloudflare`);
    return dogs;
  }
}
