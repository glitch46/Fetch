// Script to check existing adoptable dogs and mark adopted ones as unavailable
// Run with: npx tsx src/mark-adopted.ts

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

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkIfAdopted(petfinderUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(petfinderUrl, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'FetchDogSync/1.0 (adoption-check)',
      },
    });
    const text = (typeof response.data === 'string' ? response.data : '').toLowerCase();
    return text.includes('looks like this pet may have been adopted') ||
           text.includes('this pet is no longer available');
  } catch {
    // If we can't reach the page, don't mark as adopted
    return false;
  }
}

async function main() {
  const { data: dogs, error } = await supabase
    .from('dogs')
    .select('id, name, petfinder_url, petfinder_id')
    .eq('status', 'adoptable');

  if (error) {
    console.error('Error fetching dogs:', error);
    process.exit(1);
  }

  if (!dogs || dogs.length === 0) {
    console.log('No adoptable dogs found.');
    return;
  }

  console.log(`Checking ${dogs.length} adoptable dogs against adoptapet.com...`);
  let adoptedCount = 0;
  let stillAvailable = 0;
  let checkFailed = 0;

  for (const dog of dogs) {
    if (!dog.petfinder_url) {
      console.log(`  [SKIP] ${dog.name} - no adoption URL`);
      continue;
    }

    const adopted = await checkIfAdopted(dog.petfinder_url);
    if (adopted) {
      adoptedCount++;
      console.log(`  [ADOPTED] ${dog.name} (${dog.petfinder_id}) -> marking unavailable`);
      const { error: updateError } = await supabase
        .from('dogs')
        .update({ status: 'unavailable' })
        .eq('id', dog.id);
      if (updateError) {
        console.error(`    Error updating ${dog.name}:`, updateError.message);
      }
    } else {
      stillAvailable++;
      console.log(`  [AVAILABLE] ${dog.name} (${dog.petfinder_id})`);
    }

    // Be polite - wait between requests
    await sleep(1500);
  }

  console.log(`\nDone. ${adoptedCount} adopted, ${stillAvailable} still available, ${checkFailed} check failed.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
