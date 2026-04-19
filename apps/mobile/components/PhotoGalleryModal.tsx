// Full-screen photo gallery modal — photos only
// Videos are opened externally via Linking (handled by the caller)
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

  // Only show photos — videos should never arrive here, but filter defensively
  const effectiveMedia: GalleryMediaItem[] = (
    media.length > 0
      ? media
      : (photos || []).map((p) => ({ type: 'photo' as const, data: p }))
  ).filter((m) => m.type === 'photo');

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
      if (item.type !== 'photo') return null;
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

        {/* Photo counter */}
        {effectiveMedia.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {effectiveMedia.length}
            </Text>
          </View>
        )}

        {/* Swipeable photo list */}
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
            {effectiveMedia.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
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
});
