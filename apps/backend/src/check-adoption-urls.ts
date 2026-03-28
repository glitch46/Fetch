import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from('dogs')
    .select('id,name,petfinder_url,status')
    .eq('status', 'adoptable');

  if (error) {
    throw new Error(error.message);
  }

  const dogs = data || [];
  let adoptapetCount = 0;
  let nonAdoptapetCount = 0;

  for (const dog of dogs) {
    const url = String(dog.petfinder_url || '');
    if (url.includes('adoptapet.com/pet/')) {
      adoptapetCount += 1;
    } else {
      nonAdoptapetCount += 1;
      console.log(`[NON_ADOPTAPET] ${dog.name}: ${url}`);
    }
  }

  console.log(`adoptable_count=${dogs.length}`);
  console.log(`adoptapet_urls=${adoptapetCount}`);
  console.log(`non_adoptapet_urls=${nonAdoptapetCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
