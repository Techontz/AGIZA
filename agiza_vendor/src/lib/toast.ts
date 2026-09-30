import { Alert, Platform, ToastAndroid } from 'react-native';

/** A short confirmation after an action: a toast on Android, a small alert on iOS. */
export function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
