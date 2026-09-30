import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, shadow, space } from '@/theme/tokens';

/** A figure from the server with its label: "Payable  TZS 120,000". */
export function StatTile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}>
      <Text variant="small" color={colors.textMuted}>
        {label}
      </Text>
      <Text variant="heading" color={strong ? colors.primary : colors.ink} style={styles.value}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Two tiles per row. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 2,
    ...shadow.card,
  },
  value: { fontFamily: 'Outfit_700Bold' },
});
