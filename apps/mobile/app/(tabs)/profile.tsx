// Profile screen — owned by Mobile Agent (implementation)
// User profile with preferences, notification settings, and logout

import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../lib/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { colors } from '../../constants/colors';
import Constants from 'expo-constants';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, user } = useAuthStore();

  const displayName = user?.display_name || session?.user?.user_metadata?.display_name || null;
  const email = user?.email || session?.user?.email || '';
  const initial = (displayName || email || '?')[0].toUpperCase();

  async function handleSignOut() {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      useAuthStore.getState().reset();
      router.replace('/(auth)/login');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* Avatar + Info */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        {displayName && <Text style={styles.displayName}>{displayName}</Text>}
        <Text style={styles.email}>{email}</Text>
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push('/preferences')}
        >
          <Ionicons name="options-outline" size={22} color={colors.secondary} />
          <Text style={styles.menuLabel}>Edit Preferences</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.menuRow}>
          <Ionicons name="notifications-outline" size={22} color={colors.secondary} />
          <Text style={styles.menuLabel}>New Match Alerts</Text>
          <Switch
            value={user?.notification_new_matches ?? true}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuRow}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.secondary} />
          <Text style={styles.menuLabel}>Urgent Dog Alerts</Text>
          <Switch
            value={user?.notification_urgent_dogs ?? false}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={[styles.menuLabel, styles.signOutLabel]}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <Text style={styles.version}>
        Fetch v{Constants.expoConfig?.version || '1.0.0'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.text,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Nunito_800ExtraBold',
    color: '#fff',
  },
  displayName: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    color: colors.text,
  },
  email: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    marginTop: 4,
  },
  menuSection: {
    backgroundColor: colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 16,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.text,
  },
  signOutLabel: {
    color: colors.error,
  },
  version: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    marginTop: 'auto',
    paddingBottom: 32,
  },
});
