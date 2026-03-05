// Adopt/Foster modal — shows Animal ID before opening external application link

import { useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
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
  const [copied, setCopied] = useState(false);

  const photoUrl = dog.photos?.[0]?.large || dog.photos?.[0]?.medium || null;
  const animalId = dog.petfinder_id;

  async function handleCopy() {
    await Clipboard.setStringAsync(animalId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
            {action === 'adopt' ? 'Ready to Adopt?' : 'Ready to Foster?'}
          </Text>

          {/* Animal ID */}
          <View style={styles.idContainer}>
            <Text style={styles.idLabel}>Animal ID</Text>
            <Text style={styles.idValue}>{animalId}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={18}
                color={copied ? colors.success : colors.secondary}
              />
              <Text style={[styles.copyText, copied && { color: colors.success }]}>
                {copied ? 'Copied!' : 'Copy ID'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <Text style={styles.instructions}>
            {action === 'adopt'
              ? 'You will be taken to this dog\'s adoption listing where you can start the adoption process.'
              : 'Make sure to include this Animal ID in your foster application so the shelter knows which dog you\'re interested in.'}
          </Text>

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.button, action === 'adopt' ? styles.adoptButton : styles.fosterButton]}
            onPress={onContinue}
          >
            <Text style={styles.buttonText}>
              {action === 'adopt' ? 'View Adoption Listing' : 'Open Foster Application'}
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
  idContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  idLabel: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  idValue: {
    fontSize: 28,
    fontFamily: 'Nunito_800ExtraBold',
    color: colors.secondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  copyText: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.secondary,
  },
  instructions: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
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
