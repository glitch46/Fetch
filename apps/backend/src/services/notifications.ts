// Push notifications service — sends Expo Push Notifications

import axios from 'axios';
import { supabase } from '../db/client.js';
import { calculateMatchScore } from './matching.js';
import { dbRowToDog } from './dogMapper.js';
import type { Dog, PreferenceKey } from '@fetch/shared';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(message: PushMessage): Promise<void> {
  await axios.post(EXPO_PUSH_URL, {
    to: message.to,
    title: message.title,
    body: message.body,
    data: message.data,
  });
}

export async function sendBatchPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    await axios.post(EXPO_PUSH_URL, batch);
  }
}

/**
 * Send push notifications to users whose preferences match newly synced dogs.
 * Called by cron after sync completes.
 */
export async function sendNewMatchNotifications(newDogIds: string[]): Promise<void> {
  if (newDogIds.length === 0) return;

  try {
    // Fetch the new dogs
    const { data: dogRows, error: dogError } = await supabase
      .from('dogs')
      .select('*')
      .in('id', newDogIds);

    if (dogError || !dogRows || dogRows.length === 0) {
      console.error('[NOTIFICATIONS] Failed to fetch new dogs:', dogError);
      return;
    }

    const dogs = dogRows.map((row) => dbRowToDog(row as Record<string, unknown>));

    // Fetch all users with push tokens and new_matches notifications enabled
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, expo_push_token')
      .eq('notification_new_matches', true)
      .not('expo_push_token', 'is', null);

    if (userError || !users || users.length === 0) return;

    const messages: PushMessage[] = [];

    for (const user of users) {
      // Fetch user preferences
      const { data: prefsRow } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .single();

      const userPreferences = (prefsRow?.preferences || []) as PreferenceKey[];

      // For each new dog, check if it matches this user's preferences
      for (const dog of dogs) {
        const { score } = calculateMatchScore(dog, userPreferences);
        if (score !== null && score > 0) {
          messages.push({
            to: user.expo_push_token,
            title: 'New match alert!',
            body: `🐾 ${dog.name} just arrived and matches your preferences.`,
            data: { dog_id: dog.id },
          });
        }
      }
    }

    if (messages.length > 0) {
      await sendBatchPushNotifications(messages);
      console.log(`[NOTIFICATIONS] Sent ${messages.length} new match notifications`);
    }
  } catch (err) {
    console.error('[NOTIFICATIONS] Error sending new match notifications:', err);
  }
}

/**
 * Send push notifications for urgent dogs (shelter > 21 days, status = adoptable).
 * Called by cron after sync completes.
 */
export async function sendUrgentDogNotifications(): Promise<void> {
  try {
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

    // Find all dogs at shelter > 21 days and still adoptable
    const { data: urgentDogs, error: dogError } = await supabase
      .from('dogs')
      .select('*')
      .eq('status', 'adoptable')
      .lt('published_at', twentyOneDaysAgo);

    if (dogError || !urgentDogs || urgentDogs.length === 0) return;

    // Fetch all users with push tokens and urgent_dogs notifications enabled
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, expo_push_token')
      .eq('notification_urgent_dogs', true)
      .not('expo_push_token', 'is', null);

    if (userError || !users || users.length === 0) return;

    const messages: PushMessage[] = [];

    for (const dog of urgentDogs) {
      const daysAtShelter = Math.floor(
        (Date.now() - new Date(dog.published_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      // For each user, check if they haven't already swiped on this dog
      for (const user of users) {
        const { data: existingSwipe } = await supabase
          .from('swipes')
          .select('id')
          .eq('user_id', user.id)
          .eq('dog_id', dog.id)
          .single();

        // Only notify users who haven't seen/swiped this dog
        if (!existingSwipe) {
          messages.push({
            to: user.expo_push_token,
            title: 'A dog needs your help',
            body: `❤️ ${dog.name} has been at the shelter for ${daysAtShelter} days and needs a home.`,
            data: { dog_id: dog.id },
          });
        }
      }
    }

    if (messages.length > 0) {
      await sendBatchPushNotifications(messages);
      console.log(`[NOTIFICATIONS] Sent ${messages.length} urgent dog notifications`);
    }
  } catch (err) {
    console.error('[NOTIFICATIONS] Error sending urgent dog notifications:', err);
  }
}
