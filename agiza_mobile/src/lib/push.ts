/**
 * Expo push notifications. Registration needs a development/release build with an EAS
 * project id and (Android) FCM credentials; until those are configured it quietly does nothing.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { accountApi } from './api/endpoints';

let deviceToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Channel + permission for on-device alerts; works without push credentials. */
export async function enableAlerts(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Order updates and messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (!(await enableAlerts())) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // no EAS project yet: on-device alerts only (see use-notification-alerts)
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await accountApi.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    deviceToken = token;
  } catch {
    // Push is optional: a missing FCM setup or a refused permission must never block the app.
  }
}

/** The token to unregister when signing out. */
export function unregisteredDeviceToken() {
  return deviceToken;
}
