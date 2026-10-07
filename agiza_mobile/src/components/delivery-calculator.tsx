/**
 * "Calculate delivery" on the product screen: pick a city and see what delivering this item
 * costs with each method, priced by the Shipping Engine on the server exactly as checkout prices
 * it (imported items: shipping to Tanzania, then delivery to the city).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Calculator, Plane, Truck } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Picker } from '@/components/picker';
import { Card, Divider } from '@/components/ui/card';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import type { ShippingOption } from '@/lib/api/types';
import { isFree, money } from '@/lib/format';
import { colors, space, themed } from '@/theme/tokens';

function OptionList({ title, icon: Icon, options }: { title: string; icon: typeof Truck; options: ShippingOption[] }) {
  const available = options.filter((o) => o.available);
  return (
    <View style={styles.list}>
      <View style={styles.inline}>
        <Icon size={16} color={colors.primary} />
        <Text variant="smallMedium" color={colors.ink}>
          {title}
        </Text>
      </View>
      {available.length ? (
        <Card style={styles.card}>
          {available.map((o, i) => (
            <View key={o.method_id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.option}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" color={colors.ink}>
                    {o.name}
                  </Text>
                  {o.estimated_delivery ? (
                    <Text variant="small" color={colors.textMuted}>
                      {o.estimated_delivery}
                    </Text>
                  ) : null}
                </View>
                <Text variant="bodyMedium" color={colors.ink}>
                  {isFree(o.cost) ? 'Free' : money(o.cost, o.currency)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Text variant="small" color={colors.textMuted}>
          {options.find((o) => o.message)?.message ?? 'Not available for this city yet. Contact AGIZA for a quote.'}
        </Text>
      )}
    </View>
  );
}

export function DeliveryCalculator({ variantId, quantity }: { variantId: number; quantity: number }) {
  const [city, setCity] = useState<number | null>(null);
  const cities = useQuery({ queryKey: ['cities'], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const estimate = useQuery({
    queryKey: ['delivery-estimate', variantId, city, quantity],
    queryFn: () => shopApi.deliveryEstimate(variantId, city!, quantity),
    enabled: city !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const data = estimate.data;

  return (
    <View style={styles.wrap}>
      <View style={styles.inline}>
        <Calculator size={18} color={colors.ink} />
        <Text variant="subheading" color={colors.ink}>
          Calculate delivery
        </Text>
      </View>
      <Picker
        label="Deliver to"
        value={city}
        placeholder={cities.isLoading ? 'Loading cities…' : 'Choose your city'}
        options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.region }))}
        onChange={setCity}
      />
      {city !== null && estimate.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {estimate.isError ? <Notice tone="danger">{errorMessage(estimate.error)}</Notice> : null}
      {city !== null && data ? (
        <>
          {data.imported ? (
            <OptionList title={`Shipping from ${data.ships_from ?? 'abroad'} to ${data.hub ?? 'Tanzania'}`} icon={Plane} options={data.import_options} />
          ) : null}
          <OptionList title={data.imported ? 'Then delivery to your city' : 'Delivery options'} icon={Truck} options={data.shipping_options} />
          {data.customs ? (
            <View style={styles.list}>
              {data.customs.lines.map((line) => (
                <View key={`${line.kind}-${line.name}`} style={styles.option}>
                  <Text variant="small" color={colors.ink} style={{ flex: 1 }}>
                    {line.treatment === 'estimate' ? `${line.name} (estimate)` : line.name}
                  </Text>
                  <Text variant="smallMedium" color={colors.ink}>
                    {money(line.amount, data.currency)}
                  </Text>
                </View>
              ))}
              <Text variant="small" color={colors.textMuted}>
                {data.customs.note}
              </Text>
            </View>
          ) : null}
          <Text variant="small" color={colors.textMuted}>
            For {quantity} item{quantity === 1 ? '' : 's'}. Final cost is confirmed at checkout for everything in your cart.
            {data.prepayment_required ? ' Imported items are paid when you order.' : ''}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  list: { gap: space.xs },
  card: { paddingVertical: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
}));
