// Temporary script to trigger a manual sync
// Run with: npx tsx src/manual-sync.ts

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load env BEFORE any dynamic imports that read process.env
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

console.log('[SYNC] Starting manual sync...');
console.log('[SYNC] SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('[SYNC] RESCUEGROUPS_API_KEY:', process.env.RESCUEGROUPS_API_KEY ? 'SET' : 'MISSING');

async function main() {
  // Dynamic import so db/client.ts sees the env vars
  const { syncDogs } = await import('./services/dogSync.js');

  const limit = parseInt(process.env.SYNC_LIMIT || '0', 10) || undefined;
  if (limit) console.log(`[SYNC] Limiting to ${limit} dogs`);

  try {
    const newIds = await syncDogs(limit);
    console.log(`[SYNC] Complete! ${newIds.length} new dogs.`);
    if (newIds.length > 0) {
      console.log('[SYNC] New IDs:', newIds.slice(0, 5).join(', '), newIds.length > 5 ? '...' : '');
    }
  } catch (err) {
    console.error('[SYNC] Failed:', err);
  }
  process.exit(0);
}

main();
