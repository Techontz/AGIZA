import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts, scheme, themed } from '@/theme/tokens';

/** The AGIZA wordmark: the flame "A" followed by GIZA in the ink colour. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="AGIZA">
      <Image
        source={scheme() === 'dark' ? require('@/assets/images/mark-dark.png') : require('@/assets/images/mark.png')}
        style={{ width: size * 0.78, height: size }} contentFit="contain" />
      <Text style={[styles.word, { fontSize: size * 0.95, lineHeight: size * 1.05 }]} color={colors.ink}>
        GIZA
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  word: { fontFamily: fonts.bold, letterSpacing: 0.5 },
}));
