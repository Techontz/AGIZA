import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { PackageX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, Divider, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { QuantityStepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { returnApi } from '@/lib/api/endpoints';
import type { OrderReturnOptions } from '@/lib/api/types';
import { money } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

function ReturnForm({ order, options }: { order: string; options: OrderReturnOptions }) {
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');

  const lines = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([item, quantity]) => ({ item: Number(item), quantity }));

  const submit = useMutation({
    mutationFn: () => returnApi.create(order, { lines, reason_code: reason!, explanation: explanation.trim() }),
    onSuccess: (created) => {
      queryClient.setQueryData(keys.returnDetail(created.reference), created);
      queryClient.invalidateQueries({ queryKey: keys.returns });
      queryClient.invalidateQueries({ queryKey: keys.order(order) });
      router.replace({ pathname: '/returns/[reference]', params: { reference: created.reference } });
    },
  });
  const err = submit.error instanceof ApiError ? submit.error : null;
  const ready = lines.length > 0 && !!reason && explanation.trim().length > 0;
  const missing = !lines.length ? 'Choose at least one item' : !reason ? 'Choose a reason' : !explanation.trim() ? 'Tell us what happened' : null;

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          {submit.isError && !err?.field('explanation') ? <Notice tone="danger">{errorMessage(submit.error)}</Notice> : null}
          <Button
            title="Send return request"
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!ready}
            accessibilityHint={missing ?? undefined}
          />
        </View>
      }>
      <Text variant="body" color={colors.textMuted}>
        Choose what you want to return from order {order}. AGIZA reviews every request and tells you what happens next
        {options.window_days ? `; returns are accepted within ${options.window_days} days of delivery` : ''}.
      </Text>

      <Section title="Items">
        <Card>
          {options.items.map((item, i) => {
            const qty = quantities[item.item] ?? 0;
            return (
              <View key={item.item}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.item}>
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={item.returnable ? colors.ink : colors.textSubtle} numberOfLines={2}>
                      {item.name}
                      {item.variant_name ? ` · ${item.variant_name}` : ''}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {item.returnable
                        ? `${money(item.unit_price)} each · up to ${item.returnable} of ${item.quantity}`
                        : 'Already returned or not returnable'}
                    </Text>
                  </View>
                  {item.returnable ? (
                    <QuantityStepper
                      value={qty}
                      min={0}
                      max={item.returnable}
                      onChange={(next) => setQuantities((q) => ({ ...q, [item.item]: next }))}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title="Reason">
        <View style={styles.reasons} accessibilityRole="radiogroup">
          {options.reasons.map((r) => {
            const active = reason === r.code;
            return (
              <Pressable
                key={r.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => setReason(r.code)}
                style={[styles.reason, active && styles.reasonActive]}>
                <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
                <Text variant="bodyMedium" color={active ? colors.primary : colors.ink} style={styles.flex}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {err?.field('reason_code') ? <Notice tone="danger">{err.field('reason_code')}</Notice> : null}
      </Section>

      <Input
        label="What happened?"
        value={explanation}
        onChangeText={setExplanation}
        multiline
        maxLength={2000}
        placeholder="e.g. The screen was cracked when I opened the box."
        error={err?.field('explanation')}
      />
    </FormScreen>
  );
}

/** Ask to return items from a delivered shop order. What can be returned is decided by the server. */
export default function NewReturnScreen() {
  const { order } = useLocalSearchParams<{ order: string }>();
  const options = useQuery({ queryKey: keys.returnOptions(order), queryFn: () => returnApi.options(order) });

  let body;
  if (options.isLoading) body = <Loading />;
  else if (options.isError || !options.data) body = <ErrorState error={options.error} onRetry={() => options.refetch()} />;
  else if (!options.data.can_return) {
    body = (
      <EmptyState
        icon={PackageX}
        title="Nothing to return"
        message={
          options.data.window_open
            ? 'Every item in this order is already returned or not returnable.'
            : `Returns are accepted within ${options.data.window_days} days of delivery. Chat with AGIZA Support if you need help.`
        }
        action={<Button title="Chat with support" variant="secondary" onPress={() => router.push('/support')} style={styles.action} />}
      />
    );
  } else body = <ReturnForm order={order} options={options.data} />;

  return (
    <>
      <Stack.Screen options={{ title: 'Return items' }} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  reasons: { gap: space.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  footer: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: { marginTop: space.sm, minWidth: 180 },
});
