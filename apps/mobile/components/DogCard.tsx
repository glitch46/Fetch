// DogCard component — owned by Mobile Agent (implementation)
// Dog card with photo/video gallery, match score badge, gradient scrim

import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import type { Dog, DogPhoto, DogVideo } from '@fetch/shared';
import { colors } from '../constants/colors';
import { cleanText } from '../utils/cleanText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = CARD_WIDTH * 1.3;

// Warm amber blurhash placeholder — matches brand palette
const BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

type MediaItem =
  | { type: 'photo'; data: DogPhoto }
  | { type: 'video'; data: DogVideo };

interface DogCardProps {
  dog: Dog;
  onPress?: () => void;
}

export default function DogCard({ dog, onPress }: DogCardProps) {
  const [mediaIndex, setMediaIndex] = useState(0);
  const videoRef = useRef<Video>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Build combined media list: photos first, then videos
  const media: MediaItem[] = [
    ...(dog.photos || []).map((p) => ({ type: 'photo' as const, data: p })),
    ...(dog.videos || []).map((v) => ({ type: 'video' as const, data: v })),
  ];

  const currentMedia = media[mediaIndex] || null;
  const currentPhotoUrl = currentMedia?.type === 'photo'
    ? (currentMedia.data.large || currentMedia.data.medium || currentMedia.data.small)
    : null;

  const handleTap = useCallback(
    (locationX: number) => {
      if (media.length <= 1) {
        onPress?.();
        return;
      }
      // Multi-media: left/right edges cycle, middle opens profile
      if (locationX > CARD_WIDTH * 0.67) {
        setMediaIndex((i) => (i + 1) % media.length);
      } else if (locationX < CARD_WIDTH * 0.33) {
        setMediaIndex((i) => (i - 1 + media.length) % media.length);
      } else {
        onPress?.();
      }
    },
    [media.length, onPress]
  );

  // Reset video playback when media index changes to a different item
  const handleMediaChange = useCallback(
    (newIndex: number) => {
      setMediaIndex(newIndex);
      setVideoReady(false);
    },
    []
  );

  const matchLabel = dog.match_score
    ? `${dog.match_score}% Match`
    : dog.days_in_shelter != null && dog.days_in_shelter <= 7
      ? 'New Arrival'
      : null;

  const totalMediaCount = media.length;
  const photoCountForBadge =
    (dog.photos?.length || 0) + (dog.videos?.length || 0);

  return (
    <Pressable
      style={styles.card}
      onPress={(e) => handleTap(e.nativeEvent.locationX)}
    >
      {/* Render current media */}
      {currentMedia?.type === 'video' ? (
        <Video
          ref={videoRef}
          source={{ uri: currentMedia.data.url }}
          style={styles.photo}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isMuted
          isLooping
          usePoster
          posterSource={currentMedia.data.thumbnail ? { uri: currentMedia.data.thumbnail } : undefined}
          posterStyle={styles.photo}
          onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
            if (!status.isLoaded) return;
            setVideoReady(true);
          }}
        />
      ) : currentPhotoUrl ? (
        <Image
          source={{ uri: currentPhotoUrl }}
          style={styles.photo}
          contentFit="cover"
          contentPosition="top"
          transition={150}
          placeholder={{ blurhash: BLURHASH }}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Text style={styles.noPhotoText}>No Photo</Text>
        </View>
      )}

      {/* Video indicator */}
      {currentMedia?.type === 'video' && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶ VIDEO</Text>
        </View>
      )}

      {/* Media indicator segments */}
      {totalMediaCount > 1 && (
        <View style={styles.progressBar}>
          {media.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                i === mediaIndex && styles.progressActive,
                media[i]?.type === 'video' && styles.progressVideo,
              ]}
            />
          ))}
        </View>
      )}

      {/* Match score badge */}
      {matchLabel && (
        <View style={styles.matchBadge}>
          <Text style={styles.matchText}>{matchLabel} 🐾</Text>
        </View>
      )}

      {/* Bottom gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.gradient}
      >
        <Text style={styles.name}>{cleanText(dog.name)}</Text>
        <Text style={styles.details}>
          {cleanText(dog.breed_primary) || 'Mixed Breed'}
          {dog.breed_secondary ? ` / ${cleanText(dog.breed_secondary)}` : ''}
        </Text>
        <View style={styles.badges}>
          {dog.age && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{dog.age}</Text>
            </View>
          )}
          {dog.size && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{dog.size}</Text>
            </View>
          )}
          {dog.gender && dog.gender !== 'Unknown' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{dog.gender}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  noPhoto: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  noPhotoText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Nunito_600SemiBold',
  },
  videoBadge: {
    position: 'absolute',
    top: 10,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
  },
  progressBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  progressActive: {
    backgroundColor: '#fff',
  },
  progressVideo: {
    // Currently inactive segment for a video — no special style needed yet
    // but keeping the selector for potential future visual differentiation
  },
  matchBadge: {
    position: 'absolute',
    top: 20,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  matchText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 80,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  name: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: '#fff',
    marginBottom: 4,
  },
  details: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Nunito_400Regular',
    marginBottom: 10,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
});