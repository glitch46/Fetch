// Match Celebration — owned by Mobile Agent (implementation)
// Full-screen overlay with confetti, dog photo, and adopt/foster CTAs

import { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useDogsStore } from '../store/useDogsStore';
import AdoptFosterModal from './AdoptFosterModal';
import api from '../lib/api';
import { colors } from '../constants/colors';
import { cleanText } from '../utils/cleanText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MatchCelebration() {
  const { matchedDog, dismissMatch } = useDogsStore();

  const [modalAction, setModalAction] = useState<'adopt' | 'foster' | null>(null);

  if (!matchedDog) return null;

  const photoUrl = matchedDog.photos?.[0]?.large || matchedDog.photos?.[0]?.medium || null;

  async function handleAdoptFosterContinue() {
    const action = modalAction!;
    setModalAction(null);

    try {
      await api.post('/matches', { dog_id: matchedDog!.id, action });
    } catch {
      // Non-blocking
    }

    // Both adopt and foster go to the dog's Petfinder profile
    const url = matchedDog!.adoption_url || matchedDog!.petfinder_url;
    if (url) {
      await WebBrowser.openBrowserAsync(url);
    }

    dismissMatch();
  }

  return (
    <View style={styles.overlay}>
      <ConfettiCannon
        count={80}
        origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
        autoStart
        fadeOut
        colors={['#F5A623', '#1A7F74', '#FFFFFF']}
      />

      <View style={styles.content}>
        {photoUrl && (
          <View style={styles.photoContainer}>
            <Image source={{ uri: photoUrl }} style={styles.photo} contentFit="cover" />
          </View>
        )}

        <Text style={styles.title}>You matched with {cleanText(matchedDog.name)}! 🎉</Text>
        <Text style={styles.subtitle}>
          Take the next step and give {cleanText(matchedDog.name)} a loving home
        </Text>

        <TouchableOpacity
          style={[styles.button, styles.adoptButton]}
          onPress={() => setModalAction('adopt')}
        >
          <Text style={styles.buttonText}>🏠 Adopt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.fosterButton]}
          onPress={() => setModalAction('foster')}
        >
          <Text style={styles.fosterButtonText}>💛 Foster</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dismissButton} onPress={dismissMatch}>
          <Text style={styles.dismissText}>Maybe Later</Text>
        </TouchableOpacity>
      </View>

      {/* Adopt/Foster modal with Animal ID */}
      {modalAction && (
        <AdoptFosterModal
          visible={modalAction !== null}
          dog={matchedDog}
          action={modalAction}
          onContinue={handleAdoptFosterContinue}
          onClose={() => setModalAction(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  photoContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: colors.primary,
    overflow: 'hidden',
    marginBottom: 24,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 26,
    fontFamily: 'Nunito_800ExtraBold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    width: SCREEN_WIDTH - 96,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  adoptButton: {
    backgroundColor: colors.primary,
  },
  fosterButton: {
    backgroundColor: colors.secondary,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
  },
  fosterButtonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
  },
  dismissButton: {
    marginTop: 8,
    paddingVertical: 12,
  },
  dismissText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
  },
});
