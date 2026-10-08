import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { LOCAL_DELIVERY_FIELDS, useLocalDeliveryForm } from '@/components/local-delivery-form';
import { WarehouseCard } from '@/components/warehouse-card';
import { Picker } from '@/components/picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { addressApi, requestApi, shopApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, radius, space, themed } from '@/theme/tokens';

const MAX_PHOTOS = 5; // the backend's limit per request
const LOCAL = 'TZ';

type Photo = ImagePicker.ImagePickerAsset;

const SHIPPING = [
  { value: 'air', label: 'Air' },
  { value: 'sea', label: 'Sea' },
] as const;

const TYPES = [
  { value: 'buy_for_me', title: 'Buy for me', text: 'AGIZA buys the item abroad and ships it to you.' },
  { value: 'deliver_for_me', title: 'Deliver for me', text: 'You already bought it; AGIZA ships it to Tanzania.' },
] as const;

export default function NewRequestScreen() {
  const params = useLocalSearchParams<{ type?: 'buy_for_me' | 'deliver_for_me' }>();
  const queryClient = useQueryClient();
  const { customer } = useAuth();
  const countries = useQuery({ queryKey: keys.countries, queryFn: shopApi.sourcingCountries, staleTime: 3_600_000 });
  const warehouses = useQuery({ queryKey: keys.warehouses, queryFn: shopApi.warehouses, staleTime: 60 * 60_000 });
  const cities = useQuery({ queryKey: keys.cities, queryFn: shopApi.cities, staleTime: 3_600_000 });
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressApi.list });
  const [type, setType] = useState<'buy_for_me' | 'deliver_for_me'>(params.type ?? 'buy_for_me');
  const [form, setForm] = useState({ item_name: '', weight_kg: '', tracking_number: '', details: '' });
  const [origin, setOrigin] = useState<string | null>(null);
  const [chosenCity, setCity] = useState<number | null>(null);
  const [shipping, setShipping] = useState<'air' | 'sea' | ''>('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Staff need to know where the cargo goes, so both request types ask; it starts on the default address's city.
  const home = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const city = chosenCity ?? home?.city ?? null;

  const buy = type === 'buy_for_me';
  // "Deliver for me" from Tanzania itself is a parcel moved between two cities (an Express Delivery for staff).
  const local = !buy && origin === LOCAL;
  const localForm = useLocalDeliveryForm({ customer, home, cities: cities.data ?? [] });

  const submit = useMutation({
    mutationFn: async () => {
      // "Buy for me" only asks what the product is; AGIZA works out the rest and replies with a price.
      const quote = await requestApi.create(
        local
          ? localForm.payload()
          : buy
          ? { request_type: type, item_name: form.item_name.trim(), quantity: 1, details: form.details.trim(), destination_city: city }
          : {
              request_type: type,
              item_name: form.item_name.trim(),
              quantity: 1,
              origin_country: origin!,
              destination_city: city,
              weight_kg: form.weight_kg.trim() ? form.weight_kg.trim() : null,
              tracking_number: form.tracking_number.trim(),
              shipping_method: shipping,
              details: form.details.trim(),
            },
      );
      // The request already exists, so a failed photo upload doesn't undo it, but the customer is
      // told (instead of the photo disappearing silently) and can send it in the request's chat.
      let photosFailed = 0;
      for (const photo of photos)
        await requestApi.addPhoto(quote.id, photo).catch(() => {
          photosFailed += 1;
        });
      return { quote, photosFailed };
    },
    onSuccess: ({ quote, photosFailed }) => {
      queryClient.invalidateQueries({ queryKey: keys.requests });
      router.replace({ pathname: '/requests/[id]', params: { id: quote.id, created: '1' } });
      if (photosFailed) {
        Alert.alert(
          photosFailed === 1 ? "A photo couldn't be uploaded" : `${photosFailed} photos couldn't be uploaded`,
          'Your request was sent. Check your internet connection, then send the photo to AGIZA in the chat.',
        );
      }
    },
  });
  const shipTo = warehouses.data?.results.find((w) => w.country.code === origin);
  const err = submit.error instanceof ApiError ? submit.error : null;
  // Server errors on fields this form doesn't show (e.g. an older server asking for a country) must
  // still be visible, or the button just seems to do nothing.
  const shown = local
    ? LOCAL_DELIVERY_FIELDS
    : buy
    ? ['item_name', 'details', 'destination_city']
    : ['origin_country', 'tracking_number', 'item_name', 'details', 'weight_kg', 'destination_city'];
  const hiddenError =
    err?.details && typeof err.details === 'object' && !shown.some((f) => err.field(f))
      ? Object.keys(err.details as object).map((f) => err.field(f)).find(Boolean) ?? err.message
      : null;

  if (countries.isLoading || cities.isLoading) return <Loading />;
  if (countries.isError || cities.isError) {
    return <ErrorState error={countries.error ?? cities.error} onRetry={() => (countries.refetch(), cities.refetch())} />;
  }
  const canSubmit = local
    ? localForm.canSubmit
    : buy
    ? !!(form.item_name.trim() && city)
    : !!(origin && city && form.tracking_number.trim() && form.item_name.trim() && photos.length);
  const deliverTo = (
    <Picker
      label="Deliver to *"
      value={city}
      onChange={setCity}
      placeholder="Choose region"
      error={err?.field('destination_city')}
      options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
    />
  );

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          <Button title={buy ? 'Place Order' : local ? 'Request delivery quotation' : 'Send request'} onPress={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit} />
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
            <Text variant="subheading" color={colors.ink}>
              {t.title}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {t.text}
            </Text>
          </Pressable>
        ))}
      </View>
      {submit.isError && !err?.details ? <Notice tone="danger">{errorMessage(submit.error)}</Notice> : null}
      {hiddenError ? <Notice tone="danger">{`${hiddenError} Please try again later or chat with AGIZA.`}</Notice> : null}
      {buy ? (
        <>
          <Input
            label="Product name *"
            value={form.item_name}
            onChangeText={set('item_name')}
            placeholder="What do you want to order?"
            maxLength={160}
            error={err?.field('item_name')}
          />
          {deliverTo}
          <Input
            label="Description"
            value={form.details}
            onChangeText={set('details')}
            multiline
            placeholder="Add product specifications, links, colors, or quantity."
            maxLength={2000}
            error={err?.field('details')}
          />
          <Photos label="Upload product photo (optional)" photos={photos} onChange={setPhotos} />
          <Text variant="small" color={colors.textMuted}>
            AGIZA replies with the price. You only pay after you accept it.
          </Text>
        </>
      ) : (
        <>
          {/* A parcel already bought: first where it ships from, then the rest of the form. */}
          <Picker
            label="Country shipping from *"
            value={origin}
            onChange={setOrigin}
            placeholder="Choose country"
            error={err?.field('origin_country')}
            options={[
              { value: LOCAL, label: 'Tanzania', detail: 'Send or receive a parcel within Tanzania' },
              ...(countries.data ?? []).filter((c) => c.iso2 !== LOCAL).map((c) => ({ value: c.iso2, label: c.name })),
            ]}
          />
          {local ? (
            <>
              {localForm.fields(err)}
              {localForm.direction ? (
                <>
                  <Photos label="Package photo (optional)" photos={photos} onChange={setPhotos} />
                  <Text variant="small" color={colors.textMuted}>
                    AGIZA replies with the delivery price. You only pay after you accept it.
                  </Text>
                </>
              ) : null}
            </>
          ) : origin ? (
            <>
              {shipTo ? (
                <View style={styles.shipTo}>
                  <Text variant="smallMedium" color={colors.ink}>
                    Your supplier should send the parcel to AGIZA here:
                  </Text>
                  <WarehouseCard warehouse={shipTo} compact />
                </View>
              ) : null}
              <Input
                label="Tracking number *"
                value={form.tracking_number}
                onChangeText={set('tracking_number')}
                autoCapitalize="characters"
                maxLength={80}
                error={err?.field('tracking_number')}
              />
              <Input
                label="Package / item name *"
                value={form.item_name}
                onChangeText={set('item_name')}
                placeholder="e.g. 2 cartons of shoes"
                maxLength={160}
                error={err?.field('item_name')}
              />
              {deliverTo}
              <Input
                label="Description (optional)"
                value={form.details}
                onChangeText={set('details')}
                multiline
                placeholder="What's inside, colours, sizes…"
                maxLength={2000}
                error={err?.field('details')}
              />
              <Photos label="Package photo *" photos={photos} onChange={setPhotos} />
              <View style={styles.photos}>
                <Text variant="smallMedium" color={colors.text}>
                  Shipping method (optional)
                </Text>
                <View style={styles.types}>
                  {SHIPPING.map((m) => (
                    <Pressable
                      key={m.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: shipping === m.value }}
                      onPress={() => setShipping((cur) => (cur === m.value ? '' : m.value))}
                      style={[styles.method, shipping === m.value && styles.typeActive]}>
                      <Text variant="bodyMedium" color={colors.ink}>
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Input
                label="Approx. package weight kg (optional)"
                value={form.weight_kg}
                onChangeText={(v) => set('weight_kg')(v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                keyboardType="decimal-pad"
                error={err?.field('weight_kg')}
              />
              <Text variant="small" color={colors.textMuted}>
                AGIZA replies with the price. You only pay after you accept it.
              </Text>
            </>
          ) : null}
        </>
      )}
    </FormScreen>
  );
}

/** Gallery photos for a request, uploaded after it is created. */
function Photos({ label, photos, onChange }: { label: string; photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.7, // re-encodes to JPEG, which also turns iPhone HEIC photos into something the server accepts
    });
    if (!res.canceled) onChange([...photos, ...res.assets].slice(0, MAX_PHOTOS));
  };
  return (
    <View style={styles.photos}>
      <Text variant="smallMedium" color={colors.text}>
        {label}
      </Text>
      {photos.length ? (
        <View style={styles.thumbs}>
          {photos.map((p, i) => (
            <View key={p.uri} style={styles.thumb}>
              <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={8}
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                style={styles.remove}>
                <X size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {photos.length < MAX_PHOTOS ? (
        <Pressable accessibilityRole="button" onPress={pick} style={styles.dropzone}>
          <Upload size={24} color={colors.textMuted} />
          <Text variant="subheading" color={colors.ink}>
            {photos.length ? 'Add more photos' : 'Choose from gallery'}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            JPG or PNG, up to {MAX_PHOTOS} photos
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  shipTo: { gap: space.sm },
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
  typeActive: { borderColor: colors.ink, borderWidth: 1.5, backgroundColor: colors.primarySoft },
  method: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photos: { gap: 6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 76, height: 76, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.border },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dropzone: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  footer: { padding: space.lg, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
}));
