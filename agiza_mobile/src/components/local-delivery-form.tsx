import { ChevronRight, Package, Send } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Picker } from '@/components/picker';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { ApiError } from '@/lib/api/client';
import type { RequestInput } from '@/lib/api/endpoints';
import type { Address, City, Customer } from '@/lib/api/types';
import { colors, radius, space, themed } from '@/theme/tokens';

type Direction = 'send' | 'receive';
type Party = {
  name: string;
  phone: string;
  city: number | null;
  address: string;
};

const EMPTY: Party = { name: '', phone: '', city: null, address: '' };

const SIZES = [
  { value: 'small', label: 'Small', detail: 'Envelope, phone' },
  { value: 'medium', label: 'Medium', detail: 'Shoe box, laptop' },
  { value: 'large', label: 'Large', detail: 'Carton, TV' },
] as const;

/** Server fields this form shows (anything else the server rejects is surfaced by the screen). */
export const LOCAL_DELIVERY_FIELDS = [
  'item_name',
  'details',
  'package_size',
  'pickup_city',
  'pickup_address',
  'sender_name',
  'sender_phone',
  'destination_city',
  'dropoff_address',
  'contact_name',
  'contact_phone',
];

/**
 * "Deliver for me" inside Tanzania: a parcel moved city to city. The customer first says whether they
 * send or receive it; their own details fill that side (editable) and they enter the other party.
 * Staff see it as an Express Delivery quotation.
 */
export function useLocalDeliveryForm({
  customer,
  home,
  cities,
}: {
  customer: Customer | null;
  home: Address | undefined;
  cities: City[];
}) {
  const [direction, setDirection] = useState<Direction | null>(null);
  const [sender, setSender] = useState<Party>(EMPTY);
  const [receiver, setReceiver] = useState<Party>(EMPTY);
  const [item, setItem] = useState({
    name: '',
    type: '',
    size: '' as RequestInput['package_size'] | '',
    details: '',
  });

  const choose = (d: Direction) => {
    const me: Party = {
      name: customer?.full_name ?? '',
      phone: customer?.phone ?? '',
      city: home?.city ?? null,
      address: home ? [home.line1, home.area].filter(Boolean).join(', ') : '',
    };
    setSender(d === 'send' ? me : EMPTY);
    setReceiver(d === 'receive' ? me : EMPTY);
    setDirection(d);
  };

  const filled = (p: Party) => !!(p.name.trim() && p.phone.trim() && p.city && p.address.trim());
  const canSubmit = !!direction && filled(sender) && filled(receiver) && !!item.name.trim() && !!item.size;

  const payload = (): RequestInput => ({
    request_type: 'local_delivery',
    item_name: item.name.trim(),
    quantity: 1,
    package_size: item.size || undefined,
    // No separate server field: the item type leads the description staff read.
    details: [item.type.trim() && `Item type: ${item.type.trim()}`, item.details.trim()].filter(Boolean).join('\n'),
    pickup_city: sender.city,
    pickup_address: sender.address.trim(),
    sender_name: sender.name.trim(),
    sender_phone: sender.phone.trim(),
    destination_city: receiver.city,
    dropoff_address: receiver.address.trim(),
    contact_name: receiver.name.trim(),
    contact_phone: receiver.phone.trim(),
  });

  const cityOptions = cities.map((c) => ({
    value: c.id,
    label: c.name,
    detail: c.region,
  }));

  const fields = (err: ApiError | null): ReactNode =>
    !direction ? (
      <View style={styles.choices}>
        <Text variant="small" color={colors.textMuted}>
          Deliver packages, small or big, from one city to another anywhere in Tanzania.
        </Text>
        <Choice
          icon={<Send size={22} color={colors.ink} />}
          title="Send parcel"
          text="I want to send a package"
          onPress={() => choose('send')}
        />
        <Choice
          icon={<Package size={22} color={colors.ink} />}
          title="Receive parcel"
          text="I'm receiving a package"
          onPress={() => choose('receive')}
        />
      </View>
    ) : (
      <>
        <View style={styles.mode}>
          <Text variant="smallMedium" color={colors.ink}>
            {direction === 'send' ? 'You are sending a parcel' : 'You are receiving a parcel'}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setDirection(null)}>
            <Text variant="smallMedium" color={colors.primary}>
              Change
            </Text>
          </Pressable>
        </View>

        <Section title="Pickup information" />
        <Picker
          label="Pickup city *"
          value={sender.city}
          onChange={(city) => setSender((p) => ({ ...p, city }))}
          placeholder="Choose city"
          error={err?.field('pickup_city')}
          options={cityOptions}
        />
        <Input
          label="Pickup address *"
          value={sender.address}
          onChangeText={(address) => setSender((p) => ({ ...p, address }))}
          placeholder="Street, building, landmark"
          maxLength={300}
          error={err?.field('pickup_address')}
        />
        <Input
          label="Sender name *"
          value={sender.name}
          onChangeText={(name) => setSender((p) => ({ ...p, name }))}
          placeholder="Full name"
          maxLength={120}
          error={err?.field('sender_name')}
        />
        <Input
          label="Sender phone *"
          value={sender.phone}
          onChangeText={(phone) => setSender((p) => ({ ...p, phone }))}
          placeholder="+255 7xx xxx xxx"
          keyboardType="phone-pad"
          maxLength={30}
          error={err?.field('sender_phone')}
        />

        <Section title="Delivery information" />
        <Picker
          label="Delivery city *"
          value={receiver.city}
          onChange={(city) => setReceiver((p) => ({ ...p, city }))}
          placeholder="Choose city"
          error={err?.field('destination_city')}
          options={cityOptions}
        />
        <Input
          label="Delivery address *"
          value={receiver.address}
          onChangeText={(address) => setReceiver((p) => ({ ...p, address }))}
          placeholder="Street, building, landmark"
          maxLength={300}
          error={err?.field('dropoff_address')}
        />
        <Input
          label="Receiver name *"
          value={receiver.name}
          onChangeText={(name) => setReceiver((p) => ({ ...p, name }))}
          placeholder="Full name"
          maxLength={120}
          error={err?.field('contact_name')}
        />
        <Input
          label="Receiver phone *"
          value={receiver.phone}
          onChangeText={(phone) => setReceiver((p) => ({ ...p, phone }))}
          placeholder="+255 7xx xxx xxx"
          keyboardType="phone-pad"
          maxLength={30}
          error={err?.field('contact_phone')}
        />

        <Section title="Package details" />
        <Input
          label="Item name *"
          value={item.name}
          onChangeText={(name) => setItem((i) => ({ ...i, name }))}
          placeholder="e.g. Laptop, clothing, documents"
          maxLength={160}
          error={err?.field('item_name')}
        />
        <Input
          label="Item type (optional)"
          value={item.type}
          onChangeText={(type) => setItem((i) => ({ ...i, type }))}
          placeholder="e.g. Electronics, fragile, documents"
          maxLength={80}
        />
        <View style={styles.sizes}>
          <Text variant="smallMedium" color={colors.text}>
            Package size *
          </Text>
          <View style={styles.row}>
            {SIZES.map((s) => (
              <Pressable
                key={s.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: item.size === s.value }}
                onPress={() => setItem((i) => ({ ...i, size: s.value }))}
                style={[styles.size, item.size === s.value && styles.active]}>
                <Text variant="bodyMedium" color={colors.ink}>
                  {s.label}
                </Text>
                <Text variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
                  {s.detail}
                </Text>
              </Pressable>
            ))}
          </View>
          {err?.field('package_size') ? (
            <Text variant="small" color={colors.danger}>
              {err.field('package_size')}
            </Text>
          ) : null}
        </View>
        <Input
          label="Description (optional)"
          value={item.details}
          onChangeText={(details) => setItem((i) => ({ ...i, details }))}
          multiline
          placeholder="What's inside, special handling, delivery preferences…"
          maxLength={2000}
          error={err?.field('details')}
        />
      </>
    );

  return { direction, fields, canSubmit, payload };
}

function Section({ title }: { title: string }) {
  return (
    <Text variant="overline" color={colors.textMuted} style={styles.section}>
      {title}
    </Text>
  );
}

function Choice({ icon, title, text, onPress }: { icon: ReactNode; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.choice}>
      <View style={styles.choiceIcon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading" color={colors.ink}>
          {title}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {text}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = themed(() => ({
  choices: { gap: space.md },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  section: { marginTop: space.sm },
  sizes: { gap: 6 },
  row: { flexDirection: 'row', gap: space.sm },
  size: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  active: {
    borderColor: colors.ink,
    borderWidth: 1.5,
    backgroundColor: colors.primarySoft,
  },
}));
