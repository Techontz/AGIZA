import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Picker } from '@/components/picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { sellerApi, shopApi, type ApplicationInput } from '@/lib/api/endpoints';
import type { SellerStore } from '@/lib/api/types';
import { openSellerTerms } from '@/lib/links';
import { keys } from '@/lib/query';
import { BUSINESS_TYPES, PAYOUT_METHODS } from '@/lib/seller';
import { colors, space } from '@/theme/tokens';

/** Applying to sell, or correcting an application AGIZA hasn't approved yet. Staff review it in the AGIZA admin. */
export function ApplicationForm({ store, onDone }: { store?: SellerStore | null; onDone?: (s: SellerStore) => void }) {
  const client = useQueryClient();
  const cities = useQuery({ queryKey: keys.cities, queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [form, setForm] = useState({
    name: store?.name ?? '',
    description: store?.description ?? '',
    business_address: store?.business_address ?? '',
    contact_person: store?.contact_person ?? '',
    phone: store?.phone ?? '',
    email: store?.email ?? '',
    legal_name: store?.legal_name ?? '',
    registration_number: store?.registration_number ?? '',
    tin: store?.tin ?? '',
    payout_provider: store?.payout_provider ?? '',
    payout_account_name: store?.payout_account_name ?? '',
    payout_account_number: store?.payout_account_number ?? '',
  });
  const [city, setCity] = useState<number | null>(store?.city ?? null);
  const [businessType, setBusinessType] = useState<'individual' | 'company'>(store?.business_type || 'individual');
  const [payoutMethod, setPayoutMethod] = useState<'mobile_money' | 'bank'>(store?.payout_method || 'mobile_money');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const data: ApplicationInput = {
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
        city,
        business_type: businessType,
        payout_method: payoutMethod,
      };
      return store ? sellerApi.updateStore(data) : sellerApi.apply(data);
    },
    onSuccess: (s) => {
      client.setQueryData(keys.store, s);
      onDone?.(s);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const f = (name: string) => err?.field(name);
  const canSubmit =
    form.name.trim().length >= 3 && city !== null && form.business_address.trim() && form.contact_person.trim() && form.phone.trim();

  return (
    <View style={styles.wrap}>
      {save.isError ? (
        <Notice tone="danger">{err?.hasFieldErrors ? 'Please correct the highlighted fields.' : errorMessage(save.error)}</Notice>
      ) : null}
      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Your store
        </Text>
        <Input label="Store name" value={form.name} onChangeText={set('name')} maxLength={150} error={f('name')} hint="Shown to customers. At least 3 characters." />
        <Input
          label="What do you sell?"
          value={form.description}
          onChangeText={set('description')}
          maxLength={2000}
          multiline
          placeholder="Phones and accessories, original and with warranty…"
          error={f('description')}
        />
        <Picker
          label="City"
          value={city}
          options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
          onChange={setCity}
          placeholder={cities.isLoading ? 'Loading cities…' : cities.isError ? "Couldn't load cities" : 'Choose a city'}
          error={f('city')}
          hint="Where AGIZA collects your orders."
        />
        <Input label="Shop address" value={form.business_address} onChangeText={set('business_address')} maxLength={255} placeholder="Street, building, landmark" error={f('business_address')} />
        <Input label="Contact person" value={form.contact_person} onChangeText={set('contact_person')} maxLength={150} autoComplete="name" error={f('contact_person')} />
        <Input label="Business phone" value={form.phone} onChangeText={set('phone')} maxLength={32} keyboardType="phone-pad" error={f('phone')} />
        <Input
          label="Business email (optional)"
          value={form.email}
          onChangeText={set('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={f('email')}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Business details
        </Text>
        <Text variant="small" color={colors.textMuted}>
          AGIZA uses these to verify your business. They are never shown to customers.
        </Text>
        <Picker label="Business type" value={businessType} options={BUSINESS_TYPES as { value: 'individual' | 'company'; label: string }[]} onChange={setBusinessType} error={f('business_type')} />
        <Input label="Registered name (optional)" value={form.legal_name} onChangeText={set('legal_name')} maxLength={200} error={f('legal_name')} />
        <Input label="Registration no. (optional)" value={form.registration_number} onChangeText={set('registration_number')} maxLength={60} error={f('registration_number')} />
        <Input label="TIN (optional)" value={form.tin} onChangeText={set('tin')} maxLength={30} error={f('tin')} />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Where we pay you
        </Text>
        <Text variant="small" color={colors.textMuted}>
          AGIZA settles your earnings for delivered and paid orders to this account.
        </Text>
        <PayoutFields
          method={payoutMethod}
          onMethod={setPayoutMethod}
          provider={form.payout_provider}
          accountName={form.payout_account_name}
          accountNumber={form.payout_account_number}
          onChange={(k, v) => set(k)(v)}
          error={f}
        />
      </Card>

      <Button
        title={store ? 'Save and resubmit' : 'Submit application'}
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!canSubmit}
      />
      <Text variant="small" color={colors.textMuted} style={styles.center}>
        AGIZA reviews every application, usually within a few working days. By applying you accept the{' '}
        <Text variant="smallMedium" color={colors.primary} onPress={openSellerTerms} accessibilityRole="link">
          seller terms
        </Text>
        .
      </Text>
    </View>
  );
}

/** Method, provider/bank, account name and number: used when applying and in store settings. */
export function PayoutFields({
  method,
  onMethod,
  provider,
  accountName,
  accountNumber,
  onChange,
  error,
  disabled,
}: {
  method: 'mobile_money' | 'bank';
  onMethod: (m: 'mobile_money' | 'bank') => void;
  provider: string;
  accountName: string;
  accountNumber: string;
  onChange: (key: 'payout_provider' | 'payout_account_name' | 'payout_account_number', value: string) => void;
  error: (name: string) => string | undefined;
  disabled?: boolean;
}) {
  const bank = method === 'bank';
  return (
    <>
      <Picker
        label="Method"
        value={method}
        options={PAYOUT_METHODS as { value: 'mobile_money' | 'bank'; label: string }[]}
        onChange={onMethod}
        error={error('payout_method')}
        disabled={disabled}
      />
      <Input
        label={bank ? 'Bank' : 'Network'}
        value={provider}
        onChangeText={(v) => onChange('payout_provider', v)}
        maxLength={80}
        placeholder={bank ? 'e.g. CRDB' : 'e.g. M-Pesa'}
        error={error('payout_provider')}
        editable={!disabled}
      />
      <Input
        label="Account name"
        value={accountName}
        onChangeText={(v) => onChange('payout_account_name', v)}
        maxLength={150}
        error={error('payout_account_name')}
        editable={!disabled}
      />
      <Input
        label={bank ? 'Account number' : 'Phone number'}
        value={accountNumber}
        onChangeText={(v) => onChange('payout_account_number', v)}
        maxLength={60}
        keyboardType={bank ? 'number-pad' : 'phone-pad'}
        error={error('payout_account_number')}
        editable={!disabled}
      />
    </>
  );
}

/** "Edit my application" link-style button. */
export function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}>
      <Text variant="bodyMedium" color={colors.primary}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  card: { gap: space.md },
  center: { textAlign: 'center' },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
