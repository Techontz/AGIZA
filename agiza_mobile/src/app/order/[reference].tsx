import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ChevronRight, CircleCheck, Copy, MessageCircle, PackageX } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { StoreAvatar, StoreName, VerifiedMark, openStore } from '@/components/store';
import { Timeline } from '@/components/timeline';
import { Badge, PAYMENT_LABEL, paymentTone, statusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { orderApi } from '@/lib/api/endpoints';
import type { OrderDetail, OrderSeller } from '@/lib/api/types';
import { date, dateTime, isFree, money, signedMoney } from '@/lib/format';
import { openPaymentPage } from '@/lib/payment-page';
import { keys } from '@/lib/query';
import { REFUND_LABEL, refundTone, returnTone } from '@/lib/returns';
import { openChatRoom, orderRoom } from '@/lib/chat';
import { colors, space, themed } from '@/theme/tokens';

function Confirmation({
  order,
  paymentFailed,
  paymentPending,
}: {
  order: OrderDetail;
  paymentFailed: boolean;
  paymentPending: boolean;
}) {
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
      {paymentPending && !paymentFailed ? (
        <Notice tone="info">
          We&apos;re waiting for Selcom to confirm your payment. Tap &quot;I&apos;ve paid, check status&quot; below if
          it doesn&apos;t update.
        </Notice>
      ) : null}
      {paymentFailed ? (
        <Notice tone="warning">
          The mobile money payment couldn&apos;t start. Your order is saved; tap Pay now below to try again.
        </Notice>
      ) : null}
    </Card>
  );
}

/** What Selcom told us after the customer came back from the payment page. */
function PaymentResult({ result }: { result: Awaited<ReturnType<typeof orderApi.checkPayment>> }) {
  const latest = result.gateway[result.gateway.length - 1];
  if (result.payment.status === 'fully_paid') return <Notice tone="success">Payment received. Thank you!</Notice>;
  if (latest?.status === 'completed') return <Notice tone="success">Payment received. Your balance is updated.</Notice>;
  if (latest?.status === 'failed' || !latest) {
    return <Notice tone="warning">The payment was not completed. You can try again or choose to pay later.</Notice>;
  }
  return (
    <Notice tone="info">
      Selcom hasn&apos;t confirmed this payment yet. If you approved it on your phone, check again in a minute.
    </Notice>
  );
}

function sellerTone(status: string) {
  if (status === 'cancelled') return 'danger' as const;
  if (status === 'delivered') return 'success' as const;
  if (status === 'pending') return 'warning' as const;
  return 'info' as const;
}

/** Who is preparing which part of this one order. */
function Sellers({ sellers }: { sellers: OrderSeller[] }) {
  return (
    <Section title="Sellers">
      <Card>
        {sellers.map((s, i) => (
          <View key={`${s.vendor.slug}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${s.vendor.name}, ${s.status_display}, ${s.item_count} item${s.item_count === 1 ? '' : 's'}. Open store`}
              onPress={() => openStore(s.vendor.slug)}
              style={styles.seller}>
              <StoreAvatar seller={s.vendor} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <StoreName seller={s.vendor} variant="bodyMedium" />
                <Text variant="small" color={colors.textMuted}>
                  {s.item_count} item{s.item_count === 1 ? '' : 's'}
                </Text>
              </View>
              <Badge label={s.status_display} tone={sellerTone(s.status)} />
            </Pressable>
          </View>
        ))}
      </Card>
    </Section>
  );
}

/** Return requests on this order, and the way to start one. */
function Returns({ order }: { order: OrderDetail }) {
  const returns = order.returns ?? [];
  if (!returns.length && !order.can_return) return null;
  return (
    <Section title="Returns">
      {returns.length ? (
        <Card>
          {returns.map((r, i) => (
            <View key={r.reference}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Return ${r.reference}, ${r.status_display}. Open`}
                onPress={() =>
                  router.push({
                    pathname: '/returns/[reference]',
                    params: { reference: r.reference },
                  })
                }
                style={({ pressed }) => [styles.returnRow, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {r.reference}
                  </Text>
                  <View style={styles.returnBadges}>
                    <Badge label={r.status_display} tone={returnTone(r.status_display)} />
                    {(r.refund_status === 'pending' || r.refund_status === 'refunded') &&
                    REFUND_LABEL[r.refund_status] !== r.status_display ? (
                      <Badge label={REFUND_LABEL[r.refund_status]} tone={refundTone(r.refund_status)} />
                    ) : null}
                  </View>
                </View>
                <ChevronRight size={18} color={colors.textSubtle} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      {order.can_return ? (
        <Button
          title="Return items"
          variant="secondary"
          icon={<PackageX size={18} color={colors.ink} />}
          onPress={() =>
            router.push({
              pathname: '/returns/new',
              params: { order: order.reference },
            })
          }
        />
      ) : null}
    </Section>
  );
}

export default function OrderScreen() {
  const { reference, placed, paymentFailed, paymentPending } = useLocalSearchParams<{
    reference: string;
    placed?: string;
    paymentFailed?: string;
    paymentPending?: string;
  }>();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: keys.order(reference),
    queryFn: () => orderApi.get(reference),
  });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: keys.order(reference) });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const pay = useMutation({
    mutationFn: async () => {
      const start = await orderApi.pay(reference);
      if (start.checkout_url) await openPaymentPage(start.checkout_url);
      return orderApi.checkPayment(reference);
    },
    onSettled: refreshAll,
  });
  const check = useMutation({
    mutationFn: () => orderApi.checkPayment(reference),
    onSettled: refreshAll,
  });
  const checked = check.data ?? pay.data;
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
  // Name the seller per item once an order mixes sellers, or when it is not AGIZA's own.
  const sellerSlugs = new Set(o.items.map((item) => item.vendor?.slug).filter(Boolean));
  const showItemSellers = sellerSlugs.size > 1 || o.items.some((item) => item.vendor && !item.vendor.is_agiza);
  const adjustments = o.adjustments ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={order.isRefetching} onRefresh={() => order.refetch()} tintColor={colors.primary} />
      }>
      <Stack.Screen options={{ title: o.reference }} />
      {placed && o.status !== 'cancelled' ? (
        <Confirmation order={o} paymentFailed={!!paymentFailed} paymentPending={!!paymentPending && !!due} />
      ) : null}

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
            <Notice tone="danger">
              This order was cancelled
              {o.timeline.cancelled_at ? ` on ${date(o.timeline.cancelled_at)}` : ''}.
            </Notice>
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
              steps={o.cargo.map((c) => ({
                key: c.key,
                label: c.label,
                at: c.at,
                state: c.status === 'completed' ? 'completed' : 'pending',
              }))}
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
                <View style={[styles.item, item.cancelled && styles.itemCancelled]}>
                  <ProductImage uri={item.image} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {item.name}
                      {item.variant_name ? ` · ${item.variant_name}` : ''}
                    </Text>
                    {item.cancelled ? (
                      <View style={styles.cancelledBadge}>
                        <Badge label="Cancelled: seller couldn't supply" tone="danger" />
                      </View>
                    ) : item.sourced_abroad ? (
                      <Text variant="smallMedium" color={colors.primary}>
                        Imported — bought abroad for your order
                      </Text>
                    ) : null}
                    <Text variant="small" color={colors.textMuted}>
                      {item.quantity} × {money(item.unit_price, o.currency)}
                    </Text>
                    {item.vendor && showItemSellers ? (
                      <View style={styles.itemSeller}>
                        <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
                          Sold by {item.vendor.name}
                        </Text>
                        {item.vendor.verified ? <VerifiedMark size={11} /> : null}
                      </View>
                    ) : null}
                  </View>
                  <Text
                    variant="bodyMedium"
                    color={item.cancelled ? colors.textSubtle : colors.ink}
                    style={item.cancelled ? styles.strike : undefined}
                    accessibilityLabel={
                      item.cancelled ? `${money(item.line_total, o.currency)}, not charged` : undefined
                    }>
                    {money(item.line_total, o.currency)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {o.sellers?.length ? <Sellers sellers={o.sellers} /> : null}

      {o.shipping ? (
        <Section title="Delivery">
          <Card>
            {o.shipping.import_method ? (
              <Text variant="small" color={colors.textMuted}>
                Shipping to Tanzania: {o.shipping.import_method} · {money(o.shipping.import_fee, o.currency)}
              </Text>
            ) : null}
            <Text variant="bodyMedium" color={colors.ink}>
              {o.shipping.import_method ? 'Then ' : ''}
              {o.shipping.method ?? 'Delivery'}
              {o.shipping.estimated_delivery ? ` · ${o.shipping.estimated_delivery}` : ''}
            </Text>
            {o.prepayment_required && o.payment.status !== 'fully_paid' && o.status !== 'cancelled' ? (
              <Text variant="smallMedium" color={colors.ink}>
                {`Has imported items: AGIZA orders them once the order is fully paid.${
                  o.payment_due_at ? ` Pay by ${dateTime(o.payment_due_at)} or the order is cancelled.` : ''
                }`}
              </Text>
            ) : null}
            {o.customs?.note ? (
              <Text variant="small" color={colors.textMuted}>
                {o.customs.note}
              </Text>
            ) : null}
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
            {o.international.tracking_number ? (
              <Row label="Tracking no." value={o.international.tracking_number} />
            ) : null}
            {o.international.estimated_delivery ? (
              <Row label="Expected" value={date(o.international.estimated_delivery)} />
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Payment">
        {adjustments.some((a) => a.kind !== 'return_refund' && Number(a.amount) < 0) ? (
          <Notice tone="warning">
            A seller couldn&apos;t supply part of your order:{' '}
            {adjustments
              .filter((a) => a.kind !== 'return_refund' && Number(a.amount) < 0)
              .map((a) => signedMoney(a.amount, o.currency))
              .join(', ')}
            . The total below is already updated.
          </Notice>
        ) : null}
        <Card>
          {o.amounts ? (
            <>
              <Row label={o.shipping?.import_method ? 'Products' : 'Subtotal'} value={money(o.amounts.subtotal, o.currency)} />
              {o.shipping?.import_method ? (
                <>
                  <Row label="International shipping" value={money(o.amounts.import_fee, o.currency)} />
                  {Number(o.amounts.customs_fee ?? 0) > 0 ? (
                    <Row label="Customs / import duty" value={money(o.amounts.customs_fee, o.currency)} />
                  ) : null}
                  <Row
                    label="Local delivery"
                    value={money(String(Number(o.amounts.shipping_fee) - Number(o.amounts.import_fee ?? 0)), o.currency)}
                  />
                </>
              ) : (
                <Row
                  label="Delivery"
                  value={isFree(o.amounts.shipping_fee) ? 'Free' : money(o.amounts.shipping_fee, o.currency)}
                />
              )}
              <Divider />
            </>
          ) : null}
          {adjustments.map((a, i) => (
            <View key={`${a.at}-${i}`} style={styles.adjustment}>
              <View style={{ flex: 1 }}>
                <Text variant="body" color={colors.textMuted}>
                  {a.reason}
                </Text>
                <Text variant="caption" color={colors.textSubtle}>
                  {date(a.at)}
                </Text>
              </View>
              <Text variant="bodyMedium" color={Number(a.amount) < 0 ? colors.success : colors.ink}>
                {signedMoney(a.amount, o.currency)}
              </Text>
            </View>
          ))}
          {adjustments.length ? <Divider /> : null}
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
              {p.kind === 'refund' ? `Refund −${money(p.amount, o.currency)}` : money(p.amount, o.currency)} ·{' '}
              {p.method} · {dateTime(p.paid_at)}
            </Text>
          ))}
        </Card>
        {actionError ? <Notice tone="danger">{errorMessage(actionError)}</Notice> : null}
        {checked && !actionError ? <PaymentResult result={checked} /> : null}
        {o.can_pay && due ? (
          <View style={styles.actions}>
            <Button
              title={`Pay ${money(due, o.currency)} with mobile money`}
              onPress={() => pay.mutate()}
              loading={pay.isPending}
            />
            <Button
              title="I've paid, check status"
              variant="ghost"
              onPress={() => check.mutate()}
              loading={check.isPending}
            />
          </View>
        ) : null}
      </Section>

      <Returns order={o} />

      {o.can_cancel ? (
        cancelling ? (
          <Card style={styles.cancelBox}>
            <Input
              label="Why are you cancelling?"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Ordered by mistake"
            />
            {cancel.isError ? <Notice tone="danger">{errorMessage(cancel.error)}</Notice> : null}
            <Button
              title="Cancel order"
              variant="danger"
              loading={cancel.isPending}
              disabled={!reason.trim()}
              onPress={() =>
                Alert.alert('Cancel this order?', 'This cannot be undone.', [
                  { text: 'Keep order', style: 'cancel' },
                  {
                    text: 'Cancel order',
                    style: 'destructive',
                    onPress: () => cancel.mutate(),
                  },
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
        title="Chat with AGIZA about this order"
        variant="secondary"
        icon={<MessageCircle size={18} color={colors.ink} />}
        onPress={() => openChatRoom(...orderRoom(o.reference))}
      />
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  confirm: { alignItems: 'center', gap: space.sm },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xs,
  },
  center: { textAlign: 'center' },
  head: { gap: space.xs },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
  },
  itemCancelled: { opacity: 0.75 },
  cancelledBadge: { marginTop: 4 },
  strike: { textDecorationLine: 'line-through' },
  adjustment: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 4,
  },
  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.xs,
  },
  returnBadges: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  itemSeller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
  },
  payBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    flexWrap: 'wrap',
  },
  actions: { gap: space.xs },
  cancelBox: { gap: space.md },
}));
