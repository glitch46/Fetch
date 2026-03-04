// Verify Email screen — owned by Auth Agent
// Shown after registration, prompts user to check their email for verification link

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resendVerificationEmail, signOut, getSession } from '../../lib/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { session, setEmailVerified } = useAuthStore();
  const [isResending, setIsResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);

  const userEmail = session?.user?.email || '';

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Poll for email verification status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email_confirmed_at) {
          setEmailVerified(true);
          // Refresh session to get updated JWT with email_confirmed_at
          await supabase.auth.refreshSession();
          // AuthGuard will redirect to main app
        }
      } catch {
        // Silently fail — will try again on next interval
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  async function handleResendEmail() {
    if (cooldownRemaining > 0 || !userEmail) return;

    setIsResending(true);
    try {
      await resendVerificationEmail(userEmail);
      setCooldownRemaining(RESEND_COOLDOWN_SECONDS);
      Alert.alert('Email sent', 'A new verification link has been sent to your email.');
    } catch {
      Alert.alert('Error', 'Failed to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  }

  async function handleCheckVerification() {
    setIsCheckingVerification(true);
    try {
      // Refresh the session to get updated user data
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      if (data.session?.user?.email_confirmed_at) {
        setEmailVerified(true);
        // AuthGuard will redirect to main app
      } else {
        Alert.alert(
          'Not yet verified',
          'Your email has not been verified yet. Please check your inbox and click the verification link.'
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to check verification status. Please try again.');
    } finally {
      setIsCheckingVerification(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      // Force reset even if signOut fails
      useAuthStore.getState().reset();
      router.replace('/(auth)/login');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Email Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="mail-outline" size={64} color={colors.primary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Check your email</Text>

        {/* Description */}
        <Text style={styles.description}>
          We've sent a verification link to:
        </Text>
        <Text style={styles.email}>{userEmail}</Text>
        <Text style={styles.description}>
          Click the link in the email to verify your account and start finding your pawfect match.
        </Text>

        {/* Check Verification Button */}
        <TouchableOpacity
          style={styles.checkButton}
          onPress={handleCheckVerification}
          disabled={isCheckingVerification}
        >
          {isCheckingVerification ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.checkButtonText}>I've verified my email</Text>
          )}
        </TouchableOpacity>

        {/* Resend Email */}
        <TouchableOpacity
          style={[styles.resendButton, (cooldownRemaining > 0 || isResending) && styles.buttonDisabled]}
          onPress={handleResendEmail}
          disabled={cooldownRemaining > 0 || isResending}
        >
          {isResending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.resendButtonText}>
              {cooldownRemaining > 0
                ? `Resend in ${cooldownRemaining}s`
                : 'Resend verification email'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign Out Link */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  email: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginVertical: 8,
  },
  checkButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 32,
  },
  checkButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  resendButton: {
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  resendButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  signOutButton: {
    marginTop: 24,
    padding: 8,
  },
  signOutText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
