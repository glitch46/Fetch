// Notifications routes — owned by Backend Agent (implementation)
// Endpoints for Expo push token registration and notification settings

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../db/client.js';

export async function notificationsRoutes(fastify: FastifyInstance) {
  /**
   * POST /notifications/token — register or update user's Expo push token
   * Body: { token: string }
   * Stores token in users table (expo_push_token column).
   */
  fastify.post<{
    Body: { token: string };
  }>('/token', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { token } = request.body || {};

      if (!token || typeof token !== 'string') {
        return reply.status(400).send({
          data: null,
          error: { message: 'token is required', code: 'VALIDATION_ERROR' },
        });
      }

      const { error } = await supabase
        .from('users')
        .update({ expo_push_token: token })
        .eq('id', request.userId);

      if (error) {
        request.log.error({ err: error }, 'Failed to store push token');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to store push token', code: 'DB_ERROR' },
        });
      }

      return reply.status(200).send({
        data: { message: 'Push token registered' },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error storing push token');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * PUT /notifications/settings — update notification preferences
   * Body: { new_matches: boolean, urgent_dogs: boolean }
   * Stores in users table (notification_new_matches, notification_urgent_dogs columns).
   */
  fastify.put<{
    Body: { new_matches: boolean; urgent_dogs: boolean };
  }>('/settings', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { new_matches, urgent_dogs } = request.body || {};

      if (typeof new_matches !== 'boolean' || typeof urgent_dogs !== 'boolean') {
        return reply.status(400).send({
          data: null,
          error: { message: 'new_matches and urgent_dogs must be booleans', code: 'VALIDATION_ERROR' },
        });
      }

      const { error } = await supabase
        .from('users')
        .update({
          notification_new_matches: new_matches,
          notification_urgent_dogs: urgent_dogs,
        })
        .eq('id', request.userId);

      if (error) {
        request.log.error({ err: error }, 'Failed to update notification settings');
        return reply.status(500).send({
          data: null,
          error: { message: 'Failed to update notification settings', code: 'DB_ERROR' },
        });
      }

      return reply.status(200).send({
        data: { new_matches, urgent_dogs },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected error updating notification settings');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      });
    }
  });
}
