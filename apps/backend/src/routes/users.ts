// Users routes — owned by Backend Agent (implementation)
// Endpoints for user profile, preferences, and account management

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';
import type { PreferenceKey } from '@fetch/shared';

const VALID_PREFERENCE_KEYS: PreferenceKey[] = [
  'active_lifestyle', 'experienced_with_cats', 'cat_selective', 'cuddler',
  'experienced_with_dogs', 'dog_selective', 'housetrained', 'independent',
  'knows_tricks', 'laid_back', 'leash_trained', 'loves_car_rides',
  'loves_food_and_treats', 'loves_the_water', 'medium_energy',
  'experienced_with_older_kids', 'playful', 'experienced_with_young_kids',
  'foster_eligible', 'indoor_only', 'indoor_outdoor', 'long_term_resident',
  'quiet_home',
];

export async function usersRoutes(fastify: FastifyInstance) {
  /**
   * GET /me — returns current user profile + preferences
   */
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', request.userId)
        .single();

      if (error || !user) {
        return reply.status(404).send({
          data: null,
          error: { message: 'User not found', code: 'NOT_FOUND' },
        });
      }

      // Fetch preferences
      const { data: prefsRow } = await supabase
        .from('user_preferences')
        .select('preferences, updated_at')
        .eq('user_id', request.userId)
        .single();

      return reply.status(200).send({
        data: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          auth_provider: user.auth_provider,
          avatar_url: user.avatar_url,
          notification_new_matches: user.notification_new_matches,
          notification_urgent_dogs: user.notification_urgent_dogs,
          created_at: user.created_at,
          preferences: prefsRow?.preferences || [],
          has_completed_onboarding: prefsRow !== null,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error fetching user profile');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * PUT /me — update display_name
   */
  fastify.put<{
    Body: { display_name: string };
  }>('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { display_name } = request.body || {};

      if (!display_name || typeof display_name !== 'string') {
        return reply.status(400).send({
          data: null,
          error: { message: 'display_name is required', code: 'VALIDATION_ERROR' },
        });
      }

      if (display_name.length > 100) {
        return reply.status(400).send({
          data: null,
          error: { message: 'display_name must be 100 characters or less', code: 'VALIDATION_ERROR' },
        });
      }

      const { data: user, error } = await supabase
        .from('users')
        .update({ display_name })
        .eq('id', request.userId)
        .select()
        .single();

      if (error) {
        request.log.error({ err: error }, 'Failed to update user');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to update profile', code: 'DB_ERROR' },
        });
      }

      return reply.status(200).send({
        data: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          auth_provider: user.auth_provider,
          avatar_url: user.avatar_url,
          notification_new_matches: user.notification_new_matches,
          notification_urgent_dogs: user.notification_urgent_dogs,
          created_at: user.created_at,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error updating user');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * PUT /me/preferences — update user preference array
   * Validates that all preference keys are from the allowed list.
   * Upserts into user_preferences table.
   */
  fastify.put<{
    Body: { preferences: string[] };
  }>('/preferences', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { preferences } = request.body || {};

      if (!Array.isArray(preferences)) {
        return reply.status(400).send({
          data: null,
          error: { message: 'preferences must be an array', code: 'VALIDATION_ERROR' },
        });
      }

      // Validate all keys
      const invalidKeys = preferences.filter((k) => !VALID_PREFERENCE_KEYS.includes(k as PreferenceKey));
      if (invalidKeys.length > 0) {
        return reply.status(400).send({
          data: null,
          error: {
            message: `Invalid preference keys: ${invalidKeys.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        });
      }

      // Deduplicate
      const uniquePrefs = [...new Set(preferences)];

      const { data, error } = await supabase
        .from('user_preferences')
        .upsert(
          { user_id: request.userId, preferences: uniquePrefs },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) {
        request.log.error({ err: error }, 'Failed to update preferences');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to update preferences', code: 'DB_ERROR' },
        });
      }

      return reply.status(200).send({
        data: { preferences: data.preferences },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error updating preferences');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * DELETE /me — delete user account and all associated data (GDPR compliance)
   * Cascading deletes handle swipes, matches, and preferences via FK constraints.
   */
  fastify.delete('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', request.userId);

      if (error) {
        request.log.error({ err: error }, 'Failed to delete user');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to delete account', code: 'DB_ERROR' },
        });
      }

      return reply.status(200).send({
        data: { message: 'Account deleted successfully' },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error deleting user');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });
}
