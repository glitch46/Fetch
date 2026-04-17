require('dotenv').config();

async function main() {
  // Wait for server to be ready
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:3000/health');
      if (res.ok) {
        console.log('Server is ready');
        break;
      }
    } catch (e) {
      // not ready yet
    }
    console.log(`Waiting for server... (${i + 1}/20)`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Trigger sync
  console.log('Triggering full sync...');
  const syncRes = await fetch('http://localhost:3000/sync');
  const syncBody = await syncRes.json();
  console.log('Sync result:', JSON.stringify(syncBody, null, 2));

  // Verify existing dogs
  console.log('\nDone! Checking DB for photo/video counts...');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: dogs, error } = await supabase
    .from('dogs')
    .select('name, photos, videos, status')
    .eq('status', 'adoptable');

  if (error) {
    console.log('DB error:', error.message);
    return;
  }

  const total = dogs.length;
  const multiPhoto = dogs.filter(d => d.photos && d.photos.length > 1).length;
  const withVideos = dogs.filter(d => d.videos && d.videos.length > 0).length;
  const unavailable = (await supabase.from('dogs').select('id').eq('status', 'unavailable')).data?.length || 0;

  console.log(`Total adoptable dogs: ${total}`);
  console.log(`Dogs with multiple photos: ${multiPhoto}`);
  console.log(`Dogs with videos: ${withVideos}`);
  console.log(`Dogs marked unavailable: ${unavailable}`);
}

main().catch(console.error);