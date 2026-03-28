import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

interface CardResult {
  text?: string;
  attributes?: Array<{ name: string; value: string }>;
}

async function probePage(url: string): Promise<void> {
  if (!account || !token) throw new Error('Missing credentials');

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/scrape`;

  try {
    const response = await axios.post(
      endpoint,
      {
        url,
        elements: [{ selector: '[data-testid="pet-card-link"]' }],
        gotoOptions: { waitUntil: 'networkidle2' },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    );

    const cards: CardResult[] =
      (response.data?.result || []).find(
        (x: { selector: string }) => x.selector === '[data-testid="pet-card-link"]'
      )?.results || [];

    console.log(`\n${url}`);
    console.log(`  cards: ${cards.length}`);

    const locationCounts = new Map<string, number>();
    for (const card of cards) {
      const lines = (card.text || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
      const loc = lines.find((line: string) => /,\s*[A-Z]{2}$/i.test(line)) || 'unknown';
      locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);
    }

    for (const [loc, count] of locationCounts) {
      console.log(`  ${loc}: ${count}`);
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.log(`\n${url}`);
      console.log(`  ERR ${error.response?.status} retry-after=${error.response?.headers?.['retry-after'] || 'none'}`);
    } else {
      console.log(`\n${url}`);
      console.log(`  ERR ${String(error)}`);
    }
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const urls = [
    'https://www.adoptapet.com/dog-adoption/texas/austin',
    'https://www.adoptapet.com/dog-adoption/texas/austin?page=2',
    'https://www.adoptapet.com/s/adopt-a-dog/austin-tx',
    'https://www.adoptapet.com/dog-adoption?location=Austin%2C+TX',
    'https://www.adoptapet.com/dog-adoption?location=78721',
    'https://www.adoptapet.com/dog-adoption?location=78721&radius=50',
  ];

  for (const url of urls) {
    await probePage(url);
    await sleep(12000);
  }
}

main().catch(console.error);
