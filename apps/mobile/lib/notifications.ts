import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api';

const STORED_PUSH_TOKEN_KEY = 'slugswap:expo-push-token:v1';
const PUSH_TOKEN_TIMEOUT_MS = 15_000;
let handlerConfigured = false;
let pushRegistrationPromise: Promise<RegistrationResult> | null = null;

type RegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'failed'; message: string };

function getProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to configure notifications';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function registerForPushAsync(
  Notifications: typeof import('expo-notifications'),
  projectId: string
): Promise<RegistrationResult> {
  if (pushRegistrationPromise) return pushRegistrationPromise;

  const registration = (async (): Promise<RegistrationResult> => {
    try {
      const expoToken = await withTimeout(
        Notifications.getExpoPushTokenAsync({ projectId }),
        PUSH_TOKEN_TIMEOUT_MS,
        'Notification setup took too long. Check your connection and try again.'
      );
      await registerPushToken(expoToken.data, Platform.OS as 'ios' | 'android');
      await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, expoToken.data);
      return { status: 'registered', token: expoToken.data };
    } catch (error) {
      return { status: 'failed', message: messageFromError(error) };
    }
  })().finally(() => {
    if (pushRegistrationPromise === registration) {
      pushRegistrationPromise = null;
    }
  });

  pushRegistrationPromise = registration;
  return registration;
}

function notificationsAreAllowed(
  permissions: Awaited<ReturnType<typeof import('expo-notifications').getPermissionsAsync>>,
  Notifications: typeof import('expo-notifications')
): boolean {
  const iosStatus = permissions.ios?.status;
  return (
    permissions.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

export async function configureNotificationHandlingAsync(): Promise<void> {
  if (Platform.OS === 'web' || handlerConfigured) return;

  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('donor-updates', {
      name: 'Donor updates',
      description: 'Updates when donated SlugPoints help another student',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E84C4',
    });
  }

  handlerConfigured = true;
}

async function getPushTokenAsync(requestPermission: boolean): Promise<RegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { status: 'unsupported' };
  }

  try {
    await configureNotificationHandlingAsync();
    const Notifications = await import('expo-notifications');
    let permissions = await Notifications.getPermissionsAsync();

    if (!notificationsAreAllowed(permissions, Notifications) && requestPermission) {
      permissions = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
    }

    if (!notificationsAreAllowed(permissions, Notifications)) {
      return { status: 'denied' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { status: 'failed', message: 'EAS project ID is missing' };
    }

    return await registerForPushAsync(Notifications, projectId);
  } catch (error) {
    return { status: 'failed', message: messageFromError(error) };
  }
}

export function enablePushNotificationsAsync(): Promise<RegistrationResult> {
  return getPushTokenAsync(true);
}

export async function syncExistingPushRegistrationAsync(): Promise<boolean> {
  const storedToken = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  if (!storedToken) return false;

  const result = await getPushTokenAsync(false);
  return result.status === 'registered';
}

export async function unregisterStoredPushTokenAsync(): Promise<void> {
  const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  if (!token) return;

  await unregisterPushToken(token);
  await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
}

export async function clearStoredPushTokenAsync(): Promise<void> {
  await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
}

export async function scheduleNotificationPreviewAsync(
  title: string,
  body: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  await configureNotificationHandlingAsync();
  const Notifications = await import('expo-notifications');
  let permissions = await Notifications.getPermissionsAsync();
  if (!notificationsAreAllowed(permissions, Notifications)) {
    permissions = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  }
  if (!notificationsAreAllowed(permissions, Notifications)) {
    throw new Error('Notification permission was not granted');
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { kind: 'donor_spend_preview' },
    },
    trigger: null,
  });
}
