import { router } from 'expo-router';
import { ChevronRight, ShoppingCart, Trash2 } from 'lucide-react-native';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { StoreAvatar, StoreName, openStore } from '@/components/store';
import { Button } from '@/components/ui/button';
import { Card, Row } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/stepper';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import type { Cart, CartLine, Seller } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { money } from '@/lib/format';
import { colors, space } from '@/theme/tokens';

function Line({ line, cart }: { line: CartLine; cart: ReturnType<typeof useCart> }) {
  const busy =
    (cart.setQuantity.isPending && cart.setQuantity.variables?.item === line.id) ||
    (cart.remove.isPending && cart.remove.variables === line.id);
  return (
    <Card>
      <View style={styles.line}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/product/[id]', params: { id: line.product_id } })}>
          <ProductImage uri={line.image} size={72} />
        </Pressable>
        <View style={styles.lineBody}>
          <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
            {line.name}
          </Text>
          {line.variant_name ? (
            <Text variant="small" color={colors.textMuted}>
              {line.variant_name}
            </Text>
          ) : null}
          <Text variant="small" color={colors.textMuted}>
            {money(line.unit_price)} each
          </Text>
          {line.imported && !line.issue ? (
            <Text variant="smallMedium" color={colors.brand}>
              Ships from {line.origin ?? 'abroad'} · paid when you order
            </Text>
          ) : null}
          {line.issue ? (
            <Text variant="smallMedium" color={colors.danger}>
              {line.issue}
            </Text>
          ) : null}
          <View style={styles.lineActions}>
            <QuantityStepper
              value={line.quantity}
              max={Math.max(line.quantity, Math.min(line.available, 100))}
              busy={busy}
              onChange={(quantity) => cart.setQuantity.mutate({ item: line.id, quantity })}
            />
            <Text variant="subheading" color={colors.ink}>
              {money(line.line_total)}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.name}`}
          hitSlop={10}
          disabled={busy}
          onPress={() => cart.remove.mutate(line.id)}>
          <Trash2 size={18} color={colors.textMuted} />
        </Pressable>
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
              <Text variant="small" color={colors.textMuted}>
                {section.vendor.name} subtotal
              </Text>
              <Text variant="bodyMedium" color={colors.ink}>
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
        <Row label={`Subtotal (${data.item_count} item${data.item_count === 1 ? '' : 's'})`} value={money(data.subtotal, data.currency)} strong />
        <Text variant="small" color={colors.textMuted}>
          Delivery is calculated at checkout.
        </Text>
        <Button title="Checkout" onPress={() => router.push('/checkout')} disabled={data.has_issues} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: space.lg, gap: space.md },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  lineBody: { flex: 1, gap: 3 },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  storeName: { flex: 1 },
  storeSubtotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xs },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  footer: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
