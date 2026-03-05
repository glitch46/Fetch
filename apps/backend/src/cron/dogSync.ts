// Dog sync cron job — owned by Data Agent (implementation)
// Schedules periodic data sync from shelter data sources to PostgreSQL
// Triggers push notifications for new dogs after sync completes

import cron from 'node-cron';
import { syncDogs } from '../services/dogSync.js';
import { sendNewMatchNotifications, sendUrgentDogNotifications } from '../services/notifications.js';

export function startCronJobs() {
  // Run dog sync every 24 hours (at 3 AM daily)
  cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] Starting dog sync...');
    try {
      const newDogIds = await syncDogs();
      console.log(`[CRON] Dog sync completed. ${newDogIds.length} new dogs.`);

      // Send push notifications for newly matched dogs
      if (newDogIds.length > 0) {
        console.log(`[CRON] Sending new match notifications for ${newDogIds.length} dogs...`);
        await sendNewMatchNotifications(newDogIds);
      }

      // Check for urgent/long-stay dogs and notify
      console.log('[CRON] Checking for urgent dog notifications...');
      await sendUrgentDogNotifications();
    } catch (err) {
      console.error('[CRON] Dog sync failed:', err);
    }
  });

  console.log('[CRON] Dog sync job scheduled (every 24 hours)');
}
