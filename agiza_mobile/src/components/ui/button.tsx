import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const palette: Record<Variant, { bg: string; pressed: string; text: string; border: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, text: '#FFFFFF', border: colors.primary },
  secondary: { bg: colors.surface, pressed: colors.background, text: colors.ink, border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.primarySoft, text: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, text: colors.danger, border: colors.danger },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  accessibilityHint?: string;
}) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed && !inactive ? p.pressed : p.bg, borderColor: p.border },
        inactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant="subheading" color={p.text}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inactive: { opacity: 0.55 },
});
