import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, ClipboardList, Plane, ShieldCheck, ShoppingBag, Truck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeliveryCalculator } from '@/components/delivery-calculator';
import { ProductReviews } from '@/components/product-reviews';
import { ProductImage, ProductTile } from '@/components/product-tile';
import { RatingSummaryLine } from '@/components/rating';
import { SellerRow } from '@/components/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/stepper';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { WishlistButton } from '@/components/wishlist-button';
import { useCart } from '@/hooks/use-cart';
import { useRequestProduct } from '@/hooks/use-request-product';
import { shopApi } from '@/lib/api/endpoints';
import type { ProductCard } from '@/lib/api/types';
import { productPlaceholder } from '@/lib/products';
import { useAuth } from '@/lib/auth/session';
import { money } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, fonts, radius, shadow, space, themed } from '@/theme/tokens';

function Perk({
  icon: Icon,
  title,
  text,
  tone = 'ok',
}: {
  icon: typeof Plane;
  title: string;
  text: string;
  tone?: 'ok' | 'off';
}) {
  return (
    <View style={styles.perk}>
      <View style={styles.perkIcon}>
        <Icon size={18} color={tone === 'off' ? colors.danger : colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="smallMedium" color={tone === 'off' ? colors.danger : colors.ink}>
          {title}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {text}
        </Text>
      </View>
    </View>
  );
}

function Suggestions({ title, products }: { title: string; products: ProductCard[] }) {
  return (
    <View style={styles.suggestions}>
      <Text variant="heading" color={colors.ink}>
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.suggestionRow}>
        {products.map((item) => (
          <ProductTile key={item.id} product={item} width={158} />
        ))}
      </ScrollView>
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const product = useQuery({
    queryKey: keys.product(productId),
    queryFn: () => shopApi.product(productId),
    // Show the tapped card straight away; the full product fills in a moment later.
    placeholderData: () => productPlaceholder(queryClient, productId),
  });
  const { request: requestProduct, mutation: requestIt } = useRequestProduct();
  const cart = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [bodyY, setBodyY] = useState(0);
  const [reviewsY, setReviewsY] = useState(0);

  const variants = product.data?.variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? variants.find((v) => v.is_default) ?? variants[0];

  if (product.isLoading) return <Loading />;
  if (product.isError || !product.data) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;
  const available = variant?.available ?? 0;
  const inCart = cart.data?.items.find((i) => i.variant_id === variant?.id)?.quantity ?? 0;
  const maxAdd = Math.max(0, Math.min(available - inCart, 100 - inCart));
  const compare = variant?.compare_at_price && Number(variant.compare_at_price) > Number(variant.price) ? variant.compare_at_price : null;
  const off = compare ? Math.round((1 - Number(variant?.price ?? p.price) / Number(compare)) * 100) : 0;
  const imageHeight = width * 1.02;

  const loadingFull = product.isPlaceholderData;
  const outOfStock = !loadingFull && !p.ships_from && available === 0 && p.can_request !== false;
  const request = () =>
    requestProduct({
      id: p.id,
      name: p.name,
      quantity,
      options: variant?.options.length ? variant.options.map((o) => o.value).join(' / ') : undefined,
    });

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
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.gallery}>
          {p.images.length ? (
            <FlatList
              data={p.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri) => uri}
              onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width, height: imageHeight }} contentFit="cover" transition={150} />
              )}
            />
          ) : (
            <View style={{ width, height: imageHeight * 0.8 }}>
              <ProductImage uri={null} />
            </View>
          )}
          {p.images.length > 1 ? (
            <View style={styles.counter}>
              <Text variant="caption" color="#FFFFFF" style={styles.counterText}>
                {imageIndex + 1} / {p.images.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body} onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
          {p.brand ? (
            <Text variant="overline" color={colors.primary}>
              {p.brand}
            </Text>
          ) : null}
          <Text variant="title" color={colors.ink}>
            {p.name}
          </Text>
          <View style={styles.badges}>
            <Badge label={p.condition_display} tone={p.condition === 'new' ? 'success' : 'warning'} />
            {p.ofa_kali ? <Badge label="Ofa kali" tone="brand" /> : null}
            <RatingSummaryLine
              rating={p.rating}
              count={p.rating_count}
              onPress={() => scroll.current?.scrollTo({ y: bodyY + reviewsY, animated: true })}
            />
          </View>
          <View style={styles.priceRow}>
            <Text variant="display" color={colors.ink}>
              {money(variant?.price ?? p.price)}
            </Text>
            {compare ? (
              <Text variant="body" color={colors.textSubtle} style={styles.strike}>
                {money(compare)}
              </Text>
            ) : null}
            {off >= 1 ? (
              <View style={styles.offPill}>
                <Text variant="caption" color={colors.onPrimary} style={{ fontFamily: fonts.bold }}>
                  -{off}%
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.perks}>
            {p.ships_from ? (
              <Perk icon={Plane} title={`Ships from ${p.ships_from}`} text="AGIZA orders it for you once you pay. Delivery cost and time below." />
            ) : (
              <Perk
                icon={Truck}
                title={available > 0 ? (available <= 3 ? `Only ${available} left` : 'In stock, ready to deliver') : 'Out of stock'}
                text={available > 0 ? 'Delivered from AGIZA in Tanzania.' : 'Request it below and AGIZA will source it for you.'}
                tone={available > 0 ? 'ok' : 'off'}
              />
            )}
            <Perk icon={ShieldCheck} title="AGIZA Support" text="Questions about this product? Chat with us in the app." />
          </View>

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
                      <Text variant="smallMedium" color={active ? colors.onHero : colors.text}>
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

          {variant ? <DeliveryCalculator variantId={variant.id} quantity={quantity} /> : null}

          {p.bought_together?.length ? (
            <Suggestions title="Frequently bought together" products={p.bought_together} />
          ) : null}

          <View onLayout={(e) => setReviewsY(e.nativeEvent.layout.y)}>
            <ProductReviews productId={p.id} name={p.name} />
          </View>

          {p.related?.length ? <Suggestions title="You may also like" products={p.related} /> : null}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: top + space.sm }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.roundButton}>
          <ArrowLeft size={20} color="#121212" />
        </Pressable>
        <View style={styles.roundButton}>
          <WishlistButton productId={p.id} name={p.name} size={44} />
        </View>
      </View>

      <View style={styles.footer}>
        {cart.add.isError ? <Notice tone="danger">{errorMessage(cart.add.error)}</Notice> : null}
        {requestIt.isError ? <Notice tone="danger">{errorMessage(requestIt.error)}</Notice> : null}
        {outOfStock ? (
          <Text variant="caption" color={colors.textMuted} style={styles.center}>
            Out of stock. Request it and AGIZA will source it and send you a price.
          </Text>
        ) : null}
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
          {outOfStock ? (
            <>
              <QuantityStepper value={quantity} max={100} onChange={setQuantity} />
              <Button
                title="Request this product"
                variant="dark"
                icon={<ClipboardList size={18} color={colors.onHero} />}
                onPress={request}
                loading={requestIt.isPending}
                style={styles.addButton}
              />
            </>
          ) : (
            <>
              {maxAdd > 0 ? <QuantityStepper value={quantity} max={maxAdd} onChange={setQuantity} /> : null}
              <Button
                title={loadingFull ? 'Loading…' : maxAdd === 0 ? 'All stock in cart' : 'Add to cart'}
                icon={<ShoppingBag size={18} color={maxAdd === 0 || loadingFull ? colors.textSubtle : colors.onPrimary} />}
                onPress={addToCart}
                loading={cart.add.isPending}
                disabled={maxAdd === 0 || loadingFull}
                style={styles.addButton}
              />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: space.xl },
  gallery: { backgroundColor: colors.surfaceMuted },
  counter: {
    position: 'absolute',
    right: space.lg,
    bottom: space.xxxl + space.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,18,18,0.55)',
  },
  counterText: { fontFamily: fonts.semibold },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  body: {
    marginTop: -radius.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.background,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    gap: space.md,
  },
  badges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs },
  strike: { textDecorationLine: 'line-through' },
  offPill: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  perks: {
    marginTop: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  perk: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  perkIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { gap: space.sm, marginTop: space.md },
  seller: { padding: space.md, marginTop: space.xs },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  variant: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  variantActive: { borderColor: colors.hero, backgroundColor: colors.hero },
  variantOut: { opacity: 0.4 },
  spec: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  specValue: { flexShrink: 1, textAlign: 'right' },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow.float,
  },
  footerRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addButton: { flex: 1 },
  center: { textAlign: 'center' },
  suggestions: { gap: space.md, marginTop: space.lg },
  suggestionRow: { gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.md },
  bleed: { marginHorizontal: -space.xl },
}));
