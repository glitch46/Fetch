// Auth routes — owned by Auth Agent
// Handles registration, login, OAuth exchange, logout, and email verification
//
// ══════════════════════════════════════════════════════
// SUPABASE AUTH CONFIGURATION (Required Dashboard Setup)
// ══════════════════════════════════════════════════════
//
// 1. EMAIL AUTH
//    - Go to: Supabase Dashboard > Authentication > Providers > Email
//    - Enable "Email" provider
//    - Enable "Confirm email" (mandatory — enforced server-side)
//    - Set "Minimum password length" to 8
//    - Under Email Templates, customize the "Confirm signup" template with Fetch branding
//
// 2. GOOGLE OAUTH
//    - Go to: Google Cloud Console > APIs & Services > Credentials
//    - Create an OAuth 2.0 Client ID (type: "Web application")
//    - Set Authorized redirect URI: https://ruushiqquescvfhdbodi.supabase.co/auth/v1/callback
//    - Client ID: 442294815609-hfnlfapfbihbaa10o6d1tj9c6o8akij3.apps.googleusercontent.com
//    - Go to: Supabase Dashboard > Authentication > Providers > Google
//    - Enable Google provider, paste Client ID and Client Secret
//    - Set the Client ID in .env as EXPO_PUBLIC_GOOGLE_CLIENT_ID
//
// 3. FACEBOOK OAUTH
//    - Go to: Meta Developer Portal > Create App > "Consumer" type
//    - Add "Facebook Login" product
//    - Under Facebook Login > Settings:
//      - Set Valid OAuth Redirect URI: https://ruushiqquescvfhdbodi.supabase.co/auth/v1/callback
//    - Go to: App Settings > Basic to get App ID and App Secret
//    - Go to: Supabase Dashboard > Authentication > Providers > Facebook
//    - Enable Facebook provider, paste App ID and App Secret
//    - Set the App ID in .env as FACEBOOK_APP_ID
//
// 4. REDIRECT URLS
//    - Go to: Supabase Dashboard > Authentication > URL Configuration
//    - Add to "Redirect URLs": fetch://auth/callback
//    - This handles deep linking back to the mobile app after OAuth flows
//
// 5. JWT SECRET
//    - Go to: Supabase Dashboard > Settings > API
//    - Copy the "JWT Secret" value
//    - Set it in .env as JWT_SECRET (used by @fastify/jwt for token verification)
//
// ══════════════════════════════════════════════════════

import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/client.js';
import { authenticate } from '../middleware/auth.js';

// Request body schemas for Fastify validation
interface RegisterBody {
  email: string;
  password: string;
  display_name?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface OAuthBody {
  provider: 'google' | 'facebook';
  access_token: string;
}

interface ResendVerificationBody {
  email: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/register
   * Creates a new Supabase Auth user with email/password,
   * then creates a corresponding row in the public.users table.
   */
  fastify.post<{ Body: RegisterBody }>('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          display_name: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, display_name } = request.body;

    try {
      // Create Supabase Auth user (using service role client)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email verification
        user_metadata: { display_name: display_name || null },
      });

      if (authError) {
        // Return generic error to avoid revealing whether email exists
        request.log.error({ err: authError }, 'Registration failed');
        return reply.status(400).send({
          data: null,
          error: { message: 'Registration failed. Please check your details and try again.', code: 'REGISTRATION_FAILED' },
        });
      }

      // Create corresponding row in public.users table
      // The id is the Supabase Auth user ID (direct mapping)
      const { error: dbError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          display_name: display_name || null,
          auth_provider: 'email',
        });

      if (dbError) {
        request.log.error({ err: dbError }, 'Failed to create user record');
        // Clean up the auth user if DB insert fails
        await supabase.auth.admin.deleteUser(authData.user.id);
        return reply.status(500).send({
          data: null,
          error: { message: 'Registration failed. Please try again.', code: 'REGISTRATION_FAILED' },
        });
      }

      // Send verification email via Supabase
      // Supabase automatically sends the verification email on createUser
      // if email_confirm is false and the project has "Confirm email" enabled

      // Generate a session so the mobile app can store the token
      // (user will have limited access until email is verified)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // If sign-in fails (e.g., email not confirmed and Supabase blocks login),
      // that is expected — return success with no session
      return reply.status(201).send({
        data: {
          user: {
            id: authData.user.id,
            email: authData.user.email!,
            display_name: display_name || null,
            auth_provider: 'email' as const,
            email_verified: false,
          },
          session: signInData?.session
            ? {
                access_token: signInData.session.access_token,
                refresh_token: signInData.session.refresh_token,
                expires_at: signInData.session.expires_at,
              }
            : null,
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected registration error');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * POST /auth/login
   * Signs in with email/password via Supabase Auth.
   */
  fastify.post<{ Body: LoginBody }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Generic error message — do not reveal whether email exists
        request.log.error({ err: error }, 'Login failed');
        return reply.status(401).send({
          data: null,
          error: { message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' },
        });
      }

      // Check email verification status from the Supabase user
      const emailVerified = !!data.user.email_confirmed_at;

      // Fetch the user profile from public.users table
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !userProfile) {
        request.log.error({ err: profileError }, 'User profile not found');
        return reply.status(500).send({
          data: null,
          error: { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
        });
      }

      return reply.status(200).send({
        data: {
          user: {
            id: userProfile.id,
            email: userProfile.email,
            display_name: userProfile.display_name,
            auth_provider: userProfile.auth_provider,
            avatar_url: userProfile.avatar_url,
            notification_new_matches: userProfile.notification_new_matches,
            notification_urgent_dogs: userProfile.notification_urgent_dogs,
            email_verified: emailVerified,
          },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected login error');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * POST /auth/oauth
   * Exchanges an OAuth provider token (from Google/Facebook) for a Supabase session.
   * The mobile app obtains the provider access_token via expo-auth-session,
   * then sends it here to create/link the Supabase Auth account.
   */
  fastify.post<{ Body: OAuthBody }>('/oauth', {
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'access_token'],
        properties: {
          provider: { type: 'string', enum: ['google', 'facebook'] },
          access_token: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { provider, access_token } = request.body;

    try {
      // Exchange the provider token for a Supabase session
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider,
        token: access_token,
      });

      if (error) {
        request.log.error({ err: error }, 'OAuth exchange failed');
        return reply.status(401).send({
          data: null,
          error: { message: 'Authentication failed. Please try again.', code: 'OAUTH_FAILED' },
        });
      }

      // Upsert the user in the public.users table
      // OAuth users are considered email-verified
      const userMetadata = data.user.user_metadata || {};
      const displayName = userMetadata.full_name || userMetadata.name || null;
      const avatarUrl = userMetadata.avatar_url || userMetadata.picture || null;

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: data.user.id,
            email: data.user.email!,
            display_name: displayName,
            auth_provider: provider,
            avatar_url: avatarUrl,
          },
          { onConflict: 'id' }
        );

      if (upsertError) {
        request.log.error({ err: upsertError }, 'Failed to upsert OAuth user record');
      }

      // Fetch the full user profile
      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      return reply.status(200).send({
        data: {
          user: userProfile
            ? {
                id: userProfile.id,
                email: userProfile.email,
                display_name: userProfile.display_name,
                auth_provider: userProfile.auth_provider,
                avatar_url: userProfile.avatar_url,
                notification_new_matches: userProfile.notification_new_matches,
                notification_urgent_dogs: userProfile.notification_urgent_dogs,
                email_verified: true, // OAuth users are always verified
              }
            : null,
          session: data.session
            ? {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
              }
            : null,
          is_new_user: !userProfile, // Let the mobile app know if it should show onboarding
        },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected OAuth error');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * POST /auth/logout
   * Invalidates the current Supabase session.
   * Requires a valid JWT (user must be authenticated to log out).
   */
  fastify.post('/logout', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      // Sign out the user on Supabase (invalidates the refresh token)
      // Using the service role client, we can sign out by user ID
      // However, Supabase's signOut() on the service client doesn't target specific users.
      // The actual session invalidation happens client-side by clearing tokens.
      // Server-side, we acknowledge the logout request.

      return reply.status(200).send({
        data: { message: 'Logged out successfully' },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected logout error');
      return reply.status(500).send({
        data: null,
        error: { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * POST /auth/resend-verification
   * Resends the email verification link.
   * Uses Supabase's resend OTP functionality.
   */
  fastify.post<{ Body: ResendVerificationBody }>('/resend-verification', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body;

    try {
      // Use Supabase to resend the verification email
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        request.log.error({ err: error }, 'Failed to resend verification email');
      }

      // Always return success to avoid revealing whether the email exists
      return reply.status(200).send({
        data: { message: 'If an account with that email exists, a verification link has been sent.' },
        error: null,
      });
    } catch (err) {
      request.log.error({ err }, 'Unexpected resend verification error');
      // Still return success to prevent email enumeration
      return reply.status(200).send({
        data: { message: 'If an account with that email exists, a verification link has been sent.' },
        error: null,
      });
    }
  });
}
