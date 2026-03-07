// Swipe Deck screen — owned by Mobile Agent (implementation)
// Primary screen: card stack with reanimated gestures for browsing adoptable dogs

import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDogsStore } from '../../store/useDogsStore';
import DogCard from '../../components/DogCard';
import MatchCelebration from '../../components/MatchCelebration';
import api from '../../lib/api';
import { colors } from '../../constants/colors';
import type { Dog } from '@fetch/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

export default function SwipeDeckScreen() {
  const router = useRouter();
  const {
    dogs,
    currentIndex,
    isLoading,
    showMatchCelebration,
    setDogs,
    setCurrentIndex,
    setLoading,
    addLikedDog,
    triggerMatch,
  } = useDogsStore();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const fetchDogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get('/dogs', { params: { limit: 50 } });
      if (response?.data?.items) {
        const items = response.data.items.map((dog: Dog) => ({
          ...dog,
          name: dog.name.replace(/^\*+/, '').trim(),
          photos: typeof dog.photos === 'string' ? JSON.parse(dog.photos) : dog.photos,
        }));
        setDogs(items);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('[DOGS] Failed to fetch dogs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDogs();
  }, [fetchDogs]);

  // Preload next 3 dogs' images so they're cached before the user sees them
  useEffect(() => {
    const toPreload = dogs
      .slice(currentIndex + 1, currentIndex + 4)
      .flatMap((dog) => dog.photos?.slice(0, 1) || [])
      .map((photo) => photo?.large || photo?.medium)
      .filter(Boolean) as string[];

    if (toPreload.length > 0) {
      Image.prefetch(toPreload);
    }
  }, [currentIndex, dogs]);

  const handleSwipeComplete = useCallback(
    async (direction: 'left' | 'right') => {
      const dog = dogs[currentIndex];
      if (!dog) return;

      // Reset shared values FIRST so the next card renders clean
      translateX.value = 0;
      translateY.value = 0;

      // Then advance the index
      setCurrentIndex(currentIndex + 1);

      // Add to local store immediately so liked tab always has the dog
      if (direction === 'right') {
        addLikedDog(dog);
        triggerMatch(dog);
      }

      // Save to backend in background — don't block on this
      api.post('/swipes', { dog_id: dog.id, direction }).catch(() => {});
    },
    [dogs, currentIndex]
  );

  const animateSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const targetX = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
      translateX.value = withTiming(targetX, { duration: 300 }, (finished) => {
        if (finished) runOnJS(handleSwipeComplete)(direction);
      });
    },
    [handleSwipeComplete]
  );

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.3;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH + 100, { duration: 250 }, (finished) => {
          if (finished) runOnJS(handleSwipeComplete)('right');
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH - 100, { duration: 250 }, (finished) => {
          if (finished) runOnJS(handleSwipeComplete)('left');
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-15, 0, 15],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SCREEN_WIDTH * 0.2],
      [0, 0.2],
      Extrapolation.CLAMP
    ),
  }));

  const nopeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SCREEN_WIDTH * 0.2, 0],
      [0.2, 0],
      Extrapolation.CLAMP
    ),
  }));

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SCREEN_WIDTH * 0.25],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SCREEN_WIDTH * 0.25, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // Loading state
  if (isLoading && dogs.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.skeleton}>
          <View style={styles.skeletonShimmer} />
        </View>
        <Text style={styles.loadingText}>Finding dogs near you...</Text>
      </View>
    );
  }

  // Empty state
  if (dogs.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="paw" size={64} color={colors.border} />
        <Text style={styles.emptyTitle}>No dogs found</Text>
        <Text style={styles.emptySubtitle}>Check back soon for new arrivals!</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchDogs}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Deck exhausted
  if (currentIndex >= dogs.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🐾</Text>
        <Text style={styles.emptyTitle}>You've seen them all!</Text>
        <Text style={styles.emptySubtitle}>Check back later for new dogs</Text>
        <TouchableOpacity
          style={styles.viewLikedButton}
          onPress={() => router.push('/(tabs)/liked')}
        >
          <Ionicons name="heart" size={18} color="#fff" />
          <Text style={styles.viewLikedText}>View Liked Dogs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchDogs}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentDog = dogs[currentIndex];
  const nextDog = dogs[currentIndex + 1];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Fetch</Text>
      </View>

      {/* Card Stack */}
      <View style={styles.cardContainer}>
        {/* Next card (behind) */}
        {nextDog && (
          <View style={[styles.cardWrapper, { transform: [{ scale: 0.95 }] }]}>
            <DogCard key={nextDog.id} dog={nextDog} />
          </View>
        )}

        {/* Current card (on top, draggable) */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.cardWrapper, cardStyle]}>
            {/* Green tint overlay (like) */}
            <Animated.View
              style={[styles.colorOverlay, { backgroundColor: '#4CAF50' }, likeOverlayStyle]}
              pointerEvents="none"
            />

            {/* Red tint overlay (nope) */}
            <Animated.View
              style={[styles.colorOverlay, { backgroundColor: '#F44336' }, nopeOverlayStyle]}
              pointerEvents="none"
            />

            {/* LIKE stamp */}
            <Animated.View style={[styles.stamp, styles.likeStamp, likeStampStyle]}>
              <Text style={styles.likeText}>LIKE</Text>
            </Animated.View>

            {/* NOPE stamp */}
            <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStampStyle]}>
              <Text style={styles.nopeText}>NOPE</Text>
            </Animated.View>

            <DogCard
              key={currentDog.id}
              dog={currentDog}
              onPress={() => router.push(`/dog/${currentDog.id}`)}
            />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={() => animateSwipe('left')}
        >
          <Ionicons name="close" size={32} color={colors.error} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={() => animateSwipe('right')}
        >
          <Ionicons name="heart" size={32} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Match Celebration */}
      {showMatchCelebration && <MatchCelebration />}
    </View>
  );
}

const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = CARD_WIDTH * 1.3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    alignItems: 'center',
  },
  logo: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
  },
  colorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    zIndex: 5,
  },
  stamp: {
    position: 'absolute',
    top: 50,
    zIndex: 10,
    borderWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    transform: [{ rotate: '-20deg' }],
  },
  likeStamp: {
    left: 20,
    borderColor: colors.success,
  },
  nopeStamp: {
    right: 20,
    borderColor: colors.error,
    transform: [{ rotate: '20deg' }],
  },
  likeText: {
    fontSize: 32,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.success,
  },
  nopeText: {
    fontSize: 32,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.error,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingBottom: 24,
    paddingTop: 12,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  passButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.error,
  },
  likeButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  skeleton: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  skeletonShimmer: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
    fontFamily: 'Nunito_600SemiBold',
  },
  emptyEmoji: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: 'Nunito_400Regular',
    marginTop: 8,
  },
  viewLikedButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewLikedText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
  },
  refreshButton: {
    marginTop: 16,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  refreshText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
});
