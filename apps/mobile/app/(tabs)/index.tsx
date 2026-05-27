// Swipe Deck screen — owned by Mobile Agent (implementation)
// Primary screen: card stack with reanimated gestures for browsing adoptable dogs

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDogsStore } from '../../store/useDogsStore';
import DogCard from '../../components/DogCard';
import MatchCelebration from '../../components/MatchCelebration';
import api from '../../lib/api';
import { colors } from '../../constants/colors';
import type { Dog } from '@fetch/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const TUTORIAL_STORAGE_KEY = 'fetch.swipeTutorial.seen';
const TUTORIAL_IDLE_DELAY_MS = 5000;
const TUTORIAL_DISTANCE = SCREEN_WIDTH * 0.34;

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
  const insets = useSafeAreaInsets();
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialLabel, setTutorialLabel] = useState('');
  const [showTutorialTap, setShowTutorialTap] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tutorialTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortTapCountRef = useRef(0);
  const tutorialActiveRef = useRef(false);
  const tutorialSeenRef = useRef(false);
  const tutorialOverlayOpacity = useSharedValue(0);
  const tutorialTextOpacity = useSharedValue(0);
  const tutorialTapOpacity = useSharedValue(0);
  const tutorialTapScale = useSharedValue(1);

  const canShowTutorial = dogs.length > 0 && currentIndex < dogs.length && !isLoading;

  const tutorialOverlayStyle = useAnimatedStyle(() => ({
    opacity: tutorialOverlayOpacity.value,
  }));

  const tutorialTextStyle = useAnimatedStyle(() => ({
    opacity: tutorialTextOpacity.value,
  }));

  const tutorialTapStyle = useAnimatedStyle(() => ({
    opacity: tutorialTapOpacity.value,
    transform: [{ scale: tutorialTapScale.value }],
  }));

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearTutorialTimers = useCallback(() => {
    tutorialTimersRef.current.forEach((timer) => clearTimeout(timer));
    tutorialTimersRef.current = [];
  }, []);

  const endTutorial = useCallback(() => {
    clearTutorialTimers();
    cancelAnimation(tutorialTapScale);
    tutorialTextOpacity.value = withTiming(0, { duration: 220 });
    tutorialTapOpacity.value = withTiming(0, { duration: 180 });
    tutorialTapScale.value = withTiming(1, { duration: 180 });
    translateX.value = withTiming(0, { duration: 320 });
    translateY.value = withTiming(0, { duration: 320 });
    tutorialOverlayOpacity.value = withTiming(0, { duration: 320 });

    const timer = setTimeout(() => {
      tutorialActiveRef.current = false;
      abortTapCountRef.current = 0;
      setShowTutorialTap(false);
      setTutorialLabel('');
      setTutorialActive(false);
    }, 340);
    tutorialTimersRef.current.push(timer);
  }, [clearTutorialTimers, tutorialOverlayOpacity, tutorialTapOpacity, tutorialTapScale, tutorialTextOpacity, translateX, translateY]);

  const startTutorial = useCallback(() => {
    if (!canShowTutorial || tutorialActiveRef.current || tutorialSeenRef.current) return;

    tutorialSeenRef.current = true;
    AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true').catch(() => undefined);
    clearIdleTimer();
    clearTutorialTimers();
    tutorialActiveRef.current = true;
    abortTapCountRef.current = 0;
    setTutorialActive(true);
    setShowTutorialTap(false);
    translateY.value = 0;
    tutorialOverlayOpacity.value = withTiming(0.58, { duration: 320 });

    setTutorialLabel('Swipe Left to Pass');
    tutorialTextOpacity.value = withTiming(1, { duration: 350 });
    translateX.value = withTiming(-TUTORIAL_DISTANCE, { duration: 850 });

    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      tutorialTimersRef.current.push(timer);
    };

    schedule(() => {
      tutorialTextOpacity.value = withTiming(0, { duration: 220 });
      translateX.value = withTiming(0, { duration: 450 });
    }, 1400);

    schedule(() => {
      setTutorialLabel('Swipe Right to Match!');
      tutorialTextOpacity.value = withTiming(1, { duration: 350 });
      translateX.value = withTiming(TUTORIAL_DISTANCE, { duration: 850 });
    }, 1950);

    schedule(() => {
      tutorialTextOpacity.value = withTiming(0, { duration: 220 });
      translateX.value = withTiming(0, { duration: 450 });
    }, 3350);

    schedule(() => {
      setTutorialLabel('Click on Center of the Card to Show Full Profile');
      setShowTutorialTap(true);
      tutorialTextOpacity.value = withTiming(1, { duration: 350 });
      tutorialTapOpacity.value = withTiming(1, { duration: 250 });
      tutorialTapScale.value = withRepeat(withTiming(1.18, { duration: 650 }), -1, true);
    }, 3900);

    schedule(endTutorial, 5800);
  }, [canShowTutorial, clearIdleTimer, clearTutorialTimers, endTutorial, tutorialOverlayOpacity, tutorialTapOpacity, tutorialTapScale, tutorialTextOpacity, translateX, translateY]);

  const scheduleIdleTutorial = useCallback(() => {
    clearIdleTimer();
    if (!canShowTutorial || tutorialActiveRef.current || tutorialSeenRef.current) return;
    idleTimerRef.current = setTimeout(startTutorial, TUTORIAL_IDLE_DELAY_MS);
  }, [canShowTutorial, clearIdleTimer, startTutorial]);

  const handleScreenTouch = useCallback(() => {
    if (!tutorialActiveRef.current) {
      scheduleIdleTutorial();
    }
  }, [scheduleIdleTutorial]);

  const handleTutorialPress = useCallback(() => {
    abortTapCountRef.current += 1;
    if (abortTapCountRef.current >= 2) {
      endTutorial();
    }
  }, [endTutorial]);

  const fetchDogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get('/dogs', { params: { limit: 50 } });
      if (response?.data?.items) {
        const items = response.data.items.map((dog: Dog) => ({
          ...dog,
          name: dog.name.replace(/^\*+/, '').trim(),
          photos: typeof dog.photos === 'string' ? JSON.parse(dog.photos) : dog.photos,
          videos: typeof dog.videos === 'string' ? JSON.parse(dog.videos as string) : dog.videos,
        }));
        setDogs(items);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('[DOGS] Failed to fetch dogs:', err);
      setDogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDogs();
  }, [fetchDogs]);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_STORAGE_KEY).then((seen) => {
      if (seen === 'true') {
        tutorialSeenRef.current = true;
      } else {
        scheduleIdleTutorial();
      }
    }).catch(() => {
      scheduleIdleTutorial();
    });
    return clearIdleTimer;
  }, [scheduleIdleTutorial, clearIdleTimer]);

  useEffect(() => {
    return () => {
      clearIdleTimer();
      clearTutorialTimers();
    };
  }, [clearIdleTimer, clearTutorialTimers]);

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
    <View style={styles.container} onTouchStart={handleScreenTouch}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('../../assets/NewLogo2.png')} style={styles.logo} contentFit="contain" />
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
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 24) }]}>
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

      {tutorialActive && (
        <Pressable style={styles.tutorialLayer} onPress={handleTutorialPress}>
          <Animated.View style={[styles.tutorialScrim, tutorialOverlayStyle]} />
          <Animated.View pointerEvents="none" style={[styles.tutorialMessage, tutorialTextStyle]}>
            <Text style={styles.tutorialText}>{tutorialLabel}</Text>
            <Text style={styles.tutorialHint}>Tap twice to skip</Text>
          </Animated.View>
          {showTutorialTap && (
            <Animated.View pointerEvents="none" style={[styles.tapIndicator, tutorialTapStyle]}>
              <View style={styles.tapRing} />
              <View style={styles.tapHand}>
                <Ionicons name="hand-left-outline" size={34} color={colors.white} />
              </View>
            </Animated.View>
          )}
        </Pressable>
      )}
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
    width: 160,
    height: 64,
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
  tutorialLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  tutorialScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#4A4A4A',
  },
  tutorialMessage: {
    position: 'absolute',
    top: '18%',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  tutorialText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
    fontFamily: 'Nunito_800ExtraBold',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tutorialHint: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
  tapIndicator: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    width: 86,
    height: 86,
    marginLeft: -43,
    marginTop: -43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapRing: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tapHand: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
});
