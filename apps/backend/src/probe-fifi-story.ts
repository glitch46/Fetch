import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
}

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    throw new Error('Missing Cloudflare credentials');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/scrape`;
  const url = 'https://www.adoptapet.com/pet/47564248-wimberley-texas-chihuahua-mix';

  const response = await axios.post(
    endpoint,
    {
      url,
      elements: [
        { selector: '.pdp-grid-content section' },
        { selector: '.pdp-grid-content section p' },
        { selector: '.pdp-grid-content h3' },
        { selector: 'script' },
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

  for (const entry of response.data.result as Array<{ selector: string; results: Array<{ text?: string; html?: string }> }>) {
    console.log(`\nSELECTOR ${entry.selector} COUNT ${entry.results.length}`);
    for (const item of entry.results.slice(0, 6)) {
      const text = (item.text || '').replace(/\s+/g, ' ').trim();
      if (text) {
        console.log(`- ${text.slice(0, 300)}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err.response?.status || err.message);
  console.error(err.response?.data || '');
  process.exit(1);
});
