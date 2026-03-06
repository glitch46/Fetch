// Dog sync cron job — owned by Data Agent (implementation)
// Schedules periodic data sync from shelter data sources to PostgreSQL
// Triggers push notifications for new dogs after sync completes

import cron from 'node-cron';
import { syncDogs } from '../services/dogSync.js';
import { sendNewMatchNotifications, sendUrgentDogNotifications } from '../services/notifications.js';

export function startCronJobs() {
  // Run dog sync every 3 hours and keep running until at least 50 new dogs are added.
  cron.schedule('0 */3 * * *', async () => {
    console.log('[CRON] Starting incremental dog sync (target: 50 new dogs)...');
    try {
      const targetNewDogs = 50;
      let totalNewDogIds: string[] = [];
      let attempts = 0;
      const maxAttempts = 5;

      while (totalNewDogIds.length < targetNewDogs && attempts < maxAttempts) {
        attempts += 1;
        const newDogIds = await syncDogs(50);
        totalNewDogIds = [...totalNewDogIds, ...newDogIds];
        console.log(`[CRON] Attempt ${attempts}: added ${newDogIds.length} dogs (${totalNewDogIds.length}/${targetNewDogs} total)`);

        if (newDogIds.length === 0) {
          console.log('[CRON] No new dogs found on this attempt; stopping retry loop');
          break;
        }
      }

      console.log(`[CRON] Dog sync completed. ${totalNewDogIds.length} new dogs added.`);

      // Send push notifications for newly matched dogs
      if (totalNewDogIds.length > 0) {
        console.log(`[CRON] Sending new match notifications for ${totalNewDogIds.length} dogs...`);
        await sendNewMatchNotifications(totalNewDogIds);
      }

      // Check for urgent/long-stay dogs and notify
      console.log('[CRON] Checking for urgent dog notifications...');
      await sendUrgentDogNotifications();
    } catch (err) {
      console.error('[CRON] Dog sync failed:', err);
    }
  }, { timezone: 'America/Chicago' });

  console.log('[CRON] Dog sync job scheduled (every 3 hours, America/Chicago)');
}
