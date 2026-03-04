// AuthGuard — owned by Auth Agent
// Route protection wrapper that checks auth state and redirects unauthenticated users

import { type ReactNode, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
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
  const { session, isLoading, emailVerified } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isAuthenticated = session !== null;

    if (!isAuthenticated && !inAuthGroup) {
      // User is not signed in and trying to access protected route
      router.replace('/(auth)/login');
    } else if (isAuthenticated && !emailVerified && (segments as string[])[1] !== 'verify-email') {
      // User is signed in but email is not verified
      // Allow them to stay in auth group but redirect to verify-email
      // Only redirect if they're not already on the verify-email screen
      const isOnVerifyScreen = inAuthGroup && (segments as string[])[1] === 'verify-email';
      if (!isOnVerifyScreen) {
        router.replace('/(auth)/verify-email');
      }
    } else if (isAuthenticated && emailVerified && inAuthGroup) {
      // User is signed in, verified, and on an auth screen — redirect to main app
      router.replace('/(tabs)');
    }
  }, [session, isLoading, emailVerified, segments]);

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
