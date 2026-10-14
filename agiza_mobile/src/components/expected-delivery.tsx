import { CalendarClock, CircleCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ExpectedDelivery } from '@/lib/api/types';
import { date } from '@/lib/format';
import { colors, radius, space, themed } from '@/theme/tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue, 20 Oct 2026" for a YYYY-MM-DD date (read as a calendar day, not shifted by time zone). */
function day(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const local = new Date(y, m - 1, d);
  return `${DAYS[local.getDay()]}, ${date(local.toISOString())}`;
}

function isPast(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d) < today;
}

/** What to say about when the order arrives (`label` for lists, `headline` under a title), or null. */
export function expectedText(
  e: ExpectedDelivery | null | undefined,
): { label: string; headline: string; delivered: boolean } | null {
  if (!e) return null;
  if (e.delivered_at)
    return { label: `Delivered ${date(e.delivered_at)}`, headline: date(e.delivered_at), delivered: true };
  if (e.date) {
    const when = day(e.date);
    return { label: isPast(e.date) ? `Was expected ${when}` : `Expected ${when}`, headline: when, delivered: false };
  }
  if (e.text) return { label: `Expected in ${e.text}`, headline: `In ${e.text}`, delivered: false };
  return null;
}

/** The first thing on an order: when it should arrive. */
export function ExpectedDeliveryBanner({ value }: { value: ExpectedDelivery | null | undefined }) {
  const info = expectedText(value);
  if (!info) return null;
  const Icon = info.delivered ? CircleCheck : CalendarClock;
  const late = !info.delivered && !!value?.date && isPast(value.date);
  return (
    <View style={[styles.banner, info.delivered && styles.done]} accessibilityRole="summary">
      <Icon size={22} color={info.delivered ? colors.success : colors.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="overline" color={colors.textMuted}>
          {info.delivered ? 'Delivered' : 'Expected delivery'}
        </Text>
        <Text variant="heading" color={colors.ink}>
          {info.headline}
        </Text>
        {late ? (
          <Text variant="small" color={colors.textMuted}>
            Running late — AGIZA is following up and will update the date.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  done: { backgroundColor: colors.successSoft },
}));
