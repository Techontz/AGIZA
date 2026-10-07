import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadow, space, themed } from '@/theme/tokens';

import { Text } from './text';

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitle}>
          <Text variant="heading" color={colors.ink} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="small" color={colors.textMuted}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** "See all ›" link for section headers. */
export function SeeAll({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={styles.seeAll}>
      <Text variant="smallMedium" color={colors.primary}>
        See all
      </Text>
      <ChevronRight size={16} color={colors.primary} />
    </Pressable>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'subheading' : 'body'} color={strong ? colors.ink : colors.textMuted}>
        {label}
      </Text>
      <Text variant={strong ? 'subheading' : 'bodyMedium'} color={colors.ink} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = themed(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  section: { gap: space.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  sectionTitle: { flexShrink: 1, gap: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 4 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.sm },
}));
