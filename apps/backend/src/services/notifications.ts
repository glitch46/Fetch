// Push notifications service — owned by Backend Agent (implementation)
// Sends Expo Push Notifications via the Expo Push API

import axios from 'axios';
import { supabase } from '../db/client.js';
import { calculateMatchScore } from './matching.js';
import type { Dog, PreferenceKey, DogPhoto, DogAttributes, DogEnvironment } from '@fetch/shared';

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

  // Expo supports batching up to 100 notifications per request
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    await axios.post(EXPO_PUSH_URL, batch);
  }
}

function dbRowToDog(row: Record<string, unknown>): Dog {
  let photos: DogPhoto[] = [];
  try {
    const raw = typeof row.photos === 'string' ? JSON.parse(row.photos) : row.photos;
    if (Array.isArray(raw)) photos = raw as DogPhoto[];
  } catch { photos = []; }

  let attributes: DogAttributes = { spayed_neutered: false, house_trained: false, special_needs: false, shots_current: false };
  try {
    const raw = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
    if (raw && typeof raw === 'object') attributes = raw as DogAttributes;
  } catch { /* keep defaults */ }

  let environment: DogEnvironment = { children: null, dogs: null, cats: null };
  try {
    const raw = typeof row.environment === 'string' ? JSON.parse(row.environment) : row.environment;
    if (raw && typeof raw === 'object') environment = raw as DogEnvironment;
  } catch { /* keep defaults */ }

  return {
    id: row.id as string,
    petfinder_id: row.petfinder_id as string,
    name: row.name as string,
    breed_primary: (row.breed_primary as string) || null,
    breed_secondary: (row.breed_secondary as string) || null,
    age: row.age as Dog['age'],
    size: row.size as Dog['size'],
    gender: row.gender as Dog['gender'],
    description: (row.description as string) || null,
    photos,
    tags: (row.tags as string[]) || [],
    attributes,
    environment,
    petfinder_url: (row.petfinder_url as string) || '',
    organization_id: (row.organization_id as string) || 'TX514',
    status: row.status as Dog['status'],
    published_at: (row.published_at as string) || null,
    match_score: null,
    matched_preferences: [],
    prompts: (row.prompts as Dog['prompts']) || null,
    days_in_shelter: (row.days_in_shelter as number) ?? null,
    adoption_url: (row.adoption_url as string) || null,
    foster_url: (row.foster_url as string) || null,
  };
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
