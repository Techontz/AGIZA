import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { colors, radius, space, themed } from '@/theme/tokens';

import { Text } from './text';

type Variant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger';

const palette = (): Record<Variant, { bg: string; pressed: string; text: string; border: string }> => ({
  primary: { bg: colors.brand, pressed: colors.brandPressed, text: colors.onPrimary, border: colors.brand },
  dark: { bg: colors.hero, pressed: colors.ink, text: colors.onHero, border: colors.hero },
  secondary: { bg: colors.surface, pressed: colors.surfaceMuted, text: colors.ink, border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.primarySoft, text: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, text: colors.danger, border: colors.danger },
});

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
  const p = palette()[variant];
  const inactive = disabled || loading;
  const off = disabled && !loading; // muted grey rather than a faded colour
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed && !inactive ? p.pressed : p.bg, borderColor: p.border },
        off && variant !== 'ghost' && styles.off,
        loading && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant="subheading" color={off ? colors.textSubtle : p.text}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = themed(() => ({
  base: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inactive: { opacity: 0.7 },
  off: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
}));
