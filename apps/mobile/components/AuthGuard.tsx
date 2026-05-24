// AuthGuard — owned by Auth Agent
// Route protection wrapper that checks auth state and redirects unauthenticated users

import { type ReactNode, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { colors } from '../constants/colors';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * AuthGuard wraps the root layout and handles routing based on auth state:
 * - If loading: show a loading spinner
 * - If not authenticated: redirect to login screen
 * - If authenticated but email not verified: redirect to verify-email screen
 * - If authenticated and verified: allow access to protected routes
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { session, isLoading, emailVerified, hasCompletedOnboarding, isAuthenticating, setIsAuthenticating } = useAuthStore();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ edit?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';
    const onPreferences = segments[0] === 'preferences';
    const isEditingPreferences = params.edit === 'true';
    const onDogDetail = segments[0] === 'dog';
    const onRootIndex = !segments[0] || segments[0] === 'index';
    const isAuthenticated = session !== null;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && !emailVerified && (segments as string[])[1] !== 'verify-email') {
      const isOnVerifyScreen = inAuthGroup && (segments as string[])[1] === 'verify-email';
      if (!isOnVerifyScreen) {
        if (isAuthenticating) setIsAuthenticating(false);
        router.replace('/(auth)/verify-email');
      }
    } else if (isAuthenticated && emailVerified && onRootIndex) {
      if (isAuthenticating) setIsAuthenticating(false);
      router.replace('/(tabs)');
    } else if (isAuthenticated && emailVerified && inAuthGroup) {
      if (isAuthenticating) setIsAuthenticating(false);
      router.replace(hasCompletedOnboarding ? '/(tabs)' : '/preferences');
    } else if (isAuthenticated && emailVerified && hasCompletedOnboarding && onPreferences && !isEditingPreferences) {
      if (isAuthenticating) setIsAuthenticating(false);
      router.replace('/(tabs)');
    } else if (isAuthenticated && emailVerified && !hasCompletedOnboarding && inTabs) {
      if (isAuthenticating) setIsAuthenticating(false);
      router.replace('/preferences');
    } else if (isAuthenticated && inTabs) {
      if (isAuthenticating) setIsAuthenticating(false);
    }
  }, [session, isLoading, emailVerified, hasCompletedOnboarding, segments, params.edit, isAuthenticating, setIsAuthenticating]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
