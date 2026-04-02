// Adopt/Foster modal — shows Animal ID before opening external application link

import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { cleanText } from '../utils/cleanText';
import type { Dog } from '@fetch/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AdoptFosterModalProps {
  visible: boolean;
  dog: Dog;
  action: 'adopt' | 'foster';
  onContinue: () => void;
  onClose: () => void;
}

export default function AdoptFosterModal({
  visible,
  dog,
  action,
  onContinue,
  onClose,
}: AdoptFosterModalProps) {
  const photoUrl = dog.photos?.[0]?.large || dog.photos?.[0]?.medium || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Dog photo + name */}
          <View style={styles.dogInfo}>
            {photoUrl && (
              <View style={styles.photoContainer}>
                <Image source={{ uri: photoUrl }} style={styles.photo} contentFit="cover" />
              </View>
            )}
            <Text style={styles.dogName}>{cleanText(dog.name)}</Text>
          </View>

          {/* Action label */}
          <Text style={styles.heading}>
            {action === 'adopt' ? 'Ready to Adopt?' : 'Interested in Fostering?'}
          </Text>

          {/* Instructions */}
          {action === 'adopt' ? (
            <Text style={styles.instructions}>
              You'll be taken to {cleanText(dog.name)}'s profile where you can start the adoption process with their shelter.
            </Text>
          ) : (
            <View style={styles.fosterSteps}>
              <Text style={styles.instructions}>
                Many shelters welcome foster families! Here's how to get started:
              </Text>
              <View style={styles.step}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <Text style={styles.stepText}>
                  Visit {cleanText(dog.name)}'s profile and tap "Ask About Me" or contact the shelter
                </Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <Text style={styles.stepText}>
                  Let them know you're interested in fostering, not just adopting
                </Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                <Text style={styles.stepText}>
                  The shelter will walk you through their foster process
                </Text>
              </View>
            </View>
          )}

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.button, action === 'adopt' ? styles.adoptButton : styles.fosterButton]}
            onPress={onContinue}
          >
            <Text style={styles.buttonText}>
              {action === 'adopt' ? 'View Adoption Listing' : 'View Profile & Inquire'}
            </Text>
            <Ionicons name="open-outline" size={18} color="#fff" />
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  dogInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  photoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
    marginBottom: 10,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  dogName: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: colors.text,
  },
  heading: {
    fontSize: 22,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.text,
    marginBottom: 16,
  },
  instructions: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  fosterSteps: {
    width: '100%',
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.text,
    lineHeight: 20,
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  adoptButton: {
    backgroundColor: colors.primary,
  },
  fosterButton: {
    backgroundColor: colors.secondary,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.textSecondary,
  },
});
