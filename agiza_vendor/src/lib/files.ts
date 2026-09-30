/** Choosing photos (camera or library) and documents for multipart uploads. */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import type { UploadFile } from './api/types';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function extension(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'application/pdf' ? 'pdf' : 'jpg';
}

function denied(what: string) {
  Alert.alert(`Allow ${what}`, `AGIZA Seller needs access to your ${what} for this. You can allow it in Settings.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}

/** Takes or picks one photo. Returns null when cancelled or not allowed. */
export async function pickImage(source: 'camera' | 'library', aspect?: [number, number]): Promise<UploadFile | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8, // re-encodes to JPEG: keeps uploads well under the server's size limit
    allowsEditing: !!aspect,
    aspect,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      denied('camera');
      return null;
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType && IMAGE_TYPES.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.${extension(type)}`, type };
}

/** Asks "Take photo / Choose from library", then returns the chosen photo (or null). */
export function choosePhoto(title: string, aspect?: [number, number]): Promise<UploadFile | null> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      undefined,
      [
        { text: 'Take photo', onPress: () => pickImage('camera', aspect).then(resolve, () => resolve(null)) },
        { text: 'Choose from library', onPress: () => pickImage('library', aspect).then(resolve, () => resolve(null)) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** A PDF or image for business documents. */
export async function pickDocument(): Promise<UploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', ...IMAGE_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType || (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  return { uri: asset.uri, name: asset.name || `document.${extension(type)}`, type };
}
