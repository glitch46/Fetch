// Auth service — owned by Auth Agent
// Complete authentication service for email, Google OAuth, and Facebook OAuth
// All tokens are stored in expo-secure-store via the Supabase client adapter (see supabase.ts)
// NEVER use AsyncStorage for auth tokens

import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

// Ensure web browser auth sessions are completed on return
WebBrowser.maybeCompleteAuthSession();

// OAuth redirect URI for deep linking (fetch://auth/callback)
const redirectUri = makeRedirectUri({
  scheme: 'fetch',
  path: 'auth/callback',
});

// ── Email Authentication ──────────────────────────────

/**
 * Register a new user with email and password.
 * Sends a verification email automatically.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || null,
      },
      emailRedirectTo: redirectUri,
    },
  });

  if (error) throw error;

  return data;
}

/**
 * Sign in with email and password.
 * Returns the session on success.
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // Update the auth store with session info
  if (data.session) {
    const store = useAuthStore.getState();
    store.setSession(data.session);
    store.setEmailVerified(!!data.user.email_confirmed_at);
  }

  return data;
}

// ── OAuth Authentication ──────────────────────────────

/**
 * Sign in with Google OAuth using expo-auth-session.
 * Opens a web browser for the Google OAuth flow, then exchanges
 * the result for a Supabase session.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  // Open the OAuth URL in the system browser
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectUri,
  );

  if (result.type !== 'success') {
    throw new Error('OAuth flow was cancelled or failed');
  }

  // Extract the tokens from the redirect URL
  const params = extractParamsFromUrl(result.url);
  if (!params.access_token || !params.refresh_token) {
    throw new Error('Missing tokens in OAuth callback');
  }

  // Set the session in Supabase client using the tokens from the redirect
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });

  if (sessionError) throw sessionError;

  // Update the auth store
  if (sessionData.session) {
    const store = useAuthStore.getState();
    store.setSession(sessionData.session);
    store.setEmailVerified(true); // OAuth users are always verified
  }

  return sessionData;
}

/**
 * Sign in with Facebook OAuth using expo-auth-session.
 * Opens a web browser for the Facebook OAuth flow, then exchanges
 * the result for a Supabase session.
 */
export async function signInWithFacebook() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  // Open the OAuth URL in the system browser
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectUri,
  );

  if (result.type !== 'success') {
    throw new Error('OAuth flow was cancelled or failed');
  }

  // Extract the tokens from the redirect URL
  const params = extractParamsFromUrl(result.url);
  if (!params.access_token || !params.refresh_token) {
    throw new Error('Missing tokens in OAuth callback');
  }

  // Set the session in Supabase client using the tokens from the redirect
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });

  if (sessionError) throw sessionError;

  // Update the auth store
  if (sessionData.session) {
    const store = useAuthStore.getState();
    store.setSession(sessionData.session);
    store.setEmailVerified(true); // OAuth users are always verified
  }

  return sessionData;
}

// ── Session Management ──────────────────────────────

/**
 * Sign out the current user.
 * Clears tokens from secure store and resets the auth store.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  // Reset the auth store
  useAuthStore.getState().reset();
}

/**
 * Get the current session from secure store.
 * Supabase client handles automatic token refresh (configured in supabase.ts).
 */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Manually refresh the session token.
 * Usually not needed since autoRefreshToken is enabled in the Supabase client.
 */
export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;

  if (data.session) {
    useAuthStore.getState().setSession(data.session);
  }

  return data.session;
}

/**
 * Listen for auth state changes (sign in, sign out, token refresh).
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

/**
 * Resend the verification email for the given email address.
 */
export async function resendVerificationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw error;
}

// ── Helpers ──────────────────────────────

/**
 * Extract URL fragment parameters from an OAuth callback URL.
 * Supabase returns tokens in the URL fragment (hash) as:
 * fetch://auth/callback#access_token=...&refresh_token=...&...
 */
function extractParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  // Try hash fragment first (Supabase's default for implicit flow)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const fragment = url.substring(hashIndex + 1);
    const searchParams = new URLSearchParams(fragment);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  // Also check query params as fallback
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const endIndex = hashIndex !== -1 ? hashIndex : url.length;
    const query = url.substring(queryIndex + 1, endIndex);
    const searchParams = new URLSearchParams(query);
    searchParams.forEach((value, key) => {
      if (!params[key]) {
        params[key] = value;
      }
    });
  }

  return params;
}
