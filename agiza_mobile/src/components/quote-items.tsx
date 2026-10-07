import { router } from 'expo-router';
import { ChevronRight, Link2 } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { PrivatePhotos } from '@/components/private-photos';
import { Text } from '@/components/ui/text';
import type { QuoteItemLine, QuoteRequest } from '@/lib/api/types';
import { money } from '@/lib/format';
import { colors, fonts, radius, space, themed } from '@/theme/tokens';

const SERVICE: Record<QuoteItemLine['service'], string> = {
  '': '',
  full_service: 'Buy for me',
  deliver_for_me: 'Deliver for me',
};

/** The items of a multi-item quotation: what each one is, its photos, its price and (once approved) its order. */
export function QuoteItems({ quote }: { quote: QuoteRequest }) {
  const items = quote.items ?? [];
  if (!items.length) return null;
  const photoUrl = new Map(quote.photos.map((p) => [p.id, p.url]));
  return (
    <View style={styles.list}>
      {items.map((it, i) => {
        const meta = [SERVICE[it.service], it.origin_country && `from ${it.origin_country}`, it.category]
          .filter(Boolean)
          .join(' · ');
        const urls = it.photo_ids.map((id) => photoUrl.get(id)).filter((u): u is string => !!u);
        return (
          <View key={it.id} style={[styles.item, i > 0 && styles.divider]}>
            <View style={styles.top}>
              <View style={styles.badge}>
                <Text style={styles.badgeText} color={colors.onPrimary}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium" color={colors.ink}>
                  {it.name}
                  {it.quantity > 1 ? <Text variant="body" color={colors.textMuted}>{`  ×${it.quantity}`}</Text> : null}
                </Text>
                {meta ? (
                  <Text variant="caption" color={colors.textMuted}>
                    {meta}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.amount} color={it.amount ? colors.ink : colors.textSubtle} numberOfLines={1}>
                {it.amount ? money(it.amount, quote.currency) : 'Price soon'}
              </Text>
            </View>
            {it.unit_price && it.quantity > 1 ? (
              <Text variant="caption" color={colors.textMuted}>
                {money(it.unit_price, quote.currency)} each
              </Text>
            ) : null}
            {it.tracking_number ? (
              <Text variant="caption" color={colors.textMuted}>
                Tracking: {it.tracking_number}
              </Text>
            ) : null}
            {it.notes ? (
              <Text variant="small" color={colors.text}>
                {it.notes}
              </Text>
            ) : null}
            {it.price_notes ? (
              <Text variant="small" color={colors.primary}>
                {it.price_notes}
              </Text>
            ) : null}
            {it.link ? (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(it.link).catch(() => null)} style={styles.link}>
                <Link2 size={14} color={colors.primary} />
                <Text variant="caption" color={colors.primary} numberOfLines={1} style={{ flex: 1 }}>
                  {it.link}
                </Text>
              </Pressable>
            ) : null}
            {urls.length ? <PrivatePhotos urls={urls} label={`Photo of ${it.name}`} /> : null}
            {it.order ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: it.order! } })}
                style={styles.order}>
                <Text variant="smallMedium" color={colors.ink} style={{ flex: 1 }}>
                  Order {it.order}
                </Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => ({
  list: { gap: space.md },
  item: { gap: space.sm },
  divider: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    marginTop: 1,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12 },
  amount: { fontFamily: fonts.bold, fontSize: 15, flexShrink: 0, maxWidth: '40%', textAlign: 'right' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
}));
