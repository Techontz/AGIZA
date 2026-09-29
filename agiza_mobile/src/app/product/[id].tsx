import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Check, ShoppingCart, Truck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductImage } from '@/components/product-tile';
import { SellerRow } from '@/components/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/stepper';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import { shopApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { money } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { width } = useWindowDimensions();
  const { status } = useAuth();
  const product = useQuery({ queryKey: keys.product(productId), queryFn: () => shopApi.product(productId) });
  const cart = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);

  const variant = useMemo(() => {
    const variants = product.data?.variants ?? [];
    return variants.find((v) => v.id === variantId) ?? variants.find((v) => v.is_default) ?? variants[0];
  }, [product.data, variantId]);

  if (product.isLoading) return <Loading />;
  if (product.isError || !product.data) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;
  const available = variant?.available ?? 0;
  const inCart = cart.data?.items.find((i) => i.variant_id === variant?.id)?.quantity ?? 0;
  const maxAdd = Math.max(0, Math.min(available - inCart, 100 - inCart));
  const compare = variant?.compare_at_price && Number(variant.compare_at_price) > Number(variant.price) ? variant.compare_at_price : null;

  const addToCart = () => {
    if (status !== 'signedIn') return router.push('/login');
    if (!variant) return;
    setAdded(false);
    cart.add.mutate(
      { variant: variant.id, quantity },
      {
        onSuccess: () => {
          setAdded(true);
          setQuantity(1);
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          {p.images.length ? (
            <FlatList
              data={p.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri) => uri}
              onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width, height: width }} contentFit="cover" transition={150} />
              )}
            />
          ) : (
            <View style={{ width, height: width * 0.8 }}>
              <ProductImage uri={null} />
            </View>
          )}
          {p.images.length > 1 ? (
            <View style={styles.dots}>
              {p.images.map((uri, i) => (
                <View key={uri} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.badges}>
            {p.brand ? <Badge label={p.brand} /> : null}
            <Badge label={p.condition_display} tone={p.condition === 'new' ? 'success' : 'warning'} />
            {p.ofa_kali ? <Badge label="Ofa kali" tone="brand" /> : null}
          </View>
          <Text variant="title" color={colors.ink}>
            {p.name}
          </Text>
          <View style={styles.priceRow}>
            <Text variant="title" color={colors.primary}>
              {money(variant?.price ?? p.price)}
            </Text>
            {compare ? (
              <Text variant="body" color={colors.textSubtle} style={styles.strike}>
                {money(compare)}
              </Text>
            ) : null}
          </View>
          <Text variant="smallMedium" color={available > 0 ? colors.success : colors.danger}>
            {available > 0 ? (available <= 3 ? `Only ${available} left` : 'In stock') : 'Out of stock'}
          </Text>

          {p.vendor ? (
            <Card style={styles.seller}>
              <SellerRow seller={p.vendor} caption="Sold by" />
            </Card>
          ) : null}

          {p.variants.length > 1 ? (
            <View style={styles.block}>
              <Text variant="subheading" color={colors.ink}>
                Options
              </Text>
              <View style={styles.variants}>
                {p.variants.map((v) => {
                  const active = v.id === variant?.id;
                  return (
                    <Pressable
                      key={v.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled: v.available === 0 }}
                      onPress={() => {
                        setVariantId(v.id);
                        setQuantity(1);
                        setAdded(false);
                      }}
                      style={[styles.variant, active && styles.variantActive, v.available === 0 && styles.variantOut]}>
                      <Text variant="smallMedium" color={active ? colors.primary : colors.text}>
                        {v.options.length ? v.options.map((o) => o.value).join(' / ') : v.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {p.description ? (
            <View style={styles.block}>
              <Text variant="subheading" color={colors.ink}>
                Description
              </Text>
              <Text variant="body" color={colors.text}>
                {p.description}
              </Text>
            </View>
          ) : null}

          {p.specifications.length ? (
            <Card>
              {p.specifications.map((s, i) => (
                <View key={s.name}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.spec}>
                    <Text variant="small" color={colors.textMuted}>
                      {s.name}
                    </Text>
                    <Text variant="smallMedium" color={colors.ink} style={styles.specValue}>
                      {s.value}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <View style={styles.delivery}>
            <Truck size={18} color={colors.textMuted} />
            <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              Delivery options and cost are calculated at checkout for your address
              {p.shipping_methods.length ? ` (${p.shipping_methods.join(', ')})` : ''}.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {cart.add.isError ? <Notice tone="danger">{errorMessage(cart.add.error)}</Notice> : null}
        {added ? (
          <View style={styles.addedRow}>
            <Check size={16} color={colors.success} />
            <Text variant="smallMedium" color={colors.success} style={{ flex: 1 }}>
              Added to your cart
            </Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/cart')} hitSlop={8}>
              <Text variant="smallMedium" color={colors.primary}>
                View cart
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          {maxAdd > 0 ? <QuantityStepper value={quantity} max={maxAdd} onChange={setQuantity} /> : null}
          <Button
            title={available === 0 ? 'Out of stock' : maxAdd === 0 ? 'All stock in cart' : 'Add to cart'}
            icon={<ShoppingCart size={18} color="#FFFFFF" />}
            onPress={addToCart}
            loading={cart.add.isPending}
            disabled={maxAdd === 0}
            style={styles.addButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: space.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, position: 'absolute', bottom: space.md, width: '100%' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { backgroundColor: colors.brand, width: 18 },
  body: { padding: space.lg, gap: space.md },
  badges: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  strike: { textDecorationLine: 'line-through' },
  block: { gap: space.sm, marginTop: space.sm },
  seller: { padding: space.md, marginTop: space.xs },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  variant: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  variantActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  variantOut: { opacity: 0.45 },
  spec: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  specValue: { flexShrink: 1, textAlign: 'right' },
  delivery: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginTop: space.sm },
  footer: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addButton: { flex: 1 },
});
