import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ProductGrid } from '@/components/product-grid';
import { RatingInline } from '@/components/rating';
import { SearchField } from '@/components/search-field';
import { StoreAvatar, StoreName } from '@/components/store';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import type { Store } from '@/lib/api/types';
import { keys } from '@/lib/query';
import { colors, radius, shadow, space, themed } from '@/theme/tokens';

const AVATAR = 72;

function StoreHeader({ store, onSearch }: { store: Store; onSearch: (value: string) => void }) {
  const count = store.products_count;
  return (
    <View style={styles.header}>
      <View style={styles.hero}>
        {store.banner ? (
          <Image source={{ uri: store.banner }} style={styles.banner} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.banner, styles.bannerBrand]}>
            <View style={styles.bannerGlow} />
          </View>
        )}
        <View style={styles.avatarWrap}>
          <StoreAvatar seller={store} size={AVATAR} />
        </View>
      </View>

      <View style={styles.info}>
        <StoreName seller={store} variant="title" />
        <View style={styles.meta}>
          {store.verified ? <Badge label={store.is_agiza ? 'Official store' : 'Verified seller'} tone="info" /> : null}
          <RatingInline rating={store.rating} count={store.rating_count} size={14} />
          {store.city ? (
            <View style={styles.inline}>
              <MapPin size={14} color={colors.textMuted} />
              <Text variant="small" color={colors.textMuted}>
                {store.city}
              </Text>
            </View>
          ) : null}
          {count !== null ? (
            <Text variant="small" color={colors.textMuted}>
              {count} product{count === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
        {store.description ? (
          <Text variant="body" color={colors.text}>
            {store.description}
          </Text>
        ) : null}
      </View>

      <SearchField
        placeholder={`Search in ${store.name}…`}
        accessibilityLabel={`Search products in ${store.name}`}
        onSearch={onSearch}
      />
    </View>
  );
}

/** One store: its details and its catalogue (GET products/?store=<slug>), searchable in-store. */
export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const store = useQuery({ queryKey: keys.store(slug), queryFn: () => shopApi.store(slug) });
  const [search, setSearch] = useState('');

  if (store.isLoading) return <Loading />;
  if (store.isError || !store.data) return <ErrorState error={store.error} onRetry={() => store.refetch()} />;

  return (
    <>
      <Stack.Screen options={{ title: store.data.name }} />
      <ProductGrid
        query={{ store: slug, search: search || undefined }}
        header={<StoreHeader store={store.data} onSearch={setSearch} />}
        emptyMessage={search ? 'Try another search in this store.' : 'This store has no products yet.'}
      />
    </>
  );
}

const styles = themed(() => ({
  header: { gap: space.lg, marginBottom: space.xs },
  hero: { paddingBottom: AVATAR / 2 },
  banner: { height: 132, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  bannerBrand: { backgroundColor: colors.brand },
  bannerGlow: {
    position: 'absolute',
    right: -40,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.amber,
    opacity: 0.55,
  },
  avatarWrap: {
    position: 'absolute',
    left: space.lg,
    bottom: 0,
    borderRadius: AVATAR / 2 + 3,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  info: { gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
}));
