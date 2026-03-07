// Root layout — owned by Auth Agent (auth state listener) + Mobile Agent (navigation structure)
// Initializes auth state listener, loads fonts, and wraps navigation in AuthGuard

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { onAuthStateChange, getSession } from '../lib/auth';
import AuthGuard from '../components/AuthGuard';
import { supabase } from '../lib/supabase';
import type { User } from '@fetch/shared';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Must run before router handles any URLs — intercepts OAuth callback redirects
WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

/**
 * Fetch user profile directly via fetch(), bypassing the axios interceptor.
 * The axios 401 handler calls supabase.auth.refreshSession() which acquires
 * a session lock. If this lock is held when the swipe deck calls api.get('/dogs'),
 * the request interceptor's getSession() blocks indefinitely, hanging the app.
 */
async function fetchProfile(token: string) {
  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data || null;
}

export default function RootLayout() {
  const { setSession, setUser, setLoading, setEmailVerified, setHasCompletedOnboarding, reset } = useAuthStore();

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // Initialize: check for existing session in secure store
    async function initAuth() {
      try {
        const session = await getSession();
        if (session) {
          // Refresh the session to get the latest user data (e.g., email_confirmed_at)
          const { data: refreshed } = await supabase.auth.refreshSession();
          const activeSession = refreshed.session || session;
          setSession(activeSession);
          setEmailVerified(!!activeSession.user.email_confirmed_at);

          // Fetch the full user profile from the backend (bypasses axios interceptor)
          try {
            const profile = await fetchProfile(activeSession.access_token);
            if (profile) {
              setUser(profile as User);
              if (profile.has_completed_onboarding) {
                setHasCompletedOnboarding(true);
              }
            }
          } catch {
            // Profile fetch failed — user may not have a profile row yet
          }
        }
      } catch {
        // Session retrieval failed — user is not authenticated
        reset();
      } finally {
        setLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes (sign in, sign out, token refresh)
    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setSession(session);
        setEmailVerified(!!session.user.email_confirmed_at);

        // Fetch profile bypassing axios interceptor to avoid session lock contention
        try {
          const profile = await fetchProfile(session.access_token);
          if (profile) {
            setUser(profile as User);
            if (profile.has_completed_onboarding) {
              setHasCompletedOnboarding(true);
            }
          }
        } catch {
          // Profile not found — expected for new OAuth users
        }
      } else if (event === 'SIGNED_OUT') {
        reset();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setSession(session);
      } else if (event === 'USER_UPDATED' && session) {
        setSession(session);
        setEmailVerified(!!session.user.email_confirmed_at);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="preferences" />
          <Stack.Screen name="dog/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthGuard>
    </GestureHandlerRootView>
  );
}
