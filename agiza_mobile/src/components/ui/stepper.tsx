import { Minus, Plus } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

import { Text } from './text';

export function QuantityStepper({
  value,
  max,
  onChange,
  busy = false,
  min = 1,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  busy?: boolean;
  min?: number;
}) {
  const canDec = !busy && value > min;
  const canInc = !busy && value < max;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={!canDec}
        hitSlop={8}
        onPress={() => onChange(value - 1)}
        style={[styles.btn, !canDec && styles.off]}>
        <Minus size={16} color={colors.ink} />
      </Pressable>
      <View style={styles.value}>
        {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <Text variant="subheading">{value}</Text>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={!canInc}
        hitSlop={8}
        onPress={() => onChange(value + 1)}
        style={[styles.btn, !canInc && styles.off]}>
        <Plus size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  value: { minWidth: 32, alignItems: 'center' },
});
