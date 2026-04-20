// Dog Profile screen — owned by Mobile Agent (implementation)
// Vertical photo/video layout interspersed with AI prompt cards

import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useDogsStore } from '../../store/useDogsStore';
import { generateDogPrompts } from '../../services/promptGeneration';
import PhotoGalleryModal from '../../components/PhotoGalleryModal';
import AdoptFosterModal from '../../components/AdoptFosterModal';
import api from '../../lib/api';
import { colors } from '../../constants/colors';
import type { Dog, DogPhoto, DogVideo } from '@fetch/shared';
import { cleanText } from '../../utils/cleanText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type PhotoItem = { data: DogPhoto; index: number };

function formatLastVerified(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function toYouTubeWatchUrl(embedUrl: string): string {
  const match = embedUrl.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (match) return `https://www.youtube.com/watch?v=${match[1]}`;
  return embedUrl;
}

function openVideoExternally(url: string) {
  Linking.openURL(toYouTubeWatchUrl(url)).catch(() => undefined);
}

const HERO_HEIGHT = SCREEN_HEIGHT * 0.55;
const INTERSPERSED_MEDIA_HEIGHT = SCREEN_HEIGHT * 0.45;

interface DogPrompt {
  prompt: string;
  response: string;
}

export default function DogProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { dogs, likedDogs } = useDogsStore();
  const scrollRef = useRef<ScrollView>(null);

  const dog = dogs.find((d) => d.id === id) || likedDogs.find((d) => d.id === id);
  const [prompts, setPrompts] = useState<DogPrompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [modalAction, setModalAction] = useState<'adopt' | 'foster' | null>(null);

  // Photos for gallery display
  const photos: PhotoItem[] = (dog?.photos || []).map((p, i) => ({ data: p, index: i }));
  // Videos — only displayed as YouTube thumbnail cards, opened externally
  const videos: DogVideo[] = dog?.videos || [];

  const heroPhoto = photos[0] || null;
  const remainingPhotos = photos.slice(1);

  function openGallery(photoIndex: number) {
    setGalleryStartIndex(photoIndex);
    setGalleryVisible(true);
  }

  useEffect(() => {
    if (!dog) return;
    let cancelled = false;

    async function loadPrompts() {
      setPromptsLoading(true);
      try {
        const result = await generateDogPrompts(dog!);
        if (!cancelled) setPrompts(result);
      } catch {
        // Graceful fallback handled by service
      } finally {
        if (!cancelled) setPromptsLoading(false);
      }
    }

    loadPrompts();
    return () => { cancelled = true; };
  }, [dog?.id]);

  if (!dog) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>Dog not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleAdoptFosterContinue() {
    const action = modalAction!;
    setModalAction(null);

    try {
      await api.post('/matches', { dog_id: dog!.id, action });
    } catch {
      // Non-blocking
    }

    let url: string | null = null;
    if (action === 'adopt') {
      url = dog!.adoption_url || null;
    } else {
      url = dog!.foster_url || 'https://www.austintexas.gov/page/foster-care-application';
    }

    if (url) {
      await WebBrowser.openBrowserAsync(url);
    }
  }

  // Build interspersed photo+prompt content for the "Get to Know Me" section
  const interspersedItems: Array<{ type: 'photo'; item: PhotoItem } | { type: 'prompt'; index: number }> = [];
  const maxItems = Math.max(remainingPhotos.length, prompts.length);
  for (let i = 0; i < maxItems; i++) {
    if (i < remainingPhotos.length) {
      interspersedItems.push({ type: 'photo', item: remainingPhotos[i] });
    }
    if (i < prompts.length) {
      interspersedItems.push({ type: 'prompt', index: i });
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* Hero Photo */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.heroContainer}
          onPress={() => photos.length > 0 && openGallery(0)}
        >
          {heroPhoto ? (
            <Image
              source={{ uri: heroPhoto.data.full || heroPhoto.data.large }}
              style={styles.heroPhoto}
              contentFit="cover"
              contentPosition="top"
              transition={200}
            />
          ) : (
            <View style={[styles.heroPhoto, styles.noPhoto]}>
              <Text style={styles.noPhotoText}>No Photo</Text>
            </View>
          )}

          {/* Photo count indicator */}
          {photos.length > 1 && (
            <View style={styles.photoCountBadge}>
              <Ionicons name="images-outline" size={14} color="#fff" />
              <Text style={styles.photoCountText}>{photos.length}</Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Identity Bar */}
        <View style={styles.identityBar}>
          <View style={styles.identityLeft}>
            <Text style={styles.dogName}>{cleanText(dog.name)}</Text>
            <Text style={styles.breedText}>
              {dog.age} · {dog.gender !== 'Unknown' ? dog.gender + ' · ' : ''}
              {cleanText(dog.breed_primary) || 'Mixed Breed'}
            </Text>
          </View>
          {dog.match_score && (
            <View style={styles.matchBadge}>
              <Text style={styles.matchBadgeText}>{dog.match_score}% Match 🐾</Text>
            </View>
          )}
        </View>

        {/* About Section */}
        {dog.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{cleanText(dog.description)}</Text>
          </View>
        )}

        {/* Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <DetailRow icon="resize" label="Size" value={dog.size} />
          <DetailRow icon="calendar-outline" label="Age" value={dog.age} />
          <DetailRow icon="male-female" label="Gender" value={dog.gender} />
          <DetailRow
            icon="paw"
            label="Breed"
            value={
              dog.breed_primary
                ? `${cleanText(dog.breed_primary)}${dog.breed_secondary ? ` / ${cleanText(dog.breed_secondary)}` : ''}`
                : 'Mixed Breed'
            }
          />
          {dog.days_in_shelter != null && (
            <DetailRow
              icon="time-outline"
              label="In Shelter"
              value={`${dog.days_in_shelter} days`}
              highlight={dog.days_in_shelter > 21}
            />
          )}
          {dog.attributes.spayed_neutered && (
            <DetailRow icon="checkmark-circle" label="Spayed/Neutered" value="Yes" />
          )}
          {dog.attributes.shots_current && (
            <DetailRow icon="medkit" label="Shots Current" value="Yes" />
          )}
          {dog.attributes.house_trained && (
            <DetailRow icon="home" label="House Trained" value="Yes" />
          )}
          {dog.last_synced_at && (
            <DetailRow
              icon="shield-checkmark-outline"
              label="Last Verified"
              value={formatLastVerified(dog.last_synced_at)}
            />
          )}
        </View>

        {/* Characteristics Section */}
        {dog.tags && dog.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Characteristics</Text>
            <View style={styles.chipGrid}>
              {dog.tags.map((tag, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Get to Know Me — media interspersed with AI prompt cards */}
        {(interspersedItems.length > 0 || promptsLoading) && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Get to Know Me</Text>
          </View>
        )}

        {promptsLoading && interspersedItems.length === 0 && (
          <View style={styles.section}>
            <View style={styles.promptCard}>
              <Text style={styles.promptLoading}>Loading personality...</Text>
            </View>
          </View>
        )}

        {interspersedItems.map((item) => {
          if (item.type === 'photo') {
            const photoItem = item.item;
            const url = photoItem.data.full || photoItem.data.large || null;
            if (!url) return null;
            return (
              <TouchableOpacity
                key={`photo-${photoItem.index}`}
                activeOpacity={0.9}
                style={styles.interspersedMediaWrapper}
                onPress={() => openGallery(photoItem.index)}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.interspersedMedia}
                  contentFit="cover"
                  contentPosition="top"
                  transition={200}
                />
              </TouchableOpacity>
            );
          } else {
            const p = prompts[item.index];
            return (
              <View key={`prompt-${item.index}`} style={styles.promptSection}>
                <View style={styles.promptCard}>
                  <Text style={styles.promptLabel}>{cleanText(p.prompt)}</Text>
                  <Text style={styles.promptResponse}>{cleanText(p.response)}</Text>
                </View>
              </View>
            );
          }
        })}

        {/* Videos Section — YouTube thumbnail cards that open externally */}
        {videos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Videos</Text>
            {videos.map((video, i) => (
              <TouchableOpacity
                key={`yt-${i}`}
                activeOpacity={0.8}
                style={styles.youtubeCard}
                onPress={() => openVideoExternally(video.url)}
              >
                {video.thumbnail ? (
                  <Image
                    source={{ uri: video.thumbnail }}
                    style={styles.youtubeThumbnail}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.youtubeThumbnail, styles.noPhoto]} />
                )}
                <View style={styles.youtubePlayOverlay}>
                  <Ionicons name="logo-youtube" size={48} color="#FF0000" />
                </View>
                <View style={styles.youtubeLabel}>
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={styles.youtubeLabelText}>Watch on YouTube</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Find Me On Section */}
        {dog.adoption_url && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Find Me On</Text>
            <TouchableOpacity
              style={styles.externalLink}
              onPress={() =>
                WebBrowser.openBrowserAsync(dog.adoption_url!)
              }
            >
              <Ionicons name="open-outline" size={20} color={colors.secondary} />
              <Text style={styles.externalLinkText}>View Full Profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacing for sticky bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.ctaButton, styles.adoptCta]}
          onPress={() => setModalAction('adopt')}
        >
          <Text style={styles.ctaText}>Adopt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctaButton, styles.fosterCta]}
          onPress={() => setModalAction('foster')}
        >
          <Text style={styles.ctaText}>Foster</Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen photo gallery (photos only, videos open via YouTube) */}
      <PhotoGalleryModal
        visible={galleryVisible}
        photos={photos.map((p) => p.data)}
        media={[]}
        initialIndex={galleryStartIndex}
        onClose={() => setGalleryVisible(false)}
      />

      {/* Adopt/Foster modal with Animal ID */}
      {modalAction && (
        <AdoptFosterModal
          visible={modalAction !== null}
          dog={dog}
          action={modalAction}
          onContinue={handleAdoptFosterContinue}
          onClose={() => setModalAction(null)}
        />
      )}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={detailStyles.row}>
      <Ionicons name={icon as any} size={20} color={colors.secondary} />
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={[detailStyles.value, highlight && detailStyles.highlighted]}>
        {highlight ? `⏳ waiting ${value}` : value}
      </Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.text,
    flex: 1,
  },
  value: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
  },
  highlighted: {
    color: colors.primary,
    fontFamily: 'Nunito_700Bold',
  },
});

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
  },
  notFound: {
    fontSize: 18,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.text,
  },
  backLink: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.secondary,
  },
  heroContainer: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    backgroundColor: colors.surface,
  },
  heroPhoto: {
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
  photoCountBadge: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  photoCountText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
  closeButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  identityLeft: {
    flex: 1,
  },
  dogName: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.text,
  },
  breedText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  matchBadge: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  matchBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
    color: colors.text,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: colors.text,
    lineHeight: 22,
  },
  interspersedMediaWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'relative',
  },
  interspersedMedia: {
    width: '100%',
    height: INTERSPERSED_MEDIA_HEIGHT,
    borderRadius: 16,
  },
  youtubeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000',
    position: 'relative',
  },
  youtubeThumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  youtubePlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  youtubeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
  },
  youtubeLabelText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
  },
  promptSection: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  promptCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
  },
  promptLabel: {
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    color: colors.secondary,
    marginBottom: 8,
  },
  promptResponse: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: colors.text,
    lineHeight: 22,
  },
  promptLoading: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.secondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
  externalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  externalLinkText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.secondary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ctaButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adoptCta: {
    backgroundColor: colors.primary,
  },
  fosterCta: {
    backgroundColor: colors.secondary,
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
  },
});