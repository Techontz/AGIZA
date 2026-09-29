import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CloudOff, type LucideIcon } from 'lucide-react-native';

import { ApiError } from '@/lib/api/client';
import { colors, space } from '@/theme/tokens';

import { Button } from './button';
import { Text } from './text';

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator size="large" color={colors.brand} />
      {label ? (
        <Text variant="small" color={colors.textMuted}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <CloudOff size={40} color={colors.textSubtle} />
      <Text variant="subheading" color={colors.ink} style={styles.text}>
        {error instanceof ApiError && error.isNetwork ? "You're offline" : "Couldn't load this"}
      </Text>
      <Text variant="body" color={colors.textMuted} style={styles.text}>
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} style={styles.button} /> : null}
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Icon size={32} color={colors.brand} />
      </View>
      <Text variant="heading" color={colors.ink} style={styles.text}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={colors.textMuted} style={styles.text}>
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  const bg = { info: colors.infoSoft, warning: colors.warningSoft, danger: colors.dangerSoft, success: colors.successSoft }[tone];
  const fg = { info: colors.info, warning: colors.warning, danger: colors.danger, success: colors.success }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text variant="small" color={fg}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  text: { textAlign: 'center' },
  button: { marginTop: space.sm, minWidth: 160 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { borderRadius: 10, padding: space.md },
});
