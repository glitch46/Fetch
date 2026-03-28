import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDogs() {
  const { data: adoptable, error: err1 } = await supabase
    .from('dogs')
    .select('id, name, photos, tags, description, petfinder_url')
    .eq('status', 'adoptable')
    .order('created_at', { ascending: false });

  if (err1) {
    console.error('Error:', err1);
    return;
  }

  console.log('=== ADOPTABLE DOGS ===');
  console.log('Total count:', adoptable?.length || 0);
  console.log('');
  
  // Show summary of recent dogs
  console.log('Most recent 15 dogs:');
  adoptable?.slice(0, 15).forEach((dog: any) => {
    const photoCount = Array.isArray(dog.photos) ? dog.photos.length : 0;
    const tagCount = Array.isArray(dog.tags) ? dog.tags.length : 0;
    const hasDescription = dog.description && dog.description.length > 20;
    console.log(`${dog.name}: ${photoCount} photos, ${tagCount} tags, story: ${hasDescription ? 'YES' : 'NO'}`);
  });

  // Check for quality issues
  console.log('\n=== QUALITY CHECK ===');
  const lowPhoto = adoptable?.filter((d: any) => !Array.isArray(d.photos) || d.photos.length <= 1);
  const noTags = adoptable?.filter((d: any) => !Array.isArray(d.tags) || d.tags.length === 0);
  const noStory = adoptable?.filter((d: any) => !d.description || d.description.length < 20);

  console.log(`Dogs with ≤1 photo: ${lowPhoto?.length || 0}`);
  console.log(`Dogs with no tags: ${noTags?.length || 0}`);
  console.log(`Dogs with no story: ${noStory?.length || 0}`);

  // Sample a few adoption URLs to check if they're still valid
  if (adoptable && adoptable.length > 0) {
    console.log('\n=== SAMPLE ADOPTION URLS ===');
    adoptable.slice(0, 5).forEach((dog: any) => {
      console.log(`${dog.name}: ${dog.petfinder_url}`);
    });
  }
}

checkDogs().catch(console.error);
