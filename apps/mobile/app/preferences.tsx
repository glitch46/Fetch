// Preferences screen — owned by Mobile Agent (implementation)
// Full-screen onboarding step with selectable preference chips

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useAuthStore } from '../store/useAuthStore';
import { PREFERENCE_OPTIONS } from '../constants/preferences';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';
import type { PreferenceKey } from '@fetch/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Save preferences directly via fetch, bypassing the axios interceptor.
 * The axios 401 handler can acquire a Supabase session lock that blocks
 * concurrent requests (like the dogs fetch on the swipe deck).
 */
async function savePreferencesDirectly(prefs: PreferenceKey[]) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    await fetch(`${process.env.EXPO_PUBLIC_API_URL}/me/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferences: prefs }),
    });
  } catch {
    // Best-effort save — preferences are in local store regardless
  }
}

export default function PreferencesScreen() {
  const { preferences, togglePreference } = usePreferencesStore();

  function handleSave() {
    useAuthStore.getState().setHasCompletedOnboarding(true);
    // Fire-and-forget — doesn't block navigation or interfere with session
    savePreferencesDirectly(preferences as PreferenceKey[]);
  }

  function handleSkip() {
    useAuthStore.getState().setHasCompletedOnboarding(true);
    savePreferencesDirectly([] as PreferenceKey[]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>What are you looking for in a dog?</Text>
        <Text style={styles.subtitle}>
          Select the traits that matter most to you. We'll use these to find your perfect match.
        </Text>

        <View style={styles.chipGrid}>
          {PREFERENCE_OPTIONS.map((option) => {
            const selected = preferences.includes(option.key);
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => togglePreference(option.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipEmoji}>{option.emoji}</Text>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueButton} onPress={handleSave}>
          <Text style={styles.continueText}>
            Continue{preferences.length > 0 ? ` (${preferences.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  headline: {
    fontSize: 26,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.secondary,
  },
  chipLabelSelected: {
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
  },
  skipButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
  },
});
