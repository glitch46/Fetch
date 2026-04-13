// Auth service — owned by Auth Agent
// Complete authentication service for email, Google OAuth, and Facebook OAuth
// All tokens are stored in expo-secure-store via the Supabase client adapter (see supabase.ts)
// NEVER use AsyncStorage for auth tokens

import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const redirectUri = 'fetch://auth/callback';

console.log('[AUTH] Redirect URI:', redirectUri);

async function waitForSession(maxMs = 15000): Promise<Session | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ── Email Authentication ──────────────────────────────

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || null },
      emailRedirectTo: redirectUri,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  if (data.session) {
    const store = useAuthStore.getState();
    store.setSession(data.session);
    store.setEmailVerified(!!data.user.email_confirmed_at);
  }
  return data;
}

// ── OAuth Helper ──────────────────────────────────────

/**
 * Opens the OAuth URL in the system browser and waits for a deep link redirect
 * back to fetch://auth/callback. On Android, openAuthSessionAsync cannot capture
 * custom scheme redirects reliably, so we use openBrowserAsync + deep link listener.
 */
async function openOAuthFlow(provider: 'google' | 'facebook'): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  console.log(`[AUTH] ${provider} OAuth URL:`, data.url);

  const deepLinkUrl = await Promise.race([
    new Promise<string | null>((resolve) => {
      let resolved = false;
      const sub = Linking.addEventListener('url', ({ url }) => {
        if (url && url.startsWith('fetch://auth/callback')) {
          if (!resolved) {
            resolved = true;
            sub.remove();
            resolve(url);
          }
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sub.remove();
          resolve(null);
        }
      }, 120000);
    }),
    WebBrowser.openBrowserAsync(data.url).then(() => null as string | null),
  ]);

  WebBrowser.dismissBrowser();

  console.log('[AUTH] Deep link result:', deepLinkUrl ? 'received' : 'none');

  if (deepLinkUrl) {
    const params = extractParamsFromUrl(deepLinkUrl);
    if (params.access_token && params.refresh_token) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (sessionError) throw sessionError;
      if (sessionData.session) {
        const store = useAuthStore.getState();
        store.setSession(sessionData.session);
        store.setEmailVerified(true);
        return sessionData.session;
      }
    }
  }

  const session = await waitForSession();
  if (session) {
    console.log('[AUTH] Recovered session after OAuth');
    const store = useAuthStore.getState();
    store.setSession(session);
    store.setEmailVerified(true);
    return session;
  }

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    const store = useAuthStore.getState();
    store.setSession(existing.session);
    store.setEmailVerified(true);
    return existing.session;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session) {
    const store = useAuthStore.getState();
    store.setSession(refreshed.session);
    store.setEmailVerified(true);
    return refreshed.session;
  }

  throw new Error(`${provider} login was cancelled or failed`);
}

export async function signInWithGoogle() {
  return openOAuthFlow('google');
}

export async function signInWithFacebook() {
  return openOAuthFlow('facebook');
}

// ── Session Management ──────────────────────────────

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  useAuthStore.getState().reset();
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (data.session) {
    useAuthStore.getState().setSession(data.session);
  }
  return data.session;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export async function resendVerificationEmail(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

// ── Helpers ──────────────────────────────

function extractParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const fragment = url.substring(hashIndex + 1);
    new URLSearchParams(fragment).forEach((value, key) => {
      params[key] = value;
    });
  }

  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const endIndex = hashIndex !== -1 ? hashIndex : url.length;
    const query = url.substring(queryIndex + 1, endIndex);
    new URLSearchParams(query).forEach((value, key) => {
      if (!params[key]) params[key] = value;
    });
  }

  return params;
}