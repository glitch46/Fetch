import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

async function run(): Promise<void> {
  if (!account || !token) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/scrape`;
  const payload = {
    url: 'https://www.adoptapet.com/dog-adoption/texas/austin?page=1',
    elements: [{ selector: '[data-testid="pet-card-link"]' }],
    gotoOptions: { waitUntil: 'networkidle2' as const },
  };

  for (let i = 1; i <= 4; i += 1) {
    try {
      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      });

      const cards =
        (response.data?.result || []).find(
          (x: { selector: string; results?: unknown[] }) => x.selector === '[data-testid="pet-card-link"]'
        )?.results?.length || 0;

      const firstCard = (response.data?.result || []).find(
        (x: { selector: string; results?: Array<{ text?: string }> }) => x.selector === '[data-testid="pet-card-link"]'
      )?.results?.[0];
      const lines = (firstCard?.text || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);
      const location = lines[lines.length - 1] || 'n/a';

      console.log(`req${i}: 200 cards=${cards} first_location=${location}`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const retryAfter = error.response?.headers?.['retry-after'];
        console.log(
          `req${i}: ${error.response?.status || 'ERR'} retry-after=${retryAfter || 'none'}`
        );
        if (error.response?.data) {
          console.log(JSON.stringify(error.response.data));
        }
      } else {
        console.log(`req${i}: ERR ${String(error)}`);
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
