import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts } from '@/theme/tokens';

import { PrivateImage } from './private-image';

/** The store's logo, or its initials on the brand tint. */
export function StoreAvatar({ name, logo, size = 44, version }: { name: string; logo: string | null; size?: number; version?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (logo) return <PrivateImage uri={logo} style={style} version={version} accessibilityLabel={`${name} logo`} />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={[styles.initials, style]} accessibilityLabel={`${name} logo`}>
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.38 }} color={colors.primary}>
        {initials || 'A'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
