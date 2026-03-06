// Manual sync runner that repeats limited syncs until a new-dog target is met.
// Run with: npx tsx src/manual-sync-until-target.ts

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log('[ENV] Loaded from:', envPath);
} else {
  console.error('[ENV] No .env found!');
  process.exit(1);
}

async function main() {
  const { syncDogs } = await import('./services/dogSync.js');

  const perRunLimit = parseInt(process.env.SYNC_LIMIT || '50', 10) || 50;
  const targetNewDogs = parseInt(process.env.SYNC_TARGET_NEW_DOGS || '50', 10) || 50;
  const maxAttempts = parseInt(process.env.SYNC_MAX_ATTEMPTS || '10', 10) || 10;

  console.log(`[SYNC] Starting repeated syncs (limit=${perRunLimit}, target=${targetNewDogs}, maxAttempts=${maxAttempts})`);

  let totalAdded = 0;
  let attempts = 0;

  while (totalAdded < targetNewDogs && attempts < maxAttempts) {
    attempts += 1;
    console.log(`[SYNC] Attempt ${attempts}...`);

    const newIds = await syncDogs(perRunLimit);
    totalAdded += newIds.length;

    console.log(`[SYNC] Attempt ${attempts} added ${newIds.length}; total added ${totalAdded}/${targetNewDogs}`);

    if (newIds.length === 0) {
      console.log('[SYNC] No new dogs added this attempt; stopping to avoid redundant retries');
      break;
    }
  }

  console.log(`[SYNC] Finished: ${totalAdded} new dogs added across ${attempts} attempts`);
}

main().catch((err) => {
  console.error('[SYNC] Failed:', err);
  process.exit(1);
});
