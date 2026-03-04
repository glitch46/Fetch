// Matches routes — owned by Backend Agent (implementation)
// Endpoints for recording adopt/foster actions and returning redirect URLs

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';

const FOSTER_URL = 'https://www.austintexas.gov/page/foster-care-application';

export async function matchesRoutes(fastify: FastifyInstance) {
  /**
   * POST /matches — record match action after user selects Adopt or Foster
   * Body: { dog_id: string, action: 'adopt' | 'foster' }
   * Returns: { redirect_url: string }
   *   - For 'adopt': the dog's petfinder_url (adoption deep-link)
   *   - For 'foster': Austin foster care application URL
   */
  fastify.post<{
    Body: { dog_id: string; action: 'adopt' | 'foster' };
  }>('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { dog_id, action } = request.body || {};

      if (!dog_id || typeof dog_id !== 'string') {
        return reply.status(400).send({
          data: null,
          error: { message: 'dog_id is required', code: 'VALIDATION_ERROR' },
        });
      }

      if (action !== 'adopt' && action !== 'foster') {
        return reply.status(400).send({
          data: null,
          error: { message: 'action must be "adopt" or "foster"', code: 'VALIDATION_ERROR' },
        });
      }

      // Fetch the dog to get petfinder_url for adopt redirect
      const { data: dog, error: dogError } = await supabase
        .from('dogs')
        .select('id, petfinder_url')
        .eq('id', dog_id)
        .single();

      if (dogError || !dog) {
        return reply.status(404).send({
          data: null,
          error: { message: 'Dog not found', code: 'NOT_FOUND' },
        });
      }

      // Upsert the match (handles duplicate gracefully)
      const { error: matchError } = await supabase
        .from('matches')
        .upsert(
          { user_id: request.userId, dog_id, action },
          { onConflict: 'user_id,dog_id' }
        );

      if (matchError) {
        request.log.error({ err: matchError }, 'Failed to record match');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to record match', code: 'DB_ERROR' },
        });
      }

      const redirect_url = action === 'adopt'
        ? (dog.petfinder_url || '')
        : FOSTER_URL;

      return reply.status(200).send({
        data: { redirect_url },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error recording match');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });
}
