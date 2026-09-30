import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Package } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { RatingInline } from '@/components/rating';
import { VerifiedMark } from '@/components/store';
import { WishlistButton } from '@/components/wishlist-button';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { ProductCard } from '@/lib/api/types';
import { money } from '@/lib/format';
import { colors, radius, shadow, space } from '@/theme/tokens';

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
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}

export function ProductTile({ product, width }: { product: ProductCard; width: number }) {
  const hasRange = product.price !== product.price_max;
  const discount =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? product.compare_at_price : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${money(product.price)}${product.vendor ? `, sold by ${product.vendor.name}` : ''}${
        product.rating_count ? `, rated ${product.rating} out of 5` : ''
      }`}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}>
      <View style={[styles.imageWrap, { height: width }]}>
        <ProductImage uri={product.image} />
        {!product.in_stock ? (
          <View style={styles.flag}>
            <Badge label="Out of stock" tone="neutral" />
          </View>
        ) : product.ofa_kali ? (
          <View style={styles.flag}>
            <Badge label="Ofa kali" tone="brand" />
          </View>
        ) : null}
        <View style={styles.heart}>
          <WishlistButton productId={product.id} name={product.name} size={32} />
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="smallMedium" color={colors.ink} numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        {/* Always one line tall so tiles in a row keep the same height. */}
        <View style={styles.seller}>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.sellerName}>
            {product.vendor?.name ?? ' '}
          </Text>
          {product.vendor?.verified ? <VerifiedMark size={11} /> : null}
        </View>
        {/* Reserved even without reviews, for the same reason. */}
        <View style={styles.rating}>
          <RatingInline rating={product.rating} count={product.rating_count} />
        </View>
        <Text variant="subheading" color={colors.ink}>
          {hasRange ? `From ${money(product.price)}` : money(product.price)}
        </Text>
        {discount ? (
          <Text variant="small" color={colors.textSubtle} style={styles.strike}>
            {money(discount)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  pressed: { opacity: 0.85 },
  imageWrap: { backgroundColor: '#F3F4F6' },
  fill: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: radius.md },
  flag: { position: 'absolute', top: space.sm, left: space.sm },
  heart: { position: 'absolute', top: space.sm, right: space.sm },
  rating: { height: 14, justifyContent: 'center' },
  body: { padding: space.md, gap: 4 },
  name: { minHeight: 36 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  sellerName: { flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
});
