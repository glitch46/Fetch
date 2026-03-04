// Dog routes — owned by Data Agent (implementation)
// GET /dogs — paginated list of adoptable dogs with match scores
// GET /dogs/:id — single dog by ID with match score

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';
import { calculateMatchScore } from '../services/matching.js';
import type { Dog, PreferenceKey, DogPhoto, DogAttributes, DogEnvironment } from '@fetch/shared';

// ── Helpers ──────────────────────────

/**
 * Convert a raw DB row into a normalized Dog object.
 * Handles JSON parsing for photos, attributes, and environment.
 */
function dbRowToDog(
  row: Record<string, unknown>,
  matchScore: number | null,
  matchedPreferences: string[]
): Dog {
  // Parse photos — stored as JSONB string in DB
  let photos: DogPhoto[] = [];
  try {
    const raw = typeof row.photos === 'string' ? JSON.parse(row.photos) : row.photos;
    if (Array.isArray(raw)) {
      photos = raw as DogPhoto[];
    }
  } catch {
    photos = [];
  }

  // Parse attributes
  let attributes: DogAttributes = { spayed_neutered: false, house_trained: false, special_needs: false, shots_current: false };
  try {
    const raw = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
    if (raw && typeof raw === 'object') {
      attributes = raw as DogAttributes;
    }
  } catch {
    // keep defaults
  }

  // Parse environment
  let environment: DogEnvironment = { children: null, dogs: null, cats: null };
  try {
    const raw = typeof row.environment === 'string' ? JSON.parse(row.environment) : row.environment;
    if (raw && typeof raw === 'object') {
      environment = raw as DogEnvironment;
    }
  } catch {
    // keep defaults
  }

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
    match_score: matchScore,
    matched_preferences: matchedPreferences,
    prompts: (row.prompts as Dog['prompts']) || null,
    days_in_shelter: (row.days_in_shelter as number) ?? null,
    adoption_url: (row.adoption_url as string) || null,
    foster_url: (row.foster_url as string) || null,
  };
}

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

      // Sort by match score descending (null scores at the end)
      results.sort((a, b) => {
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
