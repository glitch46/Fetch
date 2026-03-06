// Dog sync cron job — owned by Data Agent (implementation)
// Schedules periodic data sync from shelter data sources to PostgreSQL
// Triggers push notifications for new dogs after sync completes

import cron from 'node-cron';
import { syncDogs } from '../services/dogSync.js';
import { sendNewMatchNotifications, sendUrgentDogNotifications } from '../services/notifications.js';

export function startCronJobs() {
  // Run dog sync every 2 hours and keep running until at least 50 new dogs are added.
  cron.schedule('0 */2 * * *', async () => {
    console.log('[CRON] Starting incremental dog sync (target: 50 new dogs)...');
    try {
      const targetNewDogs = 50;
      let totalNewDogIds: string[] = [];
      let attempts = 0;

      while (totalNewDogIds.length < targetNewDogs) {
        attempts += 1;
        const startPage = (attempts - 1) * 9 + 1;
        const newDogIds = await syncDogs(50, startPage);
        totalNewDogIds = [...totalNewDogIds, ...newDogIds];
        console.log(`[CRON] Attempt ${attempts} (startPage ${startPage}): added ${newDogIds.length} dogs (${totalNewDogIds.length}/${targetNewDogs} total)`);

        if (newDogIds.length === 0) {
          console.log('[CRON] No new dogs on this page window; continuing to next window');
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

  console.log('[CRON] Dog sync job scheduled (every 2 hours, America/Chicago)');
}
