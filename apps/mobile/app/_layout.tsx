import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../../../lib/auth-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { getMobileAppConfig } from '../../../lib/api';
import { uiColor } from '../lib/ui-color';

type RequiredUpdateGate = {
  installedVersion: string;
  requiredVersion: string;
  storeUrl: string | null;
};

type ExpoUpdatesModule = {
  isEnabled?: boolean;
  checkForUpdateAsync?: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync?: () => Promise<unknown>;
  reloadAsync?: () => Promise<void>;
};

function parseVersionParts(version: string): number[] | null {
  const trimmed = version.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.').map((part) => Number(part));
  if (!parts.length || parts.some((part) => Number.isNaN(part) || part < 0)) {
    return null;
  }

  return parts;
}

function compareVersions(installed: string, required: string): number | null {
  const installedParts = parseVersionParts(installed);
  const requiredParts = parseVersionParts(required);

  if (!installedParts || !requiredParts) return null;

  const maxLength = Math.max(installedParts.length, requiredParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const installedValue = installedParts[index] ?? 0;
    const requiredValue = requiredParts[index] ?? 0;
    if (installedValue > requiredValue) return 1;
    if (installedValue < requiredValue) return -1;
  }

  return 0;
}

function getInstalledAppVersion(): string {
  const nativeVersion = Constants.nativeAppVersion?.trim();
  if (nativeVersion) return nativeVersion;

  const expoConfigVersion = Constants.expoConfig?.version?.trim();
  if (expoConfigVersion) return expoConfigVersion;

  return '0.0.0';
}

async function loadExpoUpdatesModule(): Promise<ExpoUpdatesModule | null> {
  try {
    return (await import('expo-updates')) as ExpoUpdatesModule;
  } catch {
    return null;
  }
}

export default function RootLayout() {
  const [requiredUpdateGate, setRequiredUpdateGate] = useState<RequiredUpdateGate | null>(null);
  const updateCheckInFlightRef = useRef(false);
  const otaPromptShownRef = useRef(false);
  const updatesModuleMissingLoggedRef = useRef(false);

  const checkRequiredNativeUpdate = useCallback(async (): Promise<boolean> => {
    try {
      const installedVersion = getInstalledAppVersion();
      const config = await getMobileAppConfig();
      const requiredVersion =
        Platform.OS === 'android'
          ? config.updatePolicy.androidRequiredVersion
          : config.updatePolicy.iosRequiredVersion;
      const storeUrl =
        Platform.OS === 'android'
          ? config.updatePolicy.androidStoreUrl
          : config.updatePolicy.iosStoreUrl;

      const comparison = compareVersions(installedVersion, requiredVersion);
      if (comparison === null) {
        console.error('Skipping native update gate due to invalid version values', {
          installedVersion,
          requiredVersion,
        });
        setRequiredUpdateGate(null);
        return false;
      }

      if (comparison < 0) {
        setRequiredUpdateGate({
          installedVersion,
          requiredVersion,
          storeUrl,
        });
        return true;
      }

      setRequiredUpdateGate(null);
      return false;
    } catch (error) {
      // Fail open if policy endpoint is unavailable.
      console.error('Failed to load native update policy:', error);
      setRequiredUpdateGate(null);
      return false;
    }
  }, []);

  const checkOtaUpdate = useCallback(async () => {
    if (__DEV__) return;

    const updates = await loadExpoUpdatesModule();
    if (!updates) {
      if (!updatesModuleMissingLoggedRef.current) {
        updatesModuleMissingLoggedRef.current = true;
        console.warn('expo-updates native module unavailable; OTA checks disabled.');
      }
      return;
    }

    if (!updates.isEnabled) {
      return;
    }

    if (
      typeof updates.checkForUpdateAsync !== 'function' ||
      typeof updates.fetchUpdateAsync !== 'function' ||
      typeof updates.reloadAsync !== 'function'
    ) {
      return;
    }

    const result = await updates.checkForUpdateAsync();
    if (!result.isAvailable) {
      return;
    }

    await updates.fetchUpdateAsync();

    if (otaPromptShownRef.current) {
      return;
    }
    otaPromptShownRef.current = true;

    Alert.alert('Update ready', 'A new update is available. Restart now to apply it?', [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Restart',
        onPress: () => {
          void updates.reloadAsync!();
        },
      },
    ]);
  }, []);

  const runUpdateChecks = useCallback(async () => {
    if (updateCheckInFlightRef.current) return;
    updateCheckInFlightRef.current = true;

    try {
      const isBlocked = await checkRequiredNativeUpdate();
      if (!isBlocked) {
        await checkOtaUpdate();
      }
    } finally {
      updateCheckInFlightRef.current = false;
    }
  }, [checkRequiredNativeUpdate, checkOtaUpdate]);

  useEffect(() => {
    console.log('Environment check:');
    console.log('SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('SUPABASE_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
    console.log('API_URL:', process.env.EXPO_PUBLIC_API_URL || 'MISSING (using fallback)');

    void runUpdateChecks();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runUpdateChecks();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [runUpdateChecks]);

  const openStoreLink = useCallback(async () => {
    if (!requiredUpdateGate?.storeUrl) {
      Alert.alert('Update required', 'Please update the app from TestFlight or the app store.');
      return;
    }

    try {
      await Linking.openURL(requiredUpdateGate.storeUrl);
    } catch (error) {
      console.error('Failed to open update URL:', error);
      Alert.alert('Update required', 'Unable to open update link. Please update manually.');
    }
  }, [requiredUpdateGate]);

  const modalBgColor = Platform.OS === 'ios' ? uiColor('systemBackground') : '#1f1f1f';
  const labelColor = Platform.OS === 'ios' ? uiColor('label') : '#ffffff';
  const secondaryColor = Platform.OS === 'ios' ? uiColor('secondaryLabel') : '#b7b7b7';

  try {
    return (
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/sign-in" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="(tabs)" />
        </Stack>

        <Modal
          animationType="fade"
          transparent
          statusBarTranslucent
          visible={!!requiredUpdateGate}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: 24,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
            }}
          >
            <View
              style={{
                backgroundColor: modalBgColor,
                borderRadius: 16,
                padding: 20,
                gap: 12,
              }}
            >
              <Text selectable style={{ fontSize: 22, fontWeight: '700', color: labelColor }}>
                Update required
              </Text>
              <Text selectable style={{ fontSize: 14, color: secondaryColor }}>
                Your app version is no longer supported.
              </Text>
              <Text selectable style={{ fontSize: 14, color: secondaryColor }}>
                Installed: {requiredUpdateGate?.installedVersion ?? 'unknown'}
              </Text>
              <Text selectable style={{ fontSize: 14, color: secondaryColor }}>
                Required: {requiredUpdateGate?.requiredVersion ?? 'unknown'}+
              </Text>

              <Pressable
                onPress={() => {
                  void openStoreLink();
                }}
                style={{
                  marginTop: 8,
                  borderRadius: 12,
                  backgroundColor: '#0a84ff',
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text selectable style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>
                  Update now
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </AuthProvider>
    );
  } catch (error) {
    console.error('Error in RootLayout:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', marginBottom: 10 }}>Error loading app:</Text>
        <Text>{String(error)}</Text>
      </View>
    );
  }
}
