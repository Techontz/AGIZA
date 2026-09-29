import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Crosshair } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Picker } from '@/components/picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { addressApi, shopApi } from '@/lib/api/endpoints';
import type { Address, City } from '@/lib/api/types';
import { keys } from '@/lib/query';
import { colors, space } from '@/theme/tokens';

type Pin = { latitude: string; longitude: string } | null;

export default function EditAddressScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id ? Number(id) : null;
  const cities = useQuery({ queryKey: keys.cities, queryFn: shopApi.cities, staleTime: 3_600_000 });
  const existing = useQuery({ queryKey: ['address', editing], queryFn: () => addressApi.get(editing!), enabled: editing !== null });
  if (cities.isLoading || existing.isLoading) return <Loading />;
  if (cities.isError || existing.isError) {
    return <ErrorState error={cities.error ?? existing.error} onRetry={() => (cities.refetch(), existing.refetch())} />;
  }
  return <AddressForm address={existing.data ?? null} cities={cities.data ?? []} />;
}

function AddressForm({ address, cities }: { address: Address | null; cities: City[] }) {
  const editing = address?.id ?? null;
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(address?.label ?? '');
  const [line1, setLine1] = useState(address?.line1 ?? '');
  const [area, setArea] = useState(address?.area ?? '');
  const [city, setCity] = useState<number | null>(address?.city ?? null);
  const [isDefault, setIsDefault] = useState(address?.is_default ?? false);
  const [pin, setPin] = useState<Pin>(
    address?.latitude && address.longitude ? { latitude: address.latitude, longitude: address.longitude } : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const data = { label: label.trim(), line1: line1.trim(), area: area.trim(), city: city!, is_default: isDefault, latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null };
      return editing ? addressApi.update(editing, data) : addressApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.addresses });
      queryClient.invalidateQueries({ queryKey: ['checkout-preview'] });
      router.back();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

  const useCurrentLocation = async () => {
    setLocationError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission was not given. You can still type the address.');
        return;
      }
      // A recent fix is instant; otherwise ask for a fresh one (GPS works where network location doesn't).
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 200 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      setPin({ latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) });
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      if (place) {
        if (!line1 && (place.street || place.name)) setLine1([place.name, place.street].filter(Boolean).join(', '));
        if (!area && (place.district || place.subregion)) setArea(place.district ?? place.subregion ?? '');
        const match = cities.find((c) => c.name.toLowerCase() === (place.city ?? '').toLowerCase());
        if (match && !city) setCity(match.id);
      }
    } catch {
      setLocationError("Couldn't get your location. Check that location is turned on.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          <Button
            title={editing ? 'Save address' : 'Add address'}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!line1.trim() || !city}
          />
        </View>
      }>
      <Stack.Screen options={{ title: editing ? 'Edit address' : 'New address' }} />
      {save.isError && !err?.details ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      <Button
        title={pin ? 'Location pinned · update' : 'Use my current location'}
        variant="secondary"
        icon={<Crosshair size={18} color={colors.ink} />}
        onPress={useCurrentLocation}
        loading={locating}
      />
      {locationError ? <Notice tone="warning">{locationError}</Notice> : null}
      {pin ? (
        <Text variant="small" color={colors.textMuted}>
          Pinned at {pin.latitude}, {pin.longitude}. The rider uses it to find you.
        </Text>
      ) : null}
      <Input label="Label (optional)" value={label} onChangeText={setLabel} placeholder="Home, Office…" maxLength={60} error={err?.field('label')} />
      <Input
        label="Street, building or landmark"
        value={line1}
        onChangeText={setLine1}
        placeholder="Plot 12, Mikocheni B, near the market"
        error={err?.field('line1')}
      />
      <Input label="Area / ward (optional)" value={area} onChangeText={setArea} placeholder="Mikocheni" error={err?.field('area')} />
      <Picker
        label="City"
        value={city}
        onChange={setCity}
        placeholder="Choose your city"
        error={err?.field('city')}
        options={cities.map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
      />
      <View style={styles.switchRow}>
        <Text variant="bodyMedium" color={colors.ink} style={{ flex: 1 }}>
          Use as my default address
        </Text>
        <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ true: colors.brand }} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { padding: space.lg, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
