// Dog routes — paginated list with match scores and single dog lookup

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';
import { calculateMatchScore } from '../services/matching.js';
import { dbRowToDog } from '../services/dogMapper.js';
import type { Dog, PreferenceKey } from '@fetch/shared';

/**
 * Fetch user preferences from the database.
 */
async function getUserPreferences(userId: string): Promise<PreferenceKey[]> {
  const { data } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .single();

  return (data?.preferences || []) as PreferenceKey[];
}

// ── Routes ──────────────────────────

export async function dogsRoutes(fastify: FastifyInstance) {
  /**
   * GET /dogs
   * Returns paginated adoptable dogs, sorted by match score (highest first).
   * Excludes dogs the authenticated user has already swiped on.
   *
   * Query params:
   *   page (default 1)
   *   limit (default 20, max 50)
   */
  fastify.get<{
    Querystring: { page?: string; limit?: string };
  }>('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const page = Math.max(1, parseInt(request.query.page || '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(request.query.limit || '20', 10)));
      const offset = (page - 1) * limit;

      // Get user preferences for match scoring
      const userPreferences = await getUserPreferences(request.userId);

      // Get IDs of dogs the user has already swiped on
      const { data: swipedRows } = await supabase
        .from('swipes')
        .select('dog_id')
        .eq('user_id', request.userId);

      const swipedDogIds = new Set((swipedRows || []).map((r) => r.dog_id));

      // Fetch adoptable dogs
      const { data: dogs, error, count } = await supabase
        .from('dogs')
        .select('*', { count: 'exact' })
        .eq('status', 'adoptable')
        .order('published_at', { ascending: true }) // Longest-waiting dogs first
        .range(offset, offset + limit - 1);

      if (error) {
        request.log.error({ err: error }, 'Failed to fetch dogs');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to fetch dogs', code: 'DB_ERROR' },
        });
      }

      // Filter out already-swiped dogs and calculate match scores
      const results: Dog[] = [];
      for (const row of dogs || []) {
        if (swipedDogIds.has(row.id)) continue;

        const dog = dbRowToDog(row, null, []);
        const { score, matched } = calculateMatchScore(dog, userPreferences);
        results.push({
          ...dog,
          match_score: score,
          matched_preferences: matched,
        });
      }

      // Sort: dogs with multiple photos first, then by match score descending.
      // This ensures the swipe deck leads with richer, more engaging profiles.
      results.sort((a, b) => {
        const aPhotos = a.photos?.length || 0;
        const bPhotos = b.photos?.length || 0;
        const aMulti = aPhotos > 1 ? 1 : 0;
        const bMulti = bPhotos > 1 ? 1 : 0;

        // Primary: multi-photo dogs first
        if (aMulti !== bMulti) return bMulti - aMulti;

        // Within multi-photo tier, more photos first
        if (aMulti && bMulti && aPhotos !== bPhotos) return bPhotos - aPhotos;

        // Secondary: match score descending (null scores at the end)
        if (a.match_score === null && b.match_score === null) return 0;
        if (a.match_score === null) return 1;
        if (b.match_score === null) return -1;
        return b.match_score - a.match_score;
      });

      const total = count || 0;

      return reply.status(200).send({
        data: {
          items: results,
          page,
          limit,
          total,
          has_more: offset + limit < total,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error fetching dogs');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * GET /dogs/:id
   * Returns a single dog by UUID, including match score for the authenticated user.
   */
  fastify.get<{
    Params: { id: string };
  }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const { data: row, error } = await supabase
        .from('dogs')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !row) {
        return reply.status(404).send({
          data: null,
          error: { message: 'Dog not found', code: 'NOT_FOUND' },
        });
      }

      // Get user preferences for match scoring
      const userPreferences = await getUserPreferences(request.userId);

      const dog = dbRowToDog(row, null, []);
      const { score, matched } = calculateMatchScore(dog, userPreferences);

      return reply.status(200).send({
        data: {
          ...dog,
          match_score: score,
          matched_preferences: matched,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error fetching dog');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });
}
