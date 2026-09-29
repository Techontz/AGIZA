import { router } from 'expo-router';
import { ShoppingCart, Trash2 } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Button } from '@/components/ui/button';
import { Card, Row } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/stepper';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import type { CartLine } from '@/lib/api/types';
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
      <FlatList
        data={data.items}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={styles.list}
        refreshing={cart.isRefetching}
        onRefresh={() => cart.refetch()}
        ListHeaderComponent={
          mutationError ? <Notice tone="danger">{errorMessage(mutationError)}</Notice> : null
        }
        renderItem={({ item }) => <Line line={item} cart={cart} />}
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
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  footer: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
