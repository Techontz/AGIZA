import { Image, type ImageStyle } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp } from 'react-native';

import { useAuthHeaders } from '@/hooks/use-auth-headers';
import { colors } from '@/theme/tokens';

/**
 * An image only this seller may see (product photos before approval, logo, banner, return evidence):
 * the API serves it to the signed-in account, so the request carries the access token.
 */
export function PrivateImage({
  uri,
  style,
  accessibilityLabel,
  iconSize = 20,
  version,
  contentFit = 'cover',
}: {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
  iconSize?: number;
  version?: string | number;
  contentFit?: 'cover' | 'contain';
}) {
  const headers = useAuthHeaders();
  if (!uri) {
    return (
      <View style={[styles.empty, style as object]} accessibilityLabel={accessibilityLabel}>
        <ImageOff size={iconSize} color={colors.textSubtle} />
      </View>
    );
  }
  if (!headers) return <View style={[styles.empty, style as object]} />;
  const src = version ? `${uri}${uri.includes('?') ? '&' : '?'}v=${version}` : uri;
  return (
    <Image
      source={{ uri: src, headers }}
      style={style}
      contentFit={contentFit}
      transition={150}
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
});
