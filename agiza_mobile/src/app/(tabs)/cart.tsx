import { router } from 'expo-router';
import { ArrowRight, ChevronRight, Plane, ShoppingCart, Trash2 } from 'lucide-react-native';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { StoreAvatar, StoreName, openStore } from '@/components/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/stepper';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import type { Cart, CartLine, Seller } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { money } from '@/lib/format';
import { colors, fonts, radius, shadow, space, themed } from '@/theme/tokens';

function Line({ line, cart }: { line: CartLine; cart: ReturnType<typeof useCart> }) {
  const busy =
    (cart.setQuantity.isPending && cart.setQuantity.variables?.item === line.id) ||
    (cart.remove.isPending && cart.remove.variables === line.id);
  return (
    <Card style={styles.card}>
      <View style={styles.line}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${line.name}`}
          onPress={() => router.push({ pathname: '/product/[id]', params: { id: line.product_id } })}
          style={styles.thumb}>
          <ProductImage uri={line.image} size={76} />
        </Pressable>
        <View style={styles.lineBody}>
          <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
            {line.name}
          </Text>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {[line.variant_name, `${money(line.unit_price)} each`].filter(Boolean).join(' · ')}
          </Text>
          {line.imported && !line.issue ? (
            <View style={styles.tag}>
              <Plane size={12} color={colors.primary} />
              <Text variant="caption" color={colors.primary} numberOfLines={1} style={styles.tagText}>
                Ships from {line.origin ?? 'abroad'}
              </Text>
            </View>
          ) : null}
          {line.issue ? (
            <Text variant="smallMedium" color={colors.danger}>
              {line.issue}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.name}`}
          hitSlop={10}
          disabled={busy}
          onPress={() => cart.remove.mutate(line.id)}
          style={styles.remove}>
          <Trash2 size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      {/* Full card width, so long totals never run out of the card. */}
      <View style={styles.lineFooter}>
        <QuantityStepper
          value={line.quantity}
          max={Math.max(line.quantity, Math.min(line.available, 100))}
          busy={busy}
          onChange={(quantity) => cart.setQuantity.mutate({ item: line.id, quantity })}
        />
        <Text style={styles.lineTotal} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {money(line.line_total)}
        </Text>
      </View>
    </Card>
  );
}

type StoreSection = { key: string; vendor: Seller | null; subtotal: string | null; data: CartLine[] };

/** The cart's lines under their seller, in the server's group order (AGIZA first). */
function bySeller(cart: Cart): StoreSection[] {
  const groups = cart.groups ?? [];
  const placed = new Set<number>();
  const sections: StoreSection[] = groups.map((g) => {
    const data = cart.items.filter((line) => g.variant_ids.includes(line.variant_id));
    data.forEach((line) => placed.add(line.id));
    return { key: g.vendor.slug, vendor: g.vendor, subtotal: g.subtotal, data };
  });
  const rest = cart.items.filter((line) => !placed.has(line.id));
  if (rest.length) sections.push({ key: '_other', vendor: null, subtotal: null, data: rest });
  return sections.filter((section) => section.data.length);
}

function StoreHeader({ vendor }: { vendor: Seller }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Sold by ${vendor.name}. Open store`}
      onPress={() => openStore(vendor.slug)}
      style={styles.storeHeader}>
      <StoreAvatar seller={vendor} size={28} />
      <View style={styles.storeName}>
        <StoreName seller={vendor} variant="subheading" />
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

export default function CartScreen() {
  const { status } = useAuth();
  const cart = useCart();

  if (status !== 'signedIn') {
    return <SignInPrompt icon={ShoppingCart} title="Your cart" message="Sign in to add products and check out." />;
  }
  if (cart.isLoading) return <Loading />;
  if (cart.isError || !cart.data) return <ErrorState error={cart.error} onRetry={() => cart.refetch()} />;
  const data = cart.data;
  const mutationError = cart.setQuantity.error ?? cart.remove.error;
  const sections = bySeller(data);

  if (!data.items.length) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        message="Browse the shop and add what you like."
        action={<Button title="Start shopping" onPress={() => router.push('/shop')} style={{ minWidth: 200 }} />}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(l) => String(l.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshing={cart.isRefetching}
        onRefresh={() => cart.refetch()}
        ListHeaderComponent={
          mutationError ? <Notice tone="danger">{errorMessage(mutationError)}</Notice> : null
        }
        renderSectionHeader={({ section }) => (section.vendor ? <StoreHeader vendor={section.vendor} /> : null)}
        renderItem={({ item }) => <Line line={item} cart={cart} />}
        renderSectionFooter={({ section }) =>
          sections.length > 1 && section.subtotal !== null && section.vendor ? (
            <View style={styles.storeSubtotal}>
              <Text variant="small" color={colors.textMuted} numberOfLines={1} style={styles.shrink}>
                {section.vendor.name} subtotal
              </Text>
              <Text variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                {money(section.subtotal, data.currency)}
              </Text>
            </View>
          ) : null
        }
      />
      <View style={styles.footer}>
        {data.has_issues ? (
          <Notice tone="warning">Update or remove the highlighted items to continue.</Notice>
        ) : null}
        <View style={styles.totalRow}>
          <Text variant="small" color={colors.textMuted}>
            Subtotal · {data.item_count} item{data.item_count === 1 ? '' : 's'}
          </Text>
          <Text style={styles.total} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {money(data.subtotal, data.currency)}
          </Text>
        </View>
        <Button
          title="Checkout"
          icon={<ArrowRight size={18} color={colors.onPrimary} />}
          onPress={() => router.push('/checkout')}
          disabled={data.has_issues}
        />
        <Text variant="caption" color={colors.textMuted} style={styles.center}>
          Delivery is calculated at checkout.
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1 },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: { padding: space.md, gap: space.md },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  thumb: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  lineBody: { flex: 1, gap: 4, paddingTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  tagText: { flexShrink: 1 },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  lineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  lineTotal: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.2 },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  storeName: { flex: 1 },
  storeSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xs,
  },
  shrink: { flexShrink: 1 },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.float,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  total: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.4 },
  center: { textAlign: 'center' },
}));
