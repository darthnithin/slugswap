import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export async function registerNativePushToken(projectId: string): Promise<{
  token: string;
  platform: 'ios' | 'android';
}> {
  if (!Device.isDevice) {
    throw new Error('Push notifications require a physical device.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Notifications permission denied.');
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return {
    token: token.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}
