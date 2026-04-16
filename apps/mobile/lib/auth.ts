// Auth service — owned by Auth Agent
// OAuth uses openBrowserAsync + session polling.
// Deep link callback (fetch://auth/callback) is handled in _layout.tsx via Linking,
// which sets the Supabase session independently of this module.

import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import * as WebBrowser from 'expo-web-browser';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const redirectUri = 'fetch://auth/callback';

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

// ── OAuth Authentication ──────────────────────────────

/**
 * Opens the OAuth provider in the system browser.
 * After the user completes authentication, the browser redirects to
 * fetch://auth/callback which Android opens via the app's intent filter.
 * The deep link handler in _layout.tsx catches this URL, extracts tokens,
 * and calls supabase.auth.setSession().
 *
 * This function opens the browser, waits for it to close, then polls
 * for the session that was set by the deep link handler.
 */
async function openOAuthAndPoll(provider: 'google' | 'facebook'): Promise<Session> {
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

  await WebBrowser.openBrowserAsync(data.url);
  WebBrowser.dismissBrowser();

  // The deep link handler in _layout.tsx should have already set the session.
  // Poll as a fallback in case of timing issues.
  console.log('[AUTH] Browser closed, polling for session...');
  const session = await waitForSession(15000);

  if (session) {
    console.log('[AUTH] Session found after OAuth');
    const store = useAuthStore.getState();
    store.setSession(session);
    store.setEmailVerified(true);
    return session;
  }

  // Try one more immediate check
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    console.log('[AUTH] Found existing session');
    const store = useAuthStore.getState();
    store.setSession(existing.session);
    store.setEmailVerified(true);
    return existing.session;
  }

  throw new Error(`${provider} login was cancelled or failed. Please try again.`);
}

export async function signInWithGoogle() {
  return openOAuthAndPoll('google');
}

export async function signInWithFacebook() {
  return openOAuthAndPoll('facebook');
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

export function extractParamsFromUrl(url: string): Record<string, string> {
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