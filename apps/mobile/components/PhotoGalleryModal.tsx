// Full-screen media gallery modal — photos and YouTube videos
// Swipe left/right to browse, tap to close

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { DogPhoto, DogVideo } from '@fetch/shared';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type GalleryMediaItem =
  | { type: 'photo'; data: DogPhoto }
  | { type: 'video'; data: DogVideo };

interface PhotoGalleryModalProps {
  visible: boolean;
  media: GalleryMediaItem[];
  initialIndex?: number;
  onClose: () => void;
  photos?: DogPhoto[];
}

export default function PhotoGalleryModal({
  visible,
  media,
  initialIndex = 0,
  onClose,
  photos,
}: PhotoGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<GalleryMediaItem>>(null);

  const effectiveMedia: GalleryMediaItem[] = media.length > 0
    ? media
    : (photos || []).map((p) => ({ type: 'photo' as const, data: p }));

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [],
  );

  useEffect(() => {
    if (!visible) return;
    const safeIndex = Math.max(0, Math.min(initialIndex, effectiveMedia.length - 1));
    setCurrentIndex(safeIndex);
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, initialIndex, effectiveMedia.length]);

  const renderItem = useCallback(
    ({ item }: { item: GalleryMediaItem }) => {
      if (item.type === 'video') {
        return (
          <VideoSlide
            url={item.data.url}
            thumbnail={item.data.thumbnail || null}
          />
        );
      }

      const uri = item.data.full || item.data.large || item.data.medium || item.data.small;
      return (
        <View style={styles.slide}>
          <Image
            source={{ uri }}
            style={styles.fullImage}
            contentFit="contain"
            transition={150}
          />
        </View>
      );
    },
    [],
  );

  if (effectiveMedia.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Media counter */}
        {effectiveMedia.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {effectiveMedia.length}
            </Text>
          </View>
        )}

        {/* Swipeable media list */}
        <FlatList
          ref={listRef}
          data={effectiveMedia}
          renderItem={renderItem}
          keyExtractor={(_, i) => `gallery-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, effectiveMedia.length - 1)}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          onScrollToIndexFailed={() => undefined}
        />

        {/* Dot indicators */}
        {effectiveMedia.length > 1 && (
          <View style={styles.dots}>
            {effectiveMedia.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                  item.type === 'video' && styles.dotVideo,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

function toPlayableVideoUrl(url: string) {
  const match = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (!match) return url;
  return `https://www.youtube.com/watch?v=${match[1]}`;
}

function VideoSlide({ url, thumbnail }: { url: string; thumbnail: string | null }) {
  const playableUrl = toPlayableVideoUrl(url);

  return (
    <View style={styles.slide}>
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={styles.videoPoster}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <View style={styles.videoPosterFallback} />
      )}

      <View style={styles.videoFallback}>
        <Ionicons name="logo-youtube" size={48} color="#fff" />
        <Text style={styles.videoFallbackText}>Open video in YouTube</Text>
        <TouchableOpacity
          style={styles.videoFallbackButton}
          onPress={() => {
            Linking.openURL(playableUrl).catch(() => undefined);
          }}
        >
          <Text style={styles.videoFallbackButtonText}>Play Video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  counterText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  videoPoster: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
    opacity: 0.7,
  },
  videoPosterFallback: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dots: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotVideo: {
    backgroundColor: 'rgba(26, 127, 116, 0.6)',
  },
  videoFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  videoFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
  },
  videoFallbackButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  videoFallbackButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
  },
});
