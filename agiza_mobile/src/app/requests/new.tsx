import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Picker } from '@/components/picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { addressApi, requestApi, shopApi, type RequestInput } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

const TYPES = [
  { value: 'buy_for_me', title: 'Buy for me', text: 'AGIZA buys the item abroad and ships it to you.' },
  { value: 'deliver_for_me', title: 'Deliver for me', text: 'You already bought it; AGIZA ships it to Tanzania.' },
] as const;

export default function NewRequestScreen() {
  const params = useLocalSearchParams<{ type?: RequestInput['request_type'] }>();
  const queryClient = useQueryClient();
  const countries = useQuery({ queryKey: keys.countries, queryFn: shopApi.sourcingCountries, staleTime: 3_600_000 });
  const cities = useQuery({ queryKey: keys.cities, queryFn: shopApi.cities, staleTime: 3_600_000 });
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressApi.list });
  const [type, setType] = useState<RequestInput['request_type']>(params.type ?? 'buy_for_me');
  const [form, setForm] = useState({ item_name: '', link: '', quantity: '1', weight_kg: '', tracking_number: '', details: '' });
  const [origin, setOrigin] = useState<string | null>(null);
  const [chosenCity, setCity] = useState<number | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const home = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const city = chosenCity ?? home?.city ?? null; // default to the customer's delivery city

  const submit = useMutation({
    mutationFn: () =>
      requestApi.create({
        request_type: type,
        item_name: form.item_name.trim(),
        link: form.link.trim() || undefined,
        quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
        origin_country: origin!,
        destination_city: city!,
        weight_kg: form.weight_kg.trim() ? form.weight_kg.trim() : null,
        tracking_number: type === 'deliver_for_me' ? form.tracking_number.trim() : '',
        details: form.details.trim(),
      }),
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: keys.requests });
      router.replace({ pathname: '/requests/[id]', params: { id: quote.id, created: '1' } });
    },
  });
  const err = submit.error instanceof ApiError ? submit.error : null;

  if (countries.isLoading || cities.isLoading) return <Loading />;
  if (countries.isError || cities.isError) {
    return <ErrorState error={countries.error ?? cities.error} onRetry={() => (countries.refetch(), cities.refetch())} />;
  }
  const canSubmit =
    form.item_name.trim() && origin && city && (type === 'buy_for_me' || form.tracking_number.trim());

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          <Button title="Send request" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit} />
        </View>
      }>
      <View style={styles.types}>
        {TYPES.map((t) => (
          <Pressable
            key={t.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: type === t.value }}
            onPress={() => setType(t.value)}
            style={[styles.type, type === t.value && styles.typeActive]}>
            <Text variant="subheading" color={type === t.value ? colors.primary : colors.ink}>
              {t.title}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {t.text}
            </Text>
          </Pressable>
        ))}
      </View>
      {submit.isError && !err?.details ? <Notice tone="danger">{errorMessage(submit.error)}</Notice> : null}
      <Input label="What is the item?" value={form.item_name} onChangeText={set('item_name')} placeholder="e.g. DJI Mini 4 Pro drone" error={err?.field('item_name')} />
      <Input
        label="Product link (optional)"
        value={form.link}
        onChangeText={set('link')}
        placeholder="https://…"
        keyboardType="url"
        autoCapitalize="none"
        error={err?.field('link')}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Input
            label="Quantity"
            value={form.quantity}
            onChangeText={(v) => set('quantity')(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            error={err?.field('quantity')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Weight kg (optional)"
            value={form.weight_kg}
            onChangeText={(v) => set('weight_kg')(v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            keyboardType="decimal-pad"
            error={err?.field('weight_kg')}
          />
        </View>
      </View>
      <Picker
        label="Ships from"
        value={origin}
        onChange={setOrigin}
        placeholder="Choose country"
        error={err?.field('origin_country')}
        options={(countries.data ?? []).map((c) => ({ value: c.iso2, label: c.name }))}
      />
      <Picker
        label="Deliver to"
        value={city}
        onChange={setCity}
        placeholder="Choose city"
        error={err?.field('destination_city')}
        options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
      />
      {type === 'deliver_for_me' ? (
        <Input
          label="Supplier tracking number"
          value={form.tracking_number}
          onChangeText={set('tracking_number')}
          autoCapitalize="characters"
          error={err?.field('tracking_number')}
        />
      ) : null}
      <Input label="Anything else? (optional)" value={form.details} onChangeText={set('details')} multiline placeholder="Colour, size, model…" maxLength={2000} />
      <Text variant="small" color={colors.textMuted}>
        AGIZA replies with a full quotation. You only pay after you accept it.
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', gap: space.sm },
  type: {
    flex: 1,
    padding: space.md,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', gap: space.md },
  footer: { padding: space.lg, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
