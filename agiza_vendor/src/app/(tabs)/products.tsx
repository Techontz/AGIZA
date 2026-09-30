import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Package, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/search-field';
import { PrivateImage } from '@/components/seller/private-image';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerProduct } from '@/lib/api/types';
import { date, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { LISTING } from '@/lib/seller';
import { colors, radius, shadow, space } from '@/theme/tokens';

export default function ProductsScreen() {
  const { store } = useStore();
  const [search, setSearch] = useState('');
  const onSearch = useCallback((v: string) => setSearch(v), []);
  const list = useInfiniteQuery({
    queryKey: keys.products(search),
    queryFn: ({ pageParam }) => sellerApi.products({ search: search || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  const total = list.data?.pages[0]?.count;

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <SearchField placeholder="Search by name or SKU" accessibilityLabel="Search your products" onSearch={onSearch} />
      </View>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={[styles.list, !items.length && styles.grow]}
          ListHeaderComponent={
            <View style={styles.header}>
              <SuspendedBanner />
              {total !== undefined && items.length ? (
                <Text variant="small" color={colors.textMuted}>
                  {total} product{total === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
          }
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} colors={[colors.brand]} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={Package}
              title={search ? 'No products match' : 'No products yet'}
              message={search ? 'Try another name or SKU.' : 'Add your first product. AGIZA reviews it before it goes live.'}
            />
          }
          renderItem={({ item }) => <ProductRow product={item} />}
        />
      )}
      {store?.can_sell ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add product" onPress={() => router.push('/products/new')} style={styles.fab}>
          <Plus size={26} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ProductRow({ product: p }: { product: SellerProduct }) {
  const listing = LISTING[p.listing_state];
  return (
    <Card onPress={() => router.push({ pathname: '/products/[id]', params: { id: String(p.id) } })} style={styles.row}>
      <PrivateImage uri={p.image} style={styles.thumb} />
      <View style={styles.flex}>
        <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
          {p.name}
        </Text>
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {p.sku} · {p.category_name} · updated {date(p.updated_at)}
        </Text>
        <View style={styles.meta}>
          <Badge label={listing?.label ?? p.listing_state} tone={listing?.tone ?? 'neutral'} />
          <Text variant="caption" color={p.available <= 3 ? colors.warning : colors.textMuted}>
            {p.available} available
          </Text>
        </View>
      </View>
      <Text variant="subheading" color={colors.ink}>
        {money(p.price)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.md },
  header: { gap: space.sm },
  list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
  grow: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  flex: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    elevation: 5,
  },
});
