// Liked Dogs screen — owned by Mobile Agent (implementation)
// Grid view of all right-swiped dogs with availability status

import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDogsStore } from '../../store/useDogsStore';
import { colors } from '../../constants/colors';
import { cleanText } from '../../utils/cleanText';
import type { Dog } from '@fetch/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 12;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

export default function LikedDogsScreen() {
  const router = useRouter();
  const { likedDogs, isLoading, fetchLikedDogs } = useDogsStore();

  useEffect(() => {
    fetchLikedDogs();
  }, []);

  const onRefresh = useCallback(() => {
    fetchLikedDogs();
  }, []);

  function renderCard({ item }: { item: Dog }) {
    const photoUrl = item.photos?.[0]?.medium || item.photos?.[0]?.large || null;
    const unavailable = item.status !== 'adoptable';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/dog/${item.id}`)}
        activeOpacity={0.8}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.cardPhoto} contentFit="cover" />
        ) : (
          <View style={[styles.cardPhoto, styles.noPhoto]}>
            <Ionicons name="paw" size={32} color={colors.border} />
          </View>
        )}

        {unavailable && (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>No Longer{'\n'}Available</Text>
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {cleanText(item.name)}
          </Text>
          {item.match_score && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{item.match_score}%</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (likedDogs.length === 0 && !isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🐾</Text>
        <Text style={styles.emptyTitle}>No liked dogs yet</Text>
        <Text style={styles.emptySubtitle}>Start swiping to find your perfect match!</Text>
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push('/(tabs)/')}
        >
          <Text style={styles.startButtonText}>Start Swiping</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Liked Dogs</Text>
        <Text style={styles.headerCount}>{likedDogs.length} dogs</Text>
      </View>

      <FlatList
        data={likedDogs}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
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
    paddingHorizontal: GRID_PADDING,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.text,
  },
  headerCount: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.textSecondary,
  },
  grid: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 24,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardPhoto: {
    width: '100%',
    height: CARD_WIDTH * 1.1,
  },
  noPhoto: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  unavailableOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CARD_WIDTH * 1.1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardName: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: colors.text,
    flex: 1,
  },
  scoreBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  scoreText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
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
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  startButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
  },
});
