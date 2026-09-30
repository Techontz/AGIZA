import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

import { Text } from './text';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, [string, string]> = {
  neutral: ['#F3F4F6', colors.text],
  brand: [colors.primarySoft, colors.primary],
  success: [colors.successSoft, colors.success],
  warning: [colors.warningSoft, colors.warning],
  danger: [colors.dangerSoft, colors.danger],
  info: [colors.infoSoft, colors.info],
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const [bg, fg] = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="caption" color={fg}>
        {label}
      </Text>
    </View>
  );
}

export function statusTone(group: string, status: string): Tone {
  if (status === 'cancelled') return 'danger';
  if (group === 'completed') return 'success';
  if (status === 'pending' || status === 'pending_payment' || status === 'waiting_quote') return 'warning';
  return 'info';
}

export function paymentTone(status: string): Tone {
  return status === 'fully_paid' ? 'success' : status === 'partial' || status === 'installment' ? 'info' : 'warning';
}

export const PAYMENT_LABEL: Record<string, string> = {
  fully_paid: 'Paid',
  partial: 'Part paid',
  installment: 'Installments',
  unpaid: 'Unpaid',
};

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
