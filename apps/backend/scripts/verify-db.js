require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  const { data: adoptable } = await supabase.from('dogs').select('name, photos, videos, status').eq('status', 'adoptable');
  const { data: unavailable } = await supabase.from('dogs').select('id').eq('status', 'unavailable');

  const total = adoptable.length;
  const multiPhoto = adoptable.filter(d => d.photos && d.photos.length > 1).length;
  const withVideos = adoptable.filter(d => d.videos && d.videos.length > 0).length;
  const singlePhoto = adoptable.filter(d => d.photos && d.photos.length === 1).length;
  const zeroPhoto = adoptable.filter(d => !d.photos || d.photos.length === 0).length;

  console.log('=== DATABASE VERIFICATION ===');
  console.log('Adoptable dogs:', total);
  console.log('Unavailable dogs:', unavailable.length);
  console.log('Multi-photo dogs:', multiPhoto);
  console.log('Single-photo dogs:', singlePhoto);
  console.log('Zero-photo dogs:', zeroPhoto);
  console.log('Dogs with videos:', withVideos);
  console.log('');

  const { data: special } = await supabase.from('dogs').select('name, external_id, photos, videos').or('name.ilike.%Fluffy%,name.ilike.%Olaf%');
  special.forEach(d => {
    console.log(d.name + ' (ext:' + d.external_id + '): ' + d.photos.length + ' photos, ' + d.videos.length + ' videos');
  });
})();