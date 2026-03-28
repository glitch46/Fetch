import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

async function main() {
  if (!account || !token) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/scrape`;
  const url = 'https://adopt.adopets.com/shelter/austin-animal-center';

  const response = await axios.post(
    endpoint,
    {
      url,
      elements: [
        { selector: '[data-testid="pet-card"]' },
        { selector: 'a[href*="/pet/"]' },
        { selector: 'h1' },
      ],
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

  const result = response.data.result as Array<{ selector: string; results?: Array<{ text?: string; attributes?: Array<{ name: string; value: string }> }> }>;
  const cards = result.find((x) => x.selector === '[data-testid="pet-card"]')?.results || [];
  const links = result.find((x) => x.selector === 'a[href*="/pet/"]')?.results || [];
  const h1 = result.find((x) => x.selector === 'h1')?.results?.[0]?.text || '';
  const sample = links[0]?.attributes?.find((a) => a.name === 'href')?.value || null;

  console.log(JSON.stringify({ cards: cards.length, links: links.length, h1: h1.trim(), sample }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.status || err.message);
  console.error(err.response?.data || '');
  process.exit(1);
});
