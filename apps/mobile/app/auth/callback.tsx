import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { colors } from '../../constants/colors';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AUTH CALLBACK] Session error:', error);
          router.replace('/(auth)/login');
          return;
        }

        if (sessionData.session) {
          const store = useAuthStore.getState();
          store.setSession(sessionData.session);
          store.setEmailVerified(true);
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    }

    handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});