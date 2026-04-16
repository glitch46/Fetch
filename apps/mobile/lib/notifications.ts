// Push notifications — request permissions, get Expo push token, register with backend
// Called after auth to ensure the user receives match and urgent dog alerts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';
import { useAuthStore } from '../store/useAuthStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.error('[NOTIFICATIONS] Error requesting permissions:', err);
    return false;
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });
    return data;
  } catch (err) {
    // FCM not configured on Android — expected until Firebase credentials are added
    console.warn('[NOTIFICATIONS] Push token unavailable (FCM not configured):', (err as Error).message);
    return null;
  }
}

export async function registerPushToken(): Promise<boolean> {
  try {
    const isAuthenticated = useAuthStore.getState().session !== null;
    if (!isAuthenticated) return false;

    const granted = await requestNotificationPermissions();
    if (!granted) {
      console.log('[NOTIFICATIONS] Permissions not granted');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F5A623',
      });
    }

    const token = await getExpoPushToken();
    if (!token) return false;

    const res = await api.post('/notifications/token', { token });
    return res.status === 200;
  } catch (err) {
    console.error('[NOTIFICATIONS] Error registering push token:', err);
    return false;
  }
}

export async function updateNotificationSettings(
  newMatches: boolean,
  urgentDogs: boolean,
): Promise<boolean> {
  try {
    const res = await api.put('/notifications/settings', {
      new_matches: newMatches,
      urgent_dogs: urgentDogs,
    });
    return res.status === 200;
  } catch (err) {
    console.error('[NOTIFICATIONS] Error updating settings:', err);
    return false;
  }
}