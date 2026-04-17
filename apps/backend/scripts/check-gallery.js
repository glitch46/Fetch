// Check specific dogs for gallery_images
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.AUSTIN_PAWS_BASE_URL || 'https://austinpawsportal.com';
const API_KEY = process.env.AUSTIN_PAWS_API_KEY || '';

async function check() {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    maxRedirects: 5,
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response && [301, 302, 307, 308].includes(error.response.status) && error.response.headers.location) {
        return client.get(error.response.headers.location);
      }
      throw error;
    }
  );

  // Search for Fluffy and Olaf by animal_id
  const response = await client.get('/api/external/dogs?limit=1000');
  const dogs = response.data.dogs;

  const fluffy = dogs.find(d => d.animal_id === '23308');
  const olaf = dogs.find(d => d.animal_id === '23865');

  if (fluffy) {
    console.log('Fluffy gallery_images:', fluffy.gallery_images ? fluffy.gallery_images.length : 'null');
    if (fluffy.gallery_images && fluffy.gallery_images.length > 0) {
      console.log('  Types:', fluffy.gallery_images.map(i => i.type_key).join(', '));
    }
  } else {
    console.log('Fluffy (23308) not found in API response');
  }

  if (olaf) {
    console.log('Olaf gallery_images:', olaf.gallery_images ? olaf.gallery_images.length : 'null');
    if (olaf.gallery_images && olaf.gallery_images.length > 0) {
      console.log('  Types:', olaf.gallery_images.map(i => i.type_key).join(', '));
    }
  } else {
    console.log('Olaf (23865) not found in API response');
  }

  // Also check: how many dogs HAVE gallery_images?
  const withGallery = dogs.filter(d => d.gallery_images && d.gallery_images.length > 0);
  const withVideos = dogs.filter(d => d.gallery_images && d.gallery_images.some(i => i.type_key === 'VIDEO'));
  console.log('\nTotal dogs:', dogs.length);
  console.log('With gallery_images:', withGallery.length);
  console.log('With videos:', withVideos.length);
}

check().catch(console.error);