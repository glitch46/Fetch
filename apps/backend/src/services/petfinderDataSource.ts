// Petfinder DataSource — scrapes Petfinder website for AAC (TX514) dogs

import type { DataSource, RawDog } from './datasource.js';
import { scrapePetfinderDogs } from './petfinderScraper.js';

export class PetfinderDataSource implements DataSource {
  name = 'petfinder-scraper';

  async fetchAdoptableDogs(limit?: number, startPage?: number): Promise<RawDog[]> {
    return scrapePetfinderDogs(limit, startPage);
  }
}
