// Root layout — owned by Auth Agent (auth state listener) + Mobile Agent (navigation structure)
// Initializes auth state listener, loads fonts, handles OAuth deep links, and wraps navigation in AuthGuard

import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useAuthStore } from '../store/useAuthStore';
import { onAuthStateChange, getSession, extractParamsFromUrl } from '../lib/auth';
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
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '../constants/colors';

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

/**
 * Process an OAuth callback URL by extracting tokens and setting the Supabase session.
 * Called when the app receives a deep link like fetch://auth/callback#access_token=...
 */
async function handleOAuthCallback(url: string) {
  if (!url.startsWith('fetch://auth/callback')) {
    return;
  }

  const params = extractParamsFromUrl(url);
  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;

  if (!accessToken || !refreshToken) {
    console.warn('[DEEPLINK] No tokens found in callback URL');
    return;
  }

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error('[DEEPLINK] setSession error:', error.message);
      return;
    }

    if (data.session) {
      const store = useAuthStore.getState();
      store.setSession(data.session);
      store.setEmailVerified(true);

      const profile = await fetchProfile(data.session.access_token);
      if (profile) {
        store.setUser(profile as User);
        if ((profile as any).has_completed_onboarding) {
          store.setHasCompletedOnboarding(true);
        }
      }
    }
  } catch (err) {
    console.error('[DEEPLINK] Error processing callback:', err);
  }
}

export default function RootLayout() {
  const { setSession, setUser, setLoading, setEmailVerified, setHasCompletedOnboarding, reset } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const processedUrlRef = useRef<string | null>(null);
  const splashOpacity = useSharedValue(0);
  const splashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const appReady = fontsLoaded || fontError;

  useEffect(() => {
    if (appReady) {
      splashOpacity.value = withTiming(1, { duration: 500 });
      const holdTimer = setTimeout(() => {
        SplashScreen.hideAsync();
        splashOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
          if (finished) runOnJS(setShowCustomSplash)(false);
        });
      }, 600);
      return () => clearTimeout(holdTimer);
    }
  }, [appReady]);

  // Handle deep links for OAuth callbacks
  useEffect(() => {
    // Check for URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url && url.startsWith('fetch://auth/callback')) {
        if (processedUrlRef.current !== url) {
          processedUrlRef.current = url;
          handleOAuthCallback(url);
        }
      }
    });

    // Listen for URLs while app is running (warm start)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url && url.startsWith('fetch://auth/callback')) {
        if (processedUrlRef.current !== url) {
          processedUrlRef.current = url;
          handleOAuthCallback(url);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    async function initAuth() {
      try {
        if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error('Missing Supabase configuration. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
        }

        const session = await getSession();
        if (session) {
          const refreshedSession = await refreshSessionWithTimeout();
          const activeSession = refreshedSession || session;
          setSession(activeSession);
          setEmailVerified(!!activeSession.user.email_confirmed_at);

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

    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const profile = await fetchProfile(session.access_token);

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

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (showCustomSplash) {
    return (
      <View style={styles.splashContainer}>
        {appReady && (
          <Animated.View style={[styles.splashContent, splashAnimatedStyle]}>
            <Image
              source={require('../assets/NewLogo2.png')}
              style={styles.splashLogo}
              contentFit="contain"
            />
          </Animated.View>
        )}
      </View>
    );
  }

  if (!appReady) {
    return (
      <View style={styles.splashContainer} />
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
          <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'none' }} />
        </Stack>
      </AuthGuard>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  splashContent: {
    alignItems: 'center',
  },
  splashLogo: {
    width: 280,
    height: 120,
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
