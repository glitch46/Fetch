// Auth middleware — owned by Auth Agent
// Validates Supabase JWT tokens using Supabase's getUser() for algorithm-agnostic verification

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Extend Fastify request type to include authenticated user info
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    emailVerified: boolean;
  }
}

/**
 * Fastify preHandler hook that validates Supabase JWTs.
 *
 * Uses Supabase's getUser() to verify the token server-side.
 * This works regardless of JWT signing algorithm (HS256 or ES256).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'AUTH_REQUIRED' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the token with Supabase Auth (works with both HS256 and ES256)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'AUTH_REQUIRED' },
      });
    }

    // Attach user identity to the request
    request.userId = user.id;
    request.userEmail = user.email || '';
    request.emailVerified = !!user.email_confirmed_at;
  } catch (err: any) {
    console.error('[AUTH] Token verification failed:', err.message);
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'AUTH_REQUIRED' },
    });
  }
}

/**
 * Stricter variant that also requires email verification.
 * Use this on routes where unverified users should be blocked.
 */
export async function authenticateVerified(request: FastifyRequest, reply: FastifyReply) {
  // First run standard authentication
  const authResult = await authenticate(request, reply);

  // If authenticate already sent a reply (error), stop here
  if (reply.sent) return authResult;

  // Enforce email verification
  if (!request.emailVerified) {
    return reply.status(403).send({
      data: null,
      error: { message: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' },
    });
  }
}
