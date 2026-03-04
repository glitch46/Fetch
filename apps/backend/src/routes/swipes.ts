// Swipes routes — owned by Backend Agent (implementation)
// Endpoints for recording swipes and retrieving liked dogs

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';
import type { Dog, PreferenceKey, DogPhoto, DogAttributes, DogEnvironment } from '@fetch/shared';
import { calculateMatchScore } from '../services/matching.js';

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

export async function swipesRoutes(fastify: FastifyInstance) {
  /**
   * POST /swipes — record a swipe
   * Body: { dog_id: string, direction: 'left' | 'right' }
   * Upserts to handle duplicate swipes gracefully (returns 200 not 409).
   * If direction is 'right': returns matched: true so UI can trigger match flow.
   */
  fastify.post<{
    Body: { dog_id: string; direction: 'left' | 'right' };
  }>('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { dog_id, direction } = request.body || {};

      if (!dog_id || typeof dog_id !== 'string') {
        return reply.status(400).send({
          data: null,
          error: { message: 'dog_id is required', code: 'VALIDATION_ERROR' },
        });
      }

      if (direction !== 'left' && direction !== 'right') {
        return reply.status(400).send({
          data: null,
          error: { message: 'direction must be "left" or "right"', code: 'VALIDATION_ERROR' },
        });
      }

      // Verify the dog exists
      const { data: dogRow, error: dogError } = await supabase
        .from('dogs')
        .select('*')
        .eq('id', dog_id)
        .single();

      if (dogError || !dogRow) {
        return reply.status(404).send({
          data: null,
          error: { message: 'Dog not found', code: 'NOT_FOUND' },
        });
      }

      // Upsert the swipe (handles duplicates gracefully)
      const { error: swipeError } = await supabase
        .from('swipes')
        .upsert(
          { user_id: request.userId, dog_id, direction },
          { onConflict: 'user_id,dog_id' }
        );

      if (swipeError) {
        request.log.error({ err: swipeError }, 'Failed to record swipe');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to record swipe', code: 'DB_ERROR' },
        });
      }

      const dog = dbRowToDog(dogRow as Record<string, unknown>);

      return reply.status(200).send({
        data: {
          matched: direction === 'right',
          dog,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error recording swipe');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * GET /swipes/liked — returns all right-swiped dogs for current user
   * Includes dogs marked 'unavailable' (with status flag so mobile can show correct state).
   * Sorted by swipe created_at DESC.
   */
  fastify.get('/liked', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      // Get all right-swiped dog IDs, sorted by swipe date DESC
      const { data: swipes, error: swipeError } = await supabase
        .from('swipes')
        .select('dog_id, created_at')
        .eq('user_id', request.userId)
        .eq('direction', 'right')
        .order('created_at', { ascending: false });

      if (swipeError) {
        request.log.error({ err: swipeError }, 'Failed to fetch swipes');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to fetch liked dogs', code: 'DB_ERROR' },
        });
      }

      if (!swipes || swipes.length === 0) {
        return reply.status(200).send({ data: [], error: null });
      }

      const dogIds = swipes.map((s) => s.dog_id);

      // Fetch all liked dogs (including unavailable ones)
      const { data: dogRows, error: dogError } = await supabase
        .from('dogs')
        .select('*')
        .in('id', dogIds);

      if (dogError) {
        request.log.error({ err: dogError }, 'Failed to fetch dogs');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to fetch liked dogs', code: 'DB_ERROR' },
        });
      }

      // Get user preferences for match scoring
      const { data: prefsRow } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', request.userId)
        .single();

      const userPreferences = (prefsRow?.preferences || []) as PreferenceKey[];

      // Build a map for ordering by swipe date
      const dogMap = new Map<string, Record<string, unknown>>();
      for (const row of dogRows || []) {
        dogMap.set(row.id, row as Record<string, unknown>);
      }

      // Return dogs in swipe order (most recent first)
      const dogs: Dog[] = [];
      for (const swipe of swipes) {
        const row = dogMap.get(swipe.dog_id);
        if (!row) continue;

        const dog = dbRowToDog(row);
        const { score, matched } = calculateMatchScore(dog, userPreferences);
        dogs.push({
          ...dog,
          match_score: score,
          matched_preferences: matched,
        });
      }

      return reply.status(200).send({ data: dogs, error: null });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error fetching liked dogs');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });
}
