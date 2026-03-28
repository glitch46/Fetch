// Root layout — owned by Auth Agent (auth state listener) + Mobile Agent (navigation structure)
// Initializes auth state listener, loads fonts, and wraps navigation in AuthGuard

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
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
import { colors } from '../constants/colors';

// Must run before router handles any URLs — intercepts OAuth callback redirects
WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

/**
 * Fetch user profile directly via fetch(), bypassing the axios interceptor.
 * The backend auto-creates the user row if it doesn't exist (GET /me upserts).
 */
async function fetchProfile(token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      return null;
    }

    const res = await fetch(`${apiUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSessionWithTimeout(timeoutMs = 7000) {
  try {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    const refreshPromise = supabase.auth.refreshSession();

    const result = await Promise.race([refreshPromise, timeoutPromise]);
    if (!result) {
      return null;
    }

    return result.data?.session || null;
  } catch {
    return null;
  }
}

export default function RootLayout() {
  const { setSession, setUser, setLoading, setEmailVerified, setHasCompletedOnboarding, reset } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Initialize: check for existing session in secure store
    async function initAuth() {
      try {
        // Check that required env vars are set
        if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error('Missing Supabase configuration. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
        }
        
        const session = await getSession();
        if (session) {
          const refreshedSession = await refreshSessionWithTimeout();
          const activeSession = refreshedSession || session;
          setSession(activeSession);
          setEmailVerified(!!activeSession.user.email_confirmed_at);

          // Fetch the full user profile from the backend (bypasses axios interceptor)
          const profile = await fetchProfile(activeSession.access_token);
          if (profile) {
            setUser(profile as User);
            if (profile.has_completed_onboarding) {
              setHasCompletedOnboarding(true);
            }
          }
        }
      } catch (err) {
        console.error('[AUTH] Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize app');
        reset();
      } finally {
        setLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes (sign in, sign out, token refresh)
    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Fetch profile BEFORE setting session to avoid AuthGuard race condition.
        // If we set session first, AuthGuard fires with hasCompletedOnboarding=false
        // and redirects to /preferences before fetchProfile can set it to true.
        const profile = await fetchProfile(session.access_token);

        // Now set all auth state at once so AuthGuard has complete info
        if (profile) {
          setUser(profile as User);
          if (profile.has_completed_onboarding) {
            setHasCompletedOnboarding(true);
          }
        }
        setSession(session);
        setEmailVerified(!!session.user.email_confirmed_at);
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

  // Show error screen
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  // Show loading while fonts load
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
