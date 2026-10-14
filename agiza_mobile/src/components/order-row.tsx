import { router } from 'expo-router';
import { CalendarClock, Globe, Truck } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { expectedText } from '@/components/expected-delivery';

import { ProductImage } from '@/components/product-tile';
import { Badge, PAYMENT_LABEL, paymentTone, statusTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { OrderCard } from '@/lib/api/types';
import { date, money } from '@/lib/format';
import { colors, radius, space, themed } from '@/theme/tokens';

export function OrderRow({ order }: { order: OrderCard }) {
  const Icon = order.type === 'international' ? Globe : Truck;
  const expected = order.status !== 'cancelled' ? expectedText(order.expected_delivery) : null;
  return (
    <Card onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: order.reference } })}>
      <View style={styles.row}>
        {order.type === 'shop' ? (
          <ProductImage uri={order.image} size={56} />
        ) : (
          <View style={styles.icon}>
            <Icon size={24} color={colors.primary} />
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.top}>
            <Text variant="subheading" color={colors.ink}>
              {order.reference}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {date(order.created_at)}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {order.item_details}
          </Text>
          {expected ? (
            <View style={styles.expected}>
              <CalendarClock size={14} color={expected.delivered ? colors.success : colors.ink} />
              <Text variant="smallMedium" color={colors.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                {expected.label}
              </Text>
            </View>
          ) : null}
          <View style={styles.badges}>
            <Badge label={order.status_display} tone={statusTone(order.group, order.status)} />
            {order.total && order.status !== 'cancelled' ? (
              <Badge label={PAYMENT_LABEL[order.payment_status]} tone={paymentTone(order.payment_status)} />
            ) : null}
            <View style={styles.spacer} />
            <Text variant="smallMedium" color={colors.ink}>
              {money(order.total, order.currency)}
            </Text>
          </View>
          {order.can_pay && order.amount_due ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pay towards ${order.reference}, ${money(order.amount_due, order.currency)} due`}
              hitSlop={6}
              onPress={() =>
                router.push({ pathname: '/order/[reference]', params: { reference: order.reference, pay: '1' } })
              }
              style={styles.pay}>
              <Text variant="smallMedium" color={colors.textMuted}>
                {money(order.amount_due, order.currency)} due
              </Text>
              <View style={styles.payButton}>
                <Text variant="smallMedium" color={colors.onPrimary}>
                  Pay
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', gap: space.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 },
  spacer: { flex: 1 },
  expected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
    paddingVertical: 6,
    paddingLeft: space.md,
    paddingRight: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  payButton: { paddingVertical: 4, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: colors.brand },
}));
