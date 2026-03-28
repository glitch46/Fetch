import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type DogRow = {
  id: string;
  name: string;
  petfinder_url: string | null;
  status: string;
};

async function checkUrl(url: string): Promise<boolean> {
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FetchValidator/1.0)',
      },
    });

    if (res.status >= 200 && res.status < 400) {
      const body = typeof res.data === 'string' ? res.data.toLowerCase() : '';
      if (
        body.includes('no longer available') ||
        body.includes('this pet is no longer available') ||
        body.includes('not found')
      ) {
        return false;
      }
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from('dogs')
    .select('id,name,petfinder_url,status')
    .eq('status', 'adoptable');

  if (error) {
    throw new Error(`Failed to load dogs: ${error.message}`);
  }

  const dogs = (data || []) as DogRow[];
  console.log(`[VALIDATE] Checking ${dogs.length} adoptable dogs...`);

  let valid = 0;
  let invalid = 0;

  for (const dog of dogs) {
    const url = dog.petfinder_url;
    if (!url) {
      invalid += 1;
      await supabase.from('dogs').update({ status: 'unavailable' }).eq('id', dog.id);
      console.log(`[INVALID] ${dog.name} (missing URL)`);
      continue;
    }

    const isValid = await checkUrl(url);
    if (isValid) {
      valid += 1;
    } else {
      invalid += 1;
      await supabase.from('dogs').update({ status: 'unavailable' }).eq('id', dog.id);
      console.log(`[INVALID] ${dog.name} -> ${url}`);
    }
  }

  console.log(`[VALIDATE] Complete. valid=${valid} invalid=${invalid}`);
}

main().catch((err) => {
  console.error('[VALIDATE] Failed:', err);
  process.exit(1);
});
