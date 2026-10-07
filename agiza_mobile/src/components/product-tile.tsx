import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ClipboardList, Package } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RatingInline } from '@/components/rating';
import { VerifiedMark } from '@/components/store';
import { WishlistButton } from '@/components/wishlist-button';
import { Text } from '@/components/ui/text';
import { useRequestProduct } from '@/hooks/use-request-product';
import type { ProductCard } from '@/lib/api/types';
import { money } from '@/lib/format';
import { prefetchProduct } from '@/lib/products';
import { colors, fonts, radius, shadow, space, themed } from '@/theme/tokens';

export function ProductImage({ uri, size }: { uri: string | null; size?: number }) {
  if (!uri) {
    return (
      <View style={[styles.placeholder, size ? { width: size, height: size } : styles.fill]}>
        <Package size={28} color={colors.textSubtle} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={size ? { width: size, height: size, borderRadius: radius.md } : styles.fill}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}

/** "8 in stock" / "Out of stock" (+ Request) / "Ships from China", always one row tall. */
function StockRow({ product }: { product: ProductCard }) {
  const { request, mutation } = useRequestProduct();
  const outOfStock = !product.in_stock && !product.ships_from;
  const canRequest = outOfStock && product.can_request !== false;
  const left = product.available;
  return (
    <View style={styles.stock}>
      {product.ships_from ? (
        <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.stockText}>
          Ships from {product.ships_from}
        </Text>
      ) : outOfStock ? (
        <Text variant="caption" color={colors.danger} numberOfLines={1} style={[styles.stockText, styles.stockStrong]}>
          Out of stock
        </Text>
      ) : (
        <Text variant="caption" color={colors.success} numberOfLines={1} style={[styles.stockText, styles.stockStrong]}>
          {left !== undefined ? `${left} in stock` : 'In stock'}
        </Text>
      )}
      {canRequest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Request ${product.name}`}
          accessibilityHint="Asks AGIZA to source it and send you a price"
          hitSlop={6}
          disabled={mutation.isPending}
          onPress={() => request({ id: product.id, name: product.name })}
          style={({ pressed }) => [styles.request, (pressed || mutation.isPending) && { opacity: 0.8 }]}>
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={colors.onHero} />
          ) : (
            <>
              <ClipboardList size={12} color={colors.onHero} />
              <Text style={styles.requestText} color={colors.onHero}>
                Request
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProductTile({ product, width }: { product: ProductCard; width: number }) {
  const hasRange = product.price !== product.price_max;
  const discount =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? product.compare_at_price : null;
  const off = discount ? Math.round((1 - Number(product.price) / Number(discount)) * 100) : 0;
  const imageSize = width - TILE_PAD * 2;
  const queryClient = useQueryClient();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${money(product.price)}${product.vendor ? `, sold by ${product.vendor.name}` : ''}${
        product.rating_count ? `, rated ${product.rating} out of 5` : ''
      }`}
      onPressIn={() => prefetchProduct(queryClient, product.id)}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}>
      <View style={[styles.imageWrap, { height: imageSize }]}>
        <ProductImage uri={product.image} />
        {/* Stock is shown under the price (with Request when it's out). */}
        {off >= 5 ? (
          <View style={[styles.flag, styles.offFlag]}>
            <Text variant="caption" color={colors.onPrimary} style={styles.offText}>
              -{off}%
            </Text>
          </View>
        ) : product.ofa_kali ? (
          <View style={[styles.flag, styles.offFlag]}>
            <Text variant="caption" color={colors.onPrimary} style={styles.offText}>
              Ofa kali
            </Text>
          </View>
        ) : null}
        <View style={styles.heart}>
          <WishlistButton productId={product.id} name={product.name} size={34} />
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="smallMedium" color={colors.ink} numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        {/* Always one line tall so tiles in a row keep the same height. */}
        <View style={styles.seller}>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.sellerName}>
            {product.vendor?.name ?? 'AGIZA'}
          </Text>
          {product.vendor?.verified !== false ? <VerifiedMark size={11} /> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price} color={colors.ink} numberOfLines={1}>
            {hasRange ? `From ${money(product.price)}` : money(product.price)}
          </Text>
        </View>
        {/* Reserved even without a discount or reviews, for the same reason. */}
        <View style={styles.meta}>
          {discount ? (
            <Text variant="caption" color={colors.textSubtle} style={styles.strike} numberOfLines={1}>
              {money(discount)}
            </Text>
          ) : (
            <RatingInline rating={product.rating} count={product.rating_count} />
          )}
        </View>
        <StockRow product={product} />
      </View>
    </Pressable>
  );
}

const TILE_PAD = 6;

const styles = themed(() => ({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: TILE_PAD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  imageWrap: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  flag: { position: 'absolute', top: space.sm, left: space.sm },
  offFlag: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  offText: { fontFamily: fonts.bold },
  heart: { position: 'absolute', top: 6, right: 6 },
  body: { paddingHorizontal: 6, paddingTop: space.sm, paddingBottom: 4, gap: 3 },
  name: { minHeight: 36, fontSize: 14, lineHeight: 18 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  sellerName: { flexShrink: 1 },
  priceRow: { marginTop: 4 },
  price: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  meta: { height: 14, justifyContent: 'center' },
  strike: { textDecorationLine: 'line-through' },
  stock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 26, marginTop: 2 },
  stockText: { flexShrink: 1 },
  stockStrong: { fontFamily: fonts.semibold },
  request: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    minWidth: 76,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.hero,
  },
  requestText: { fontFamily: fonts.semibold, fontSize: 12 },
}));
