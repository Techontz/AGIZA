/**
 * Checkout. Everything shown is priced by the server (POST checkout/preview/): items, the
 * delivery options the Shipping Engine offers for the chosen address, the fee and the total.
 * Placing the order sends the total the customer saw; if anything changed the server refuses
 * with a fresh preview. One idempotency key per checkout means a retry never orders twice.
 * Imported items add a "Shipping to Tanzania" choice (also priced by the Shipping Engine) and
 * are paid when ordering (the server then offers mobile money only).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Check, CircleAlert, MapPin, Package, Plane, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { ProductImage } from '@/components/product-tile';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { QuantityStepper } from '@/components/ui/stepper';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import { ApiError } from '@/lib/api/client';
import { addressApi, checkoutApi, orderApi } from '@/lib/api/endpoints';
import type { CheckoutQuote, PaymentMethod, ShippingOption } from '@/lib/api/types';
import { isFree, money } from '@/lib/format';
import { openPaymentPage } from '@/lib/payment-page';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

function Choice({
  selected,
  onPress,
  title,
  subtitle,
  trailing,
  disabled,
}: {
  selected: boolean;
  onPress?: () => void;
  title: string;
  subtitle?: string | null;
  trailing?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, disabled && styles.choiceDisabled]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" color={colors.ink}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color={disabled ? colors.danger : colors.textMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text variant="subheading" color={colors.ink}>
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

function shippingSubtitle(o: ShippingOption) {
  if (!o.available) return o.message;
  return [o.estimated_delivery, o.carrier].filter(Boolean).join(' · ') || o.description;
}

/** Why the fee is what it is when goods come from several places: one priced shipment per origin. */
function ShipmentBreakdown({ option }: { option: ShippingOption }) {
  const shipments = option.shipments ?? [];
  if (shipments.length < 2) return null;
  return (
    <View style={styles.shipments} accessibilityLabel={`Delivered in ${shipments.length} shipments`}>
      <View style={styles.inline}>
        <Package size={16} color={colors.textMuted} />
        <Text variant="smallMedium" color={colors.ink}>
          Delivered in {shipments.length} shipments
        </Text>
      </View>
      {shipments.map((sh, i) => (
        <View key={`${sh.label}-${i}`} style={styles.shipment}>
          <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            {sh.label}
          </Text>
          <Text variant="smallMedium" color={colors.ink}>
            {isFree(sh.cost) ? 'Free' : money(sh.cost, option.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One leg's methods: the available ones to choose from, the others behind "show". */
function OptionsSection({
  title,
  intro,
  options,
  selectedId,
  onSelect,
}: {
  title: string;
  intro?: string;
  options: ShippingOption[];
  selectedId: number | null;
  onSelect: (methodId: number) => void;
}) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const available = options.filter((o) => o.available);
  const unavailable = options.filter((o) => !o.available);
  const selectedOption = available.find((o) => o.method_id === selectedId);
  return (
    <Section title={title}>
      {intro ? (
        <View style={styles.inline}>
          <Plane size={16} color={colors.brand} />
          <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            {intro}
          </Text>
        </View>
      ) : null}
      {available.length ? (
        <View style={styles.choices}>
          {available.map((o) => (
            <Choice
              key={o.method_id}
              selected={o.method_id === selectedId}
              onPress={() => onSelect(o.method_id)}
              title={o.name}
              subtitle={shippingSubtitle(o)}
              trailing={isFree(o.cost) ? 'Free' : money(o.cost, o.currency)}
            />
          ))}
          {selectedOption ? <ShipmentBreakdown option={selectedOption} /> : null}
        </View>
      ) : null}
      {unavailable.length ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setShowUnavailable((v) => !v)} style={styles.inline}>
            <CircleAlert size={16} color={colors.textMuted} />
            <Text variant="small" color={colors.textMuted}>
              {showUnavailable ? 'Hide' : 'Show'} {unavailable.length} option{unavailable.length === 1 ? '' : 's'} not available here
            </Text>
          </Pressable>
          {showUnavailable ? (
            <View style={styles.choices}>
              {unavailable.map((o) => (
                <Choice key={o.method_id} selected={false} disabled title={o.name} subtitle={shippingSubtitle(o)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

export default function CheckoutScreen() {
  const queryClient = useQueryClient();
  const cart = useCart();
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressApi.list });
  const [chosenAddress, setAddressId] = useState<number | null>(null);
  // null = let the server pick (the cheapest available option for the address)
  const [methodId, setMethodId] = useState<number | null>(null);
  const [importMethodId, setImportMethodId] = useState<number | null>(null); // imported items: abroad → Tanzania
  const [chosenPayment, setPayment] = useState<PaymentMethod['code'] | null>(null);
  const [notes, setNotes] = useState('');
  const [changed, setChanged] = useState(false);
  const idempotencyKey = useRef(Crypto.randomUUID());

  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const addressId = chosenAddress ?? defaultAddress?.id ?? null;

  const previewKey = ['checkout-preview', addressId, methodId, importMethodId, cart.data?.item_count, cart.data?.subtotal];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () => checkoutApi.preview(addressId!, methodId, importMethodId),
    enabled: addressId !== null,
    placeholderData: keepPreviousData,
  });
  const quote: CheckoutQuote | undefined = preview.data;
  const payment = quote?.payment_methods.some((m) => m.code === chosenPayment)
    ? chosenPayment
    : (quote?.payment_methods[0]?.code ?? null);

  const place = useMutation({
    mutationFn: () =>
      checkoutApi.placeOrder({
        address: addressId!,
        shipping_method: quote!.selected_shipping_method!,
        import_method: quote!.selected_import_method,
        payment_method: payment!,
        notes,
        idempotency_key: idempotencyKey.current,
        expected_total: quote!.total!,
      }),
    onSuccess: async (result) => {
      const reference = result.order.reference;
      queryClient.invalidateQueries({ queryKey: keys.cart });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.setQueryData(keys.order(reference), result.order);
      let paymentPending: string | undefined;
      if (result.payment?.checkout_url) {
        await openPaymentPage(result.payment.checkout_url);
        const checked = await orderApi.checkPayment(reference).catch(() => null);
        paymentPending = checked && checked.payment.status !== 'fully_paid' ? '1' : undefined;
        queryClient.invalidateQueries({ queryKey: keys.order(reference) });
      }
      const paymentFailed = result.payment?.status === 'failed' ? '1' : undefined;
      router.replace({ pathname: '/order/[reference]', params: { reference, placed: '1', paymentFailed, paymentPending } });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'price_changed' && e.details) {
        const fresh = e.details as CheckoutQuote;
        queryClient.setQueryData(previewKey, fresh);
        setChanged(true);
      }
    },
  });

  if (addresses.isLoading || (addressId !== null && preview.isLoading)) return <Loading label="Preparing your order…" />;
  if (addresses.isError) return <ErrorState error={addresses.error} onRetry={() => addresses.refetch()} />;
  if (!addresses.data?.length) {
    return (
      <EmptyState
        icon={MapPin}
        title="Where should we deliver?"
        message="Add a delivery address to see delivery options and costs."
        action={<Button title="Add address" onPress={() => router.push('/addresses/edit')} style={{ minWidth: 200 }} />}
      />
    );
  }
  if (preview.isError && !quote) return <ErrorState error={preview.error} onRetry={() => preview.refetch()} />;
  if (!quote) return <Loading />;
  if (!quote.cart.items.length) {
    return <EmptyState icon={Check} title="Your cart is empty" action={<Button title="Go shopping" onPress={() => router.replace('/shop')} />} />;
  }

  const imported = quote.import_options.length > 0;
  const origins = [...new Set(quote.cart.items.filter((l) => l.imported && l.origin).map((l) => l.origin))];
  const refreshing = preview.isFetching;
  const canPlace = quote.can_place_order && !!payment && !refreshing && !place.isPending;
  const placeError = place.error instanceof ApiError && place.error.code !== 'price_changed' ? place.error : null;

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          {changed ? <Notice tone="warning">Prices or delivery changed. Review the new total, then place your order.</Notice> : null}
          {placeError ? <Notice tone="danger">{errorMessage(placeError)}</Notice> : null}
          <View style={styles.totalRow}>
            <Text variant="subheading" color={colors.ink}>
              Total
            </Text>
            {refreshing ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text variant="title" color={colors.ink}>
                {money(quote.total, quote.currency)}
              </Text>
            )}
          </View>
          <Button
            title={payment === 'mobile_money' ? 'Place order & pay' : 'Place order'}
            onPress={() => {
              setChanged(false);
              place.mutate();
            }}
            loading={place.isPending}
            disabled={!canPlace}
          />
        </View>
      }>
      {quote.issues.map((issue) => (
        <Notice key={issue} tone="warning">
          {issue}
        </Notice>
      ))}

      <Section
        title="Delivery address"
        action={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/addresses/edit')}>
            <View style={styles.inline}>
              <Plus size={16} color={colors.primary} />
              <Text variant="smallMedium" color={colors.primary}>
                New
              </Text>
            </View>
          </Pressable>
        }>
        <View style={styles.choices}>
          {addresses.data.map((a) => (
            <Choice
              key={a.id}
              selected={a.id === addressId}
              onPress={() => {
                setAddressId(a.id);
                setMethodId(null); // options depend on the address
              }}
              title={a.label || a.city_name}
              subtitle={a.one_line}
            />
          ))}
        </View>
      </Section>

      <Section title="Items">
        <Card style={styles.items}>
          {quote.cart.items.map((line, i) => (
            <View key={line.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.item}>
                <ProductImage uri={line.image} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                    {line.name}
                  </Text>
                  {line.issue ? (
                    <Text variant="small" color={colors.danger}>
                      {line.issue}
                    </Text>
                  ) : (
                    <Text variant="small" color={colors.textMuted}>
                      {money(line.unit_price)} each
                    </Text>
                  )}
                  {line.imported && !line.issue ? (
                    <Text variant="smallMedium" color={colors.brand}>
                      Ships from {line.origin ?? 'abroad'}
                    </Text>
                  ) : null}
                </View>
                <QuantityStepper
                  value={line.quantity}
                  max={Math.max(line.quantity, Math.min(line.available, 100))}
                  busy={cart.setQuantity.isPending && cart.setQuantity.variables?.item === line.id}
                  onChange={(quantity) => cart.setQuantity.mutate({ item: line.id, quantity })}
                />
              </View>
            </View>
          ))}
        </Card>
        {cart.setQuantity.isError ? <Notice tone="danger">{errorMessage(cart.setQuantity.error)}</Notice> : null}
      </Section>

      {imported ? (
        <OptionsSection
          title="Shipping to Tanzania"
          intro={`${origins.length ? `Imported from ${origins.join(', ')}` : 'Imported items'} — AGIZA buys them after you pay and ships them to Tanzania.`}
          options={quote.import_options}
          selectedId={quote.selected_import_method}
          onSelect={setImportMethodId}
        />
      ) : null}
      <OptionsSection
        title={imported ? 'Delivery in Tanzania' : 'Delivery option'}
        options={quote.shipping_options}
        selectedId={quote.selected_shipping_method}
        onSelect={setMethodId}
      />

      <Section title="Payment">
        {quote.prepayment_required ? (
          <Notice tone="info">
            {`Your order has imported items, so it is paid when you order. AGIZA buys them abroad once your payment is confirmed.${
              quote.payment_window_hours ? ` Unpaid orders are cancelled after ${quote.payment_window_hours} hours.` : ''
            }`}
          </Notice>
        ) : null}
        <View style={styles.choices}>
          {quote.payment_methods.map((m) => (
            <Choice key={m.code} selected={payment === m.code} onPress={() => setPayment(m.code)} title={m.label} subtitle={m.description} />
          ))}
        </View>
      </Section>

      <Input
        label="Delivery notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Gate colour, landmark, best time to call…"
        multiline
        maxLength={500}
      />

      <Card>
        <Row label={imported ? 'Products' : 'Subtotal'} value={money(quote.subtotal, quote.currency)} />
        {imported ? (
          <Row label="International shipping" value={quote.selected_import_method === null ? '—' : money(quote.import_fee, quote.currency)} />
        ) : null}
        {quote.customs?.lines.map((line) => (
          <Row
            key={`${line.kind}-${line.name}-${line.treatment}`}
            label={line.treatment === 'estimate' ? `${line.name} (estimate, paid separately)` : line.name}
            value={line.treatment === 'estimate' ? `≈ ${money(line.amount, quote.currency)}` : money(line.amount, quote.currency)}
          />
        ))}
        {quote.customs?.status === 'not_included' ? <Row label="Customs / import duty" value="Not included" /> : null}
        <Row
          label={imported ? 'Local delivery' : 'Delivery'}
          value={quote.delivery_fee === null ? '—' : isFree(quote.delivery_fee) ? 'Free' : money(quote.delivery_fee, quote.currency)}
        />
        {quote.estimated_delivery ? <Row label="Estimated delivery" value={quote.estimated_delivery} /> : null}
        <Divider />
        <Row label="Total" value={money(quote.total, quote.currency)} strong />
        {quote.customs?.note ? (
          <Text variant="small" color={colors.textMuted}>
            {quote.customs.note}
          </Text>
        ) : null}
      </Card>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: space.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceDisabled: { opacity: 0.6 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  items: { paddingVertical: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  shipments: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shipment: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingLeft: 20 },
  footer: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
