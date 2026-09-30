import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, ImagePlus, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Picker } from '@/components/picker';
import { PayoutFields } from '@/components/seller/application-form';
import { PrivateImage } from '@/components/seller/private-image';
import { StoreAvatar } from '@/components/seller/store-avatar';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { ApiError } from '@/lib/api/client';
import { sellerApi, shopApi } from '@/lib/api/endpoints';
import type { SellerStore } from '@/lib/api/types';
import { choosePhoto, pickDocument } from '@/lib/files';
import { date } from '@/lib/format';
import { keys } from '@/lib/query';
import { DOC_KINDS } from '@/lib/seller';
import { toast } from '@/lib/toast';
import { colors, radius, space } from '@/theme/tokens';

export default function StoreSettingsScreen() {
  const { store, suspended } = useStore();
  if (!store) return <Loading />;
  return (
    <FormScreen>
      <SuspendedBanner />
      <Media store={store} disabled={suspended} />
      <Details key={store.id} store={store} disabled={suspended} />
      <Documents disabled={suspended} />
    </FormScreen>
  );
}

function Media({ store, disabled }: { store: SellerStore; disabled: boolean }) {
  const client = useQueryClient();
  const [version, setVersion] = useState(() => Date.now());
  const upload = useMutation({
    mutationFn: async (kind: 'logo' | 'banner') => {
      const file = await choosePhoto(kind === 'logo' ? 'Store logo' : 'Store banner', kind === 'logo' ? [1, 1] : [4, 1]);
      return file ? { kind, store: await sellerApi.uploadMedia(kind, file) } : null;
    },
    onSuccess: (res) => {
      if (!res) return;
      client.setQueryData(keys.store, res.store);
      client.invalidateQueries({ queryKey: keys.dashboard });
      setVersion(Date.now());
      toast(res.kind === 'logo' ? 'Logo updated' : 'Banner updated');
    },
    onError: (e) => Alert.alert("Couldn't upload the picture", errorMessage(e)),
  });
  const busy = (kind: 'logo' | 'banner') => upload.isPending && upload.variables === kind;

  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.ink}>
        Logo and banner
      </Text>
      <View style={styles.bannerWrap}>
        {store.banner ? (
          <PrivateImage uri={store.banner} version={version} style={styles.banner} accessibilityLabel="Store banner" />
        ) : (
          <View style={[styles.banner, styles.bannerEmpty]}>
            <Text variant="small" color={colors.textMuted}>
              No banner yet
            </Text>
          </View>
        )}
      </View>
      <View style={styles.logoRow}>
        <StoreAvatar name={store.name} logo={store.logo} size={72} version={version} />
        <View style={styles.flex}>
          <MediaButton title={`${store.logo ? 'Change' : 'Upload'} logo`} busy={busy('logo')} disabled={disabled || upload.isPending} onPress={() => upload.mutate('logo')} />
          <MediaButton title={`${store.banner ? 'Change' : 'Upload'} banner`} busy={busy('banner')} disabled={disabled || upload.isPending} onPress={() => upload.mutate('banner')} />
        </View>
      </View>
      <Text variant="small" color={colors.textMuted}>
        Square logo, wide banner (about 4:1). JPEG, PNG or WebP up to 4 MB.
      </Text>
    </Card>
  );
}

function MediaButton({ title, busy, disabled, onPress }: { title: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.mediaButton, pressed && { backgroundColor: colors.background }, disabled && !busy && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator color={colors.brand} /> : <ImagePlus size={18} color={colors.ink} />}
      <Text variant="smallMedium" color={colors.ink}>
        {title}
      </Text>
    </Pressable>
  );
}

function Details({ store, disabled }: { store: SellerStore; disabled: boolean }) {
  const client = useQueryClient();
  const cities = useQuery({ queryKey: keys.cities, queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [form, setForm] = useState({
    description: store.description,
    business_address: store.business_address,
    contact_person: store.contact_person,
    phone: store.phone,
    email: store.email,
    payout_provider: store.payout_provider,
    payout_account_name: store.payout_account_name,
    payout_account_number: store.payout_account_number,
  });
  const [city, setCity] = useState<number | null>(store.city);
  const [method, setMethod] = useState<'mobile_money' | 'bank'>(store.payout_method || 'mobile_money');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => sellerApi.updateStore({ ...form, city, payout_method: method }),
    onSuccess: (s) => {
      client.setQueryData(keys.store, s);
      client.invalidateQueries({ queryKey: keys.dashboard });
      client.invalidateQueries({ queryKey: keys.earnings });
      toast('Store updated');
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const f = (name: string) => err?.field(name);

  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.ink}>
        Store details
      </Text>
      <Text variant="small" color={colors.textMuted}>
        Store name: <Text variant="smallMedium" color={colors.ink}>{store.name}</Text>. Contact AGIZA to change it. Commission: {store.commission}.
      </Text>
      <Input label="About your store" value={form.description} onChangeText={set('description')} multiline maxLength={2000} error={f('description')} editable={!disabled} />
      <Picker
        label="City"
        value={city}
        options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
        onChange={setCity}
        placeholder={store.city_name ?? 'Choose a city'}
        error={f('city')}
        disabled={disabled}
      />
      <Input label="Shop address" value={form.business_address} onChangeText={set('business_address')} maxLength={255} error={f('business_address')} editable={!disabled} />
      <Input label="Contact person" value={form.contact_person} onChangeText={set('contact_person')} maxLength={150} error={f('contact_person')} editable={!disabled} />
      <Input label="Business phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={32} error={f('phone')} editable={!disabled} />
      <Input
        label="Business email"
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        error={f('email')}
        editable={!disabled}
      />
      <Divider />
      <Text variant="heading" color={colors.ink}>
        Payout account
      </Text>
      <PayoutFields
        method={method}
        onMethod={setMethod}
        provider={form.payout_provider}
        accountName={form.payout_account_name}
        accountNumber={form.payout_account_number}
        onChange={(k, v) => set(k)(v)}
        error={f}
        disabled={disabled}
      />
      {save.isError ? <Notice tone="danger">{err?.hasFieldErrors ? 'Please correct the highlighted fields.' : errorMessage(save.error)}</Notice> : null}
      <Button title="Save changes" onPress={() => save.mutate()} loading={save.isPending} disabled={disabled} />
    </Card>
  );
}

function Documents({ disabled }: { disabled: boolean }) {
  const client = useQueryClient();
  const docs = useQuery({ queryKey: keys.documents, queryFn: sellerApi.documents });
  const [kind, setKind] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      const file = await pickDocument();
      return file ? sellerApi.uploadDocument(kind!, file) : null;
    },
    onSuccess: (list) => {
      if (!list) return;
      client.setQueryData(keys.documents, list);
      setKind(null);
      toast('Document uploaded');
    },
    onError: (e) => Alert.alert("Couldn't upload the document", errorMessage(e)),
  });

  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.ink}>
        Business documents
      </Text>
      <Text variant="small" color={colors.textMuted}>
        PDF or photo, up to 10 files. Only AGIZA staff can see them.
      </Text>
      {docs.isLoading ? (
        <ActivityIndicator color={colors.brand} />
      ) : docs.isError ? (
        <View style={styles.card}>
          <Notice tone="danger">{errorMessage(docs.error)}</Notice>
          <Button title="Try again" variant="secondary" onPress={() => docs.refetch()} />
        </View>
      ) : docs.data?.length ? (
        <View>
          {docs.data.map((d, i) => (
            <View key={d.id} style={[styles.doc, i > 0 && styles.docBorder]}>
              <FileText size={18} color={colors.textMuted} />
              <Text variant="bodyMedium" color={colors.ink} style={styles.flex}>
                {d.kind_display}
              </Text>
              <Text variant="small" color={colors.textMuted}>
                {date(d.uploaded_at)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="body" color={colors.textMuted}>
          No documents uploaded yet.
        </Text>
      )}
      <Picker label="Document type" value={kind} options={DOC_KINDS} onChange={setKind} disabled={disabled} />
      <Button
        title="Choose file"
        variant="secondary"
        icon={<Upload size={18} color={colors.ink} />}
        onPress={() => upload.mutate()}
        loading={upload.isPending}
        disabled={disabled || !kind || (docs.data?.length ?? 0) >= 10}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  flex: { flex: 1, gap: space.sm },
  bannerWrap: { borderRadius: radius.md, overflow: 'hidden' },
  banner: { width: '100%', aspectRatio: 4, borderRadius: radius.md },
  bannerEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  doc: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  docBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
