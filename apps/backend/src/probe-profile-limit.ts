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
  const url = 'https://www.adoptapet.com/pet/46043639-highland-village-texas-mixed-breed-medium-mix';

  for (let i = 1; i <= 8; i += 1) {
    try {
      const response = await axios.post(
        endpoint,
        {
          url,
          elements: [{ selector: 'h1' }, { selector: 'img' }],
          gotoOptions: { waitUntil: 'networkidle2' },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 90000,
        }
      );

      const h1 =
        (response.data?.result || []).find(
          (x: { selector: string; results?: Array<{ text?: string }> }) => x.selector === 'h1'
        )?.results?.[0]?.text || '';
      console.log(`profile${i}: 200 h1=${h1.trim().slice(0, 50)}`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 'ERR';
        const retryAfter = error.response?.headers?.['retry-after'] || 'none';
        console.log(`profile${i}: ${status} retry-after=${retryAfter}`);
        if (error.response?.data) {
          console.log(JSON.stringify(error.response.data));
        }
      } else {
        console.log(`profile${i}: ERR ${String(error)}`);
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
