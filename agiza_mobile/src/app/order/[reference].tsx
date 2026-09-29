import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CircleCheck, Copy, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { Timeline } from '@/components/timeline';
import { Badge, PAYMENT_LABEL, paymentTone, statusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { orderApi } from '@/lib/api/endpoints';
import type { OrderDetail } from '@/lib/api/types';
import { date, dateTime, isFree, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, space } from '@/theme/tokens';

function Confirmation({ order, paymentFailed }: { order: OrderDetail; paymentFailed: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card style={styles.confirm}>
      <CircleCheck size={40} color={colors.success} />
      <Text variant="heading" color={colors.ink}>
        Thank you! Your order is placed.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy order number ${order.reference}`}
        onPress={async () => {
          await Clipboard.setStringAsync(order.reference);
          setCopied(true);
        }}
        style={styles.copy}>
        <Text variant="title" color={colors.primary}>
          {order.reference}
        </Text>
        <Copy size={16} color={colors.textMuted} />
      </Pressable>
      <Text variant="small" color={colors.textMuted} style={styles.center}>
        {copied ? 'Order number copied.' : "We'll notify you as it moves. Keep this order number for support."}
      </Text>
      {paymentFailed ? (
        <Notice tone="warning">The mobile money payment couldn&apos;t start. Your order is saved; tap Pay now below to try again.</Notice>
      ) : null}
    </Card>
  );
}

export default function OrderScreen() {
  const { reference, placed, paymentFailed } = useLocalSearchParams<{ reference: string; placed?: string; paymentFailed?: string }>();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: keys.order(reference), queryFn: () => orderApi.get(reference) });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: keys.order(reference) });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const pay = useMutation({
    mutationFn: async () => {
      const start = await orderApi.pay(reference);
      if (start.checkout_url) await WebBrowser.openBrowserAsync(start.checkout_url);
      return orderApi.checkPayment(reference);
    },
    onSettled: refreshAll,
  });
  const check = useMutation({ mutationFn: () => orderApi.checkPayment(reference), onSettled: refreshAll });
  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(reference, reason.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.order(reference), updated);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setCancelling(false);
    },
  });

  if (order.isLoading) return <Loading />;
  if (order.isError || !order.data) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;
  const due = o.payment.due && Number(o.payment.due) > 0 ? o.payment.due : null;
  const actionError = pay.error ?? check.error;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => order.refetch()} tintColor={colors.brand} />}>
      <Stack.Screen options={{ title: o.reference }} />
      {placed && o.status !== 'cancelled' ? <Confirmation order={o} paymentFailed={!!paymentFailed} /> : null}

      <Card style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="small" color={colors.textMuted}>
            {o.type_display} · {date(o.created_at)}
          </Text>
          <Badge label={o.status_display} tone={statusTone(o.group, o.status)} />
        </View>
        <Text variant="subheading" color={colors.ink}>
          {o.item_details}
        </Text>
        {o.delivery ? (
          <Text variant="small" color={colors.textMuted}>
            Delivery {o.delivery.reference}: {o.delivery.status_display}
            {o.delivery.scheduled_at ? ` · scheduled ${dateTime(o.delivery.scheduled_at)}` : ''}
          </Text>
        ) : null}
      </Card>

      <Section title="Tracking">
        <Card>
          {o.timeline.cancelled ? (
            <Notice tone="danger">This order was cancelled{o.timeline.cancelled_at ? ` on ${date(o.timeline.cancelled_at)}` : ''}.</Notice>
          ) : null}
          <View style={{ marginTop: o.timeline.cancelled ? space.md : 0 }}>
            <Timeline steps={o.timeline.steps} cancelled={o.timeline.cancelled} />
          </View>
        </Card>
      </Section>

      {o.cargo?.length ? (
        <Section title="Cargo shipment">
          <Card>
            <Timeline
              steps={o.cargo.map((c) => ({ key: c.key, label: c.label, at: c.at, state: c.status === 'completed' ? 'completed' : 'pending' }))}
            />
          </Card>
        </Section>
      ) : null}

      {o.items.length ? (
        <Section title="Items">
          <Card>
            {o.items.map((item, i) => (
              <View key={`${item.sku}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.item}>
                  <ProductImage uri={item.image} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {item.name}
                      {item.variant_name ? ` · ${item.variant_name}` : ''}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {item.quantity} × {money(item.unit_price, o.currency)}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {money(item.line_total, o.currency)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {o.shipping ? (
        <Section title="Delivery">
          <Card>
            <Text variant="bodyMedium" color={colors.ink}>
              {o.shipping.method ?? 'Delivery'}
              {o.shipping.estimated_delivery ? ` · ${o.shipping.estimated_delivery}` : ''}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {o.shipping.address}
            </Text>
          </Card>
        </Section>
      ) : null}

      {o.international ? (
        <Section title="Details">
          <Card>
            <Row label="Service" value={o.international.service} />
            <Row label="From" value={o.international.source_country} />
            {o.international.tracking_number ? <Row label="Tracking no." value={o.international.tracking_number} /> : null}
            {o.international.estimated_delivery ? <Row label="Expected" value={date(o.international.estimated_delivery)} /> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Payment">
        <Card>
          {o.amounts ? (
            <>
              <Row label="Subtotal" value={money(o.amounts.subtotal, o.currency)} />
              <Row label="Delivery" value={isFree(o.amounts.shipping_fee) ? 'Free' : money(o.amounts.shipping_fee, o.currency)} />
              <Divider />
            </>
          ) : null}
          <Row label="Total" value={money(o.total, o.currency)} strong />
          <Row label="Paid" value={money(o.payment.paid, o.currency)} />
          {due ? <Row label="Balance due" value={money(due, o.currency)} strong /> : null}
          <View style={styles.payBadge}>
            <Badge label={PAYMENT_LABEL[o.payment.status]} tone={paymentTone(o.payment.status)} />
            {o.payment_preference === 'pay_later' && due ? (
              <Text variant="small" color={colors.textMuted}>
                Pay on delivery or by transfer; AGIZA confirms it.
              </Text>
            ) : null}
          </View>
          {o.payments.map((p, i) => (
            <Text key={i} variant="small" color={colors.textMuted}>
              {money(p.amount, o.currency)} · {p.method} · {dateTime(p.paid_at)}
            </Text>
          ))}
        </Card>
        {actionError ? <Notice tone="danger">{errorMessage(actionError)}</Notice> : null}
        {o.can_pay && due ? (
          <View style={styles.actions}>
            <Button title={`Pay ${money(due, o.currency)} with mobile money`} onPress={() => pay.mutate()} loading={pay.isPending} />
            <Button title="I've paid, check status" variant="ghost" onPress={() => check.mutate()} loading={check.isPending} />
          </View>
        ) : null}
      </Section>

      {o.can_cancel ? (
        cancelling ? (
          <Card style={styles.cancelBox}>
            <Input label="Why are you cancelling?" value={reason} onChangeText={setReason} placeholder="e.g. Ordered by mistake" />
            {cancel.isError ? <Notice tone="danger">{errorMessage(cancel.error)}</Notice> : null}
            <Button
              title="Cancel order"
              variant="danger"
              loading={cancel.isPending}
              disabled={!reason.trim()}
              onPress={() =>
                Alert.alert('Cancel this order?', 'This cannot be undone.', [
                  { text: 'Keep order', style: 'cancel' },
                  { text: 'Cancel order', style: 'destructive', onPress: () => cancel.mutate() },
                ])
              }
            />
            <Button title="Keep my order" variant="ghost" onPress={() => setCancelling(false)} />
          </Card>
        ) : (
          <Button title="Cancel order" variant="secondary" onPress={() => setCancelling(true)} />
        )
      ) : null}

      <Button
        title="Questions? Chat with support"
        variant="ghost"
        icon={<MessageCircle size={18} color={colors.primary} />}
        onPress={() => router.push('/support')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  confirm: { alignItems: 'center', gap: space.sm },
  copy: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.xs },
  center: { textAlign: 'center' },
  head: { gap: space.xs },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  payBadge: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
  actions: { gap: space.xs },
  cancelBox: { gap: space.md },
});
