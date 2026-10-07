/** Seller / store building blocks shared by the tile, product page, cart, orders and store screens. */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { RatingInline } from '@/components/rating';
import { Text } from '@/components/ui/text';
import type { Seller, Store } from '@/lib/api/types';
import { colors, fonts, radius, shadow, space, themed, scheme } from '@/theme/tokens';

export function openStore(slug: string) {
  router.push({ pathname: '/store/[slug]', params: { slug } });
}

/** The store's logo; AGIZA shows its flame mark; anyone else without a logo gets an initial in brand colours. */
export function StoreAvatar({ seller, size = 40 }: { seller: Pick<Seller, 'name' | 'logo' | 'is_agiza'>; size?: number }) {
  const frame = { width: size, height: size, borderRadius: size / 2 };
  if (seller.logo) {
    return (
      <Image
        source={{ uri: seller.logo }}
        style={[styles.avatar, frame]}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (seller.is_agiza) {
    return (
      <View style={[styles.avatar, styles.agiza, frame]}>
        <Image
          source={scheme() === 'dark' ? require('@/assets/images/mark-dark.png') : require('@/assets/images/mark.png')}
          style={{ width: size * 0.42, height: size * 0.54 }}
          contentFit="contain"
        />
      </View>
    );
  }
  const initial = seller.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.avatar, styles.initial, frame]}>
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.42, lineHeight: size * 0.52 }} color={colors.primary}>
        {initial}
      </Text>
    </View>
  );
}

export function VerifiedMark({ size = 14 }: { size?: number }) {
  // A yellow AGIZA seal with a black tick, in both themes.
  return <BadgeCheck size={size} color="#121212" fill={colors.brand} strokeWidth={2} accessibilityLabel="Verified seller" />;
}

/** Store name with a verified tick, on one line. */
export function StoreName({
  seller,
  variant = 'subheading',
  color = colors.ink,
}: {
  seller: Pick<Seller, 'name' | 'verified'>;
  variant?: 'subheading' | 'bodyMedium' | 'smallMedium' | 'small' | 'heading' | 'title';
  color?: string;
}) {
  const tick = variant === 'title' || variant === 'heading' ? 18 : variant === 'small' || variant === 'smallMedium' ? 13 : 15;
  return (
    <View style={styles.nameRow}>
      <Text variant={variant} color={color} numberOfLines={1} style={styles.shrink}>
        {seller.name}
      </Text>
      {seller.verified ? <VerifiedMark size={tick} /> : null}
    </View>
  );
}

/** A row that opens the seller's store: used for "Sold by" and cart group headers. */
export function SellerRow({ seller, caption, avatarSize = 40 }: { seller: Seller; caption?: string; avatarSize?: number }) {
  const place = seller.is_agiza ? 'Official AGIZA store' : seller.city;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${caption ? `${caption} ` : ''}${seller.name}${seller.verified ? ', verified' : ''}. Open store`}
      onPress={() => openStore(seller.slug)}
      style={({ pressed }) => [styles.sellerRow, pressed && styles.pressed]}>
      <StoreAvatar seller={seller} size={avatarSize} />
      <View style={styles.flex}>
        {caption ? (
          <Text variant="caption" color={colors.textMuted}>
            {caption.toUpperCase()}
          </Text>
        ) : null}
        <StoreName seller={seller} variant="subheading" />
        {place ? (
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

function productsLabel(count: number | null) {
  if (count === null) return null;
  return `${count} product${count === 1 ? '' : 's'}`;
}

function ratedLabel(store: Store) {
  return store.rating_count && store.rating ? `, rated ${store.rating} out of 5` : '';
}

/** Full-width store row for the stores list. */
export function StoreListCard({ store }: { store: Store }) {
  const products = productsLabel(store.products_count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store.name}${store.verified ? ', verified' : ''}${store.city ? `, ${store.city}` : ''}${products ? `, ${products}` : ''}${ratedLabel(store)}`}
      onPress={() => openStore(store.slug)}
      style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}>
      <StoreAvatar seller={store} size={52} />
      <View style={[styles.flex, styles.listBody]}>
        <StoreName seller={store} />
        <View style={styles.metaRow}>
          <RatingInline rating={store.rating} count={store.rating_count} />
          {store.city ? (
            <View style={styles.meta}>
              <MapPin size={13} color={colors.textMuted} />
              <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                {store.city}
              </Text>
            </View>
          ) : null}
          {products ? (
            <Text variant="small" color={colors.textMuted}>
              {store.city ? '· ' : ''}
              {products}
            </Text>
          ) : null}
        </View>
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

/** Compact store card for horizontal rows (Home). */
export function StoreTile({ store, width }: { store: Store; width: number }) {
  const products = productsLabel(store.products_count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store.name}${store.verified ? ', verified' : ''}${products ? `, ${products}` : ''}${ratedLabel(store)}`}
      onPress={() => openStore(store.slug)}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}>
      <StoreAvatar seller={store} size={52} />
      <View style={styles.tileName}>
        <StoreName seller={store} variant="smallMedium" />
      </View>
      {/* One caption line either way, so tiles in the row keep the same height. */}
      {store.rating_count && store.rating ? (
        <RatingInline rating={store.rating} count={store.rating_count} />
      ) : (
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {store.city ?? products ?? ' '}
        </Text>
      )}
    </Pressable>
  );
}

const styles = themed(() => ({
  avatar: { backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  agiza: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initial: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  listBody: { gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  tile: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  tileName: { maxWidth: '100%', alignItems: 'center' },
}));
