import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

async function main(): Promise<void> {
  if (!account || !token) throw new Error('Missing Cloudflare credentials');

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/scrape`;
  const url = 'https://www.adoptapet.com/pet/47485766-austin-texas-poodle-miniature';
  const selectors = [
    'img',
    '[data-testid*="photo"] img',
    '[data-testid*="gallery"] img',
    '[class*="gallery"] img',
    '[class*="carousel"] img',
    'main img',
    'section img',
    'article img',
  ];

  const res = await axios.post(
    endpoint,
    {
      url,
      elements: selectors.map((selector) => ({ selector })),
      gotoOptions: { waitUntil: 'networkidle2' },
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  );

  const result = res.data.result as Array<{
    selector: string;
    results: Array<{ attributes?: Array<{ name: string; value: string }> }>;
  }>;

  for (const entry of result) {
    const urls = (entry.results || [])
      .map((r) => r.attributes?.find((a) => a.name === 'src')?.value)
      .filter((v): v is string => Boolean(v));
    console.log(`\n${entry.selector} -> ${urls.length}`);
    for (const sample of urls.slice(0, 8)) console.log(`  ${sample}`);
  }
}

main().catch((err) => {
  console.error(err.response?.status || err.message);
  process.exit(1);
});
