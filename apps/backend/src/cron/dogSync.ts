// Dog sync cron job — owned by Data Agent (implementation)
// Schedules periodic data sync from Austin Paws Portal API to PostgreSQL
// Runs every 12 hours: syncs new dogs and verifies existing dogs are still active

import cron from 'node-cron';
import { syncDogs, verifyExistingDogs } from '../services/dogSync.js';
import { sendNewMatchNotifications, sendUrgentDogNotifications } from '../services/notifications.js';

let syncInProgress = false;

export function startCronJobs() {
  // Run dog sync every 12 hours (at midnight and noon, America/Chicago)
  cron.schedule('0 0,12 * * *', async () => {
    if (syncInProgress) {
      console.warn('[CRON] Previous sync is still running; skipping this trigger');
      return;
    }

    syncInProgress = true;
    console.log('[CRON] Starting dog sync cycle...');

    try {
      // Step 1: Sync new dogs from Austin Paws Portal
      const newDogIds = await syncDogs();
      console.log(`[CRON] Dog sync completed. ${newDogIds.length} new dogs added.`);

      // Step 2: Verify existing dogs are still active/available
      const markedUnavailable = await verifyExistingDogs();
      console.log(`[CRON] Verification completed. ${markedUnavailable} dogs marked unavailable.`);

      // Step 3: Send push notifications for newly matched dogs
      if (newDogIds.length > 0) {
        console.log(`[CRON] Sending new match notifications for ${newDogIds.length} dogs...`);
        await sendNewMatchNotifications(newDogIds);
      }

      // Step 4: Check for urgent/long-stay dogs and notify
      console.log('[CRON] Checking for urgent dog notifications...');
      await sendUrgentDogNotifications();
    } catch (err) {
      console.error('[CRON] Dog sync cycle failed:', err);
    } finally {
      syncInProgress = false;
    }
  }, { timezone: 'America/Chicago' });

  console.log('[CRON] Dog sync job scheduled (every 12 hours at midnight and noon, America/Chicago)');
}
