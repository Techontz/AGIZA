import { router } from 'expo-router';
import { Globe, Truck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { Badge, PAYMENT_LABEL, paymentTone, statusTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { OrderCard } from '@/lib/api/types';
import { date, money } from '@/lib/format';
import { colors, radius, space } from '@/theme/tokens';

export function OrderRow({ order }: { order: OrderCard }) {
  const Icon = order.type === 'international' ? Globe : Truck;
  return (
    <Card onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: order.reference } })}>
      <View style={styles.row}>
        {order.type === 'shop' ? (
          <ProductImage uri={order.image} size={56} />
        ) : (
          <View style={styles.icon}>
            <Icon size={24} color={colors.brand} />
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
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
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
});
