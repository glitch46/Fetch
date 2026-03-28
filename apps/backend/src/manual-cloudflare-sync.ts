// Manual sync script for testing Cloudflare Petfinder scraper
// Run with: npx tsx src/manual-cloudflare-sync.ts

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env from monorepo root FIRST before any other imports
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log('[MANUAL SYNC] Loaded .env from:', envPath);
} else {
  console.error('[MANUAL SYNC] No .env file found. Checked:', candidates.join(', '));
  process.exit(1);
}

// Validate required env vars
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[MANUAL SYNC] ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  console.error('[MANUAL SYNC] ERROR: Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  console.error('[MANUAL SYNC] Add these to your .env file:');
  console.error('[MANUAL SYNC]   CLOUDFLARE_ACCOUNT_ID=your_account_id');
  console.error('[MANUAL SYNC]   CLOUDFLARE_API_TOKEN=your_api_token');
  process.exit(1);
}

// Now dynamically import the modules that depend on env vars
async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : 10;

  // Allow CLOUDFLARE_ABORT_ON_429 to be set via env or CLI flag
  // When not set, the scraper will retry on 429s instead of aborting
  if (process.argv.includes('--abort-on-429')) {
    process.env.CLOUDFLARE_ABORT_ON_429 = '1';
  }
  
  console.log(`[MANUAL SYNC] Starting Cloudflare Adopt-a-Pet sync (limit: ${limit})...`);
  
  const { syncDogs } = await import('./services/dogSync.js');

  try {
    const newDogIds = await syncDogs(limit);
    console.log(`[MANUAL SYNC] Complete! Added ${newDogIds.length} new dogs.`);
    process.exit(0);
  } catch (err) {
    console.error('[MANUAL SYNC] Failed:', err);
    process.exit(1);
  }
}

main();
