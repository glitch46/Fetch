import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
}

async function main(): Promise<void> {
  const limitArg = process.argv[2];
  const limit = limitArg ? Number(limitArg) : 10;

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid limit: ${limitArg}`);
  }

  const { fetchDogsFromAdoptapet } = await import('./services/cloudflareScraper.js');

  console.log(`[PROBE] Starting Adopt-a-Pet scrape test with limit=${limit}`);
  const dogs = await fetchDogsFromAdoptapet(limit);
  console.log(`[PROBE] Scraped ${dogs.length} dogs`);

  const suspiciousPhotoPattern = /logo|badge|icon|sponsor|privacy|tooltip|hamburger|rehome/i;

  dogs.forEach((dog, index) => {
    const photoUrls = dog.photos.map((photo) => photo.full);
    const suspiciousPhotos = photoUrls.filter((url) => suspiciousPhotoPattern.test(url));

    console.log(`\n[Dog ${index + 1}] ${dog.name} (${dog.external_id})`);
    console.log(`  URL: ${dog.adoption_url}`);
    console.log(`  Location-filtered source entry included`);
    console.log(`  Photos: ${photoUrls.length}`);
    photoUrls.slice(0, 6).forEach((url) => {
      console.log(`    - ${url}`);
    });

    if (suspiciousPhotos.length > 0) {
      console.log(`  WARNING suspicious photos: ${suspiciousPhotos.length}`);
      suspiciousPhotos.forEach((url) => console.log(`    ! ${url}`));
    }
  });

  const dogsMissingPhotos = dogs.filter((dog) => dog.photos.length === 0).length;
  const dogsWithSuspiciousPhotos = dogs.filter((dog) =>
    dog.photos.some((photo) => suspiciousPhotoPattern.test(photo.full))
  ).length;

  console.log('\n[PROBE] Summary');
  console.log(`  Total dogs: ${dogs.length}`);
  console.log(`  Dogs missing photos: ${dogsMissingPhotos}`);
  console.log(`  Dogs with suspicious photos: ${dogsWithSuspiciousPhotos}`);
}

main().catch((err) => {
  console.error('[PROBE] Failed:', err?.message || err);
  process.exit(1);
});
